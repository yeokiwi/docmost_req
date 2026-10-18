import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  InsertableRequirementBaseline,
  InsertableRequirementBaselineItem,
  RequirementBaseline,
  RequirementBaselineItem,
} from '@docmost/db/types/entity.types';
import { dbOrTx } from '@docmost/db/utils';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

@Injectable()
export class RequirementBaselineRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<RequirementBaseline | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirementBaselines')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findBySpaceId(spaceId: string) {
    return this.db
      .selectFrom('requirementBaselines')
      .selectAll('requirementBaselines')
      .select((eb) => [
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'requirementBaselines.creatorId'),
        ).as('creator'),
        eb
          .selectFrom('requirementBaselineItems')
          .select((eb2) => eb2.fn.countAll<number>().as('count'))
          .whereRef(
            'requirementBaselineItems.baselineId',
            '=',
            'requirementBaselines.id',
          )
          .as('itemCount'),
      ])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('version', 'desc')
      .execute();
  }

  async nextVersion(spaceId: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .selectFrom('requirementBaselines')
      .select((eb) => eb.fn.max('version').as('maxVersion'))
      .where('spaceId', '=', spaceId)
      .executeTakeFirst();
    return Number(row?.maxVersion ?? 0) + 1;
  }

  async insert(
    insertable: InsertableRequirementBaseline,
    trx?: KyselyTransaction,
  ): Promise<RequirementBaseline> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('requirementBaselines')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async insertItems(
    items: InsertableRequirementBaselineItem[],
    trx?: KyselyTransaction,
  ) {
    if (items.length === 0) return;
    const db = dbOrTx(this.db, trx);
    // keep each statement well under the bind-parameter limit
    for (let i = 0; i < items.length; i += 500) {
      await db
        .insertInto('requirementBaselineItems')
        .values(items.slice(i, i + 500))
        .execute();
    }
  }

  async findItem(baselineId: string, key: string) {
    return this.db
      .selectFrom('requirementBaselineItems')
      .selectAll()
      .where('baselineId', '=', baselineId)
      .where('key', '=', key)
      .executeTakeFirst();
  }

  async findItems(baselineId: string): Promise<RequirementBaselineItem[]> {
    return this.db
      .selectFrom('requirementBaselineItems')
      .selectAll()
      .where('baselineId', '=', baselineId)
      .orderBy('key')
      .execute();
  }

  async softDelete(id: string, trx?: KyselyTransaction) {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('requirementBaselines')
      .set({ deletedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }
}
