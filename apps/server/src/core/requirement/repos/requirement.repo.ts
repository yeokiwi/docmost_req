import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  InsertableRequirement,
  InsertableRequirementLink,
  Requirement,
  UpdatableRequirement,
} from '@docmost/db/types/entity.types';
import { dbOrTx } from '@docmost/db/utils';

export type SpaceKey = { spaceId: string; key: string };

@Injectable()
export class RequirementRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<Requirement[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirements')
      .selectAll()
      .where('pageId', '=', pageId)
      .execute();
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Requirement | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirements')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  /**
   * The live, non-conflicting definition of a key in a space.
   */
  async findOwner(
    spaceId: string,
    key: string,
    trx?: KyselyTransaction,
  ): Promise<Requirement | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirements')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('key', '=', key)
      .where('deletedAt', 'is', null)
      .where('isConflict', '=', false)
      .executeTakeFirst();
  }

  async findActiveKeys(
    spaceId: string,
    keys: string[],
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    if (keys.length === 0) return [];
    const db = dbOrTx(this.db, trx);
    const rows = await db
      .selectFrom('requirements')
      .select('key')
      .where('spaceId', '=', spaceId)
      .where('key', 'in', keys)
      .where('deletedAt', 'is', null)
      .execute();
    return rows.map((r) => r.key);
  }

  async insert(
    insertable: InsertableRequirement,
    trx?: KyselyTransaction,
  ): Promise<Requirement> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('requirements')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    id: string,
    updatable: UpdatableRequirement,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('requirements')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async softDeleteByIds(ids: string[], trx?: KyselyTransaction) {
    if (ids.length === 0) return;
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('requirements')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', 'in', ids)
      .where('deletedAt', 'is', null)
      .execute();
  }

  /**
   * For each freed (space, key), promote the oldest conflicting definition
   * to owner if no live owner remains.
   */
  async promoteConflicts(freed: SpaceKey[], trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    for (const { spaceId, key } of freed) {
      const owner = await this.findOwner(spaceId, key, trx);
      if (owner) continue;

      const candidate = await db
        .selectFrom('requirements')
        .select('id')
        .where('spaceId', '=', spaceId)
        .where('key', '=', key)
        .where('deletedAt', 'is', null)
        .where('isConflict', '=', true)
        .orderBy('createdAt', 'asc')
        .orderBy('id', 'asc')
        .executeTakeFirst();

      if (candidate) {
        await this.update(candidate.id, { isConflict: false }, trx);
      }
    }
  }

  async lockSpace(spaceId: string, trx: KyselyTransaction) {
    await sql`SELECT pg_advisory_xact_lock(hashtext(${'requirements:' + spaceId}))`.execute(
      trx,
    );
  }

  async replaceLinksForPage(
    pageId: string,
    links: InsertableRequirementLink[],
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('requirementLinks')
      .where('sourcePageId', '=', pageId)
      .execute();
    if (links.length > 0) {
      await db
        .insertInto('requirementLinks')
        .values(links)
        .onConflict((oc) => oc.columns(['sourcePageId', 'nodeId']).doNothing())
        .execute();
    }
  }

  async findConflictNodeIds(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    const db = dbOrTx(this.db, trx);
    const rows = await db
      .selectFrom('requirements')
      .select('nodeId')
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .where('isConflict', '=', true)
      .execute();
    return rows.map((r) => r.nodeId);
  }
}
