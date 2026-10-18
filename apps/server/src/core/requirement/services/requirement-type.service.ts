import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx, executeTx } from '@docmost/db/utils';
import { RequirementType } from '@docmost/db/types/entity.types';
import {
  formatTypeKey,
  matchType,
  RequirementTypeDef,
  RequirementTypeProperty,
  splitKey,
  validateRequirement,
} from '../utils/requirement-type.util';
import { MAX_REQUIREMENT_SCAN } from './requirement-query.service';

const MAX_TYPES_PER_SPACE = 50;

export type ValidationContext = {
  types: RequirementTypeDef[];
  lockKeys: boolean;
  extraPrefixes: string[];
};

export type KeySuggestion = {
  keyPrefix: string;
  count: number;
  maxNumber: number;
};

@Injectable()
export class RequirementTypeService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private toDef(row: RequirementType): RequirementTypeDef {
    return {
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      // never let a malformed row break indexing
      properties: (Array.isArray(row.properties) ? row.properties : []).filter(
        (p: any) => p && typeof p.name === 'string',
      ) as RequirementTypeProperty[],
    };
  }

  async findById(typeId: string, workspaceId: string) {
    const row = await this.db
      .selectFrom('requirementTypes')
      .selectAll()
      .where('id', '=', typeId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Requirement type not found');
    return row;
  }

  async findBySpace(spaceId: string, trx?: KyselyTransaction) {
    return dbOrTx(this.db, trx)
      .selectFrom('requirementTypes')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .orderBy('keyPrefix')
      .execute();
  }

  async validationContext(
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<ValidationContext> {
    const db = dbOrTx(this.db, trx);
    const [types, settings] = await Promise.all([
      this.findBySpace(spaceId, trx),
      db
        .selectFrom('requirementSpaceSettings')
        .select(['keyPrefix', 'lockKeys'])
        .where('spaceId', '=', spaceId)
        .executeTakeFirst(),
    ]);
    return {
      types: types.map((t) => this.toDef(t)),
      lockKeys: !!settings?.lockKeys,
      extraPrefixes: settings ? [`${settings.keyPrefix}-`] : [],
    };
  }

  /** Types, plus prefixes in use that no type covers yet (key suggestions). */
  async list(spaceId: string) {
    const [types, settings, keys] = await Promise.all([
      this.findBySpace(spaceId),
      this.db
        .selectFrom('requirementSpaceSettings')
        .select(['keyPrefix', 'lockKeys'])
        .where('spaceId', '=', spaceId)
        .executeTakeFirst(),
      this.db
        .selectFrom('requirements')
        .select('key')
        .where('spaceId', '=', spaceId)
        .where('deletedAt', 'is', null)
        .limit(MAX_REQUIREMENT_SCAN)
        .execute(),
    ]);

    const covered = types.map((t) => ({ keyPrefix: t.keyPrefix }));
    const byPrefix = new Map<string, KeySuggestion>();
    for (const { key } of keys) {
      if (matchType(key, covered)) continue;
      const parts = splitKey(key);
      if (!parts) continue;
      const entry = byPrefix.get(parts.prefix) ?? {
        keyPrefix: parts.prefix,
        count: 0,
        maxNumber: 0,
      };
      entry.count++;
      entry.maxNumber = Math.max(entry.maxNumber, parts.number);
      byPrefix.set(parts.prefix, entry);
    }

    return {
      types,
      suggestions: [...byPrefix.values()].sort((a, b) => b.count - a.count),
      lockKeys: !!settings?.lockKeys,
      defaultPrefix: settings ? `${settings.keyPrefix}-` : null,
    };
  }

  private normalizeProperties(
    properties: RequirementTypeProperty[] | undefined,
  ): RequirementTypeProperty[] {
    const seen = new Set<string>();
    const out: RequirementTypeProperty[] = [];
    for (const p of properties ?? []) {
      const name = p.name?.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const options = [
        ...new Set((p.options ?? []).map((o) => o.trim()).filter(Boolean)),
      ];
      out.push({ name, required: !!p.required, ...(options.length ? { options } : {}) });
    }
    return out;
  }

  private normalizePrefix(prefix: string): string {
    const value = (prefix ?? '').trim().toUpperCase();
    if (!value || /[\s/\\]/.test(value) || /\d$/.test(value)) {
      throw new BadRequestException(
        'The key pattern must be a prefix without blanks or slashes that does not end with a digit, e.g. "FN-"',
      );
    }
    return value;
  }

  async create(
    data: {
      spaceId: string;
      name: string;
      keyPrefix: string;
      keyPadding?: number;
      nextSeq?: number;
      color?: string;
      properties?: RequirementTypeProperty[];
    },
    workspaceId: string,
  ) {
    const keyPrefix = this.normalizePrefix(data.keyPrefix);
    const count = await this.db
      .selectFrom('requirementTypes')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('spaceId', '=', data.spaceId)
      .executeTakeFirst();
    if (Number(count?.n ?? 0) >= MAX_TYPES_PER_SPACE) {
      throw new BadRequestException(
        `A space can have at most ${MAX_TYPES_PER_SPACE} requirement types`,
      );
    }
    const existing = await this.db
      .selectFrom('requirementTypes')
      .select('id')
      .where('spaceId', '=', data.spaceId)
      .where('keyPrefix', '=', keyPrefix)
      .executeTakeFirst();
    if (existing) {
      throw new BadRequestException(`A type already uses the prefix ${keyPrefix}`);
    }

    // continue after the highest number already used with this prefix
    const nextSeq =
      data.nextSeq ?? (await this.highestNumber(data.spaceId, keyPrefix)) + 1;

    const row = await this.db
      .insertInto('requirementTypes')
      .values({
        workspaceId,
        spaceId: data.spaceId,
        name: data.name.trim(),
        keyPrefix,
        keyPadding: data.keyPadding ?? 3,
        nextSeq,
        color: data.color ?? 'blue',
        properties: this.normalizeProperties(data.properties) as any,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.revalidate(data.spaceId);
    return row;
  }

  async update(
    type: RequirementType,
    data: {
      name?: string;
      keyPrefix?: string;
      keyPadding?: number;
      nextSeq?: number;
      color?: string;
      properties?: RequirementTypeProperty[];
    },
  ) {
    const keyPrefix =
      data.keyPrefix !== undefined ? this.normalizePrefix(data.keyPrefix) : undefined;
    if (keyPrefix && keyPrefix !== type.keyPrefix) {
      const clash = await this.db
        .selectFrom('requirementTypes')
        .select('id')
        .where('spaceId', '=', type.spaceId)
        .where('keyPrefix', '=', keyPrefix)
        .executeTakeFirst();
      if (clash) {
        throw new BadRequestException(`A type already uses the prefix ${keyPrefix}`);
      }
    }
    const row = await this.db
      .updateTable('requirementTypes')
      .set({
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(keyPrefix ? { keyPrefix } : {}),
        ...(data.keyPadding !== undefined ? { keyPadding: data.keyPadding } : {}),
        ...(data.nextSeq !== undefined ? { nextSeq: data.nextSeq } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.properties !== undefined
          ? {
              properties: this.normalizeProperties(data.properties) as any,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', type.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await this.revalidate(type.spaceId);
    return row;
  }

  async delete(type: RequirementType) {
    await this.db.deleteFrom('requirementTypes').where('id', '=', type.id).execute();
    await this.revalidate(type.spaceId);
  }

  private async highestNumber(spaceId: string, keyPrefix: string): Promise<number> {
    const rows = await this.db
      .selectFrom('requirements')
      .select('key')
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .where(sql<boolean>`upper(key) like ${keyPrefix.replace(/[\\%_]/g, '\\$&') + '%'}`)
      .execute();
    let max = 0;
    for (const { key } of rows) {
      if (!matchType(key, [{ keyPrefix }])) continue;
      max = Math.max(max, splitKey(key)?.number ?? 0);
    }
    return max;
  }

  /** Sets the next number to follow the highest key in use with the type's prefix. */
  async resetSequence(type: RequirementType) {
    const nextSeq = (await this.highestNumber(type.spaceId, type.keyPrefix)) + 1;
    return this.db
      .updateTable('requirementTypes')
      .set({ nextSeq, updatedAt: new Date() })
      .where('id', '=', type.id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async allocateKeys(type: RequirementType, count: number): Promise<string[]> {
    const row = await this.db
      .updateTable('requirementTypes')
      .set({ nextSeq: sql`next_seq + ${count}` })
      .where('id', '=', type.id)
      .returning([sql<number>`next_seq - ${count}`.as('firstSeq'), 'keyPrefix', 'keyPadding'])
      .executeTakeFirstOrThrow();
    return Array.from({ length: count }, (_, i) =>
      formatTypeKey(row.keyPrefix, Number(row.firstSeq) + i, row.keyPadding),
    );
  }

  async setLockKeys(spaceId: string, lockKeys: boolean) {
    const res = await this.db
      .updateTable('requirementSpaceSettings')
      .set({ lockKeys, updatedAt: new Date() })
      .where('spaceId', '=', spaceId)
      .executeTakeFirst();
    if (!Number(res.numUpdatedRows)) {
      throw new BadRequestException(
        'Set a requirement key prefix for the space before locking keys',
      );
    }
    await this.revalidate(spaceId);
  }

  /**
   * Re-checks the space's requirements (or only those of one type) against
   * their types and stores the result. Returns the counts by status.
   */
  async revalidate(spaceId: string, typeId?: string) {
    return executeTx(this.db, async (trx) => {
      const ctx = await this.validationContext(spaceId, trx);
      const only = typeId ? ctx.types.find((t) => t.id === typeId) : undefined;
      if (typeId && !only) throw new NotFoundException('Requirement type not found');

      const rows = await trx
        .selectFrom('requirements')
        .select(['id', 'key', 'properties'])
        .where('spaceId', '=', spaceId)
        .where('deletedAt', 'is', null)
        .limit(MAX_REQUIREMENT_SCAN)
        .execute();

      const counts = { valid: 0, warning: 0, error: 0, checked: 0 };
      for (const row of rows) {
        if (only && !matchType(row.key, [only])) continue;
        const result = validateRequirement(
          { key: row.key, properties: (row.properties ?? {}) as Record<string, string> },
          ctx.types,
          { lockKeys: ctx.lockKeys, extraPrefixes: ctx.extraPrefixes },
        );
        counts.checked++;
        if (result.status) counts[result.status]++;
        await trx
          .updateTable('requirements')
          .set({
            validationStatus: result.status,
            validationMessages: result.messages as any,
          })
          .where('id', '=', row.id)
          .execute();
      }
      return counts;
    });
  }
}
