import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import {
  InsertableRequirementSpaceSetting,
  RequirementSpaceSetting,
  UpdatableRequirementSpaceSetting,
} from '@docmost/db/types/entity.types';
import { dbOrTx } from '@docmost/db/utils';

@Injectable()
export class RequirementSettingsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findBySpaceId(
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<RequirementSpaceSetting | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirementSpaceSettings')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .executeTakeFirst();
  }

  async findByPrefix(
    workspaceId: string,
    keyPrefix: string,
    trx?: KyselyTransaction,
  ): Promise<RequirementSpaceSetting | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('requirementSpaceSettings')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('keyPrefix', '=', keyPrefix)
      .executeTakeFirst();
  }

  async insert(
    insertable: InsertableRequirementSpaceSetting,
    trx?: KyselyTransaction,
  ): Promise<RequirementSpaceSetting> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('requirementSpaceSettings')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    spaceId: string,
    updatable: UpdatableRequirementSpaceSetting,
    trx?: KyselyTransaction,
  ): Promise<RequirementSpaceSetting> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('requirementSpaceSettings')
      .set({ ...updatable, updatedAt: new Date() })
      .where('spaceId', '=', spaceId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Atomically reserves `count` sequence numbers and returns the first one.
   */
  async reserveSequence(
    spaceId: string,
    count: number,
    trx?: KyselyTransaction,
  ): Promise<{ firstSeq: number; keyPrefix: string; keyPadding: number }> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .updateTable('requirementSpaceSettings')
      .set({ nextSeq: sql`next_seq + ${count}` })
      .where('spaceId', '=', spaceId)
      .returning([
        sql<number>`next_seq - ${count}`.as('firstSeq'),
        'keyPrefix',
        'keyPadding',
      ])
      .executeTakeFirst();
    return row as any;
  }

  /**
   * Make sure future allocations never reuse a sequence number that was
   * brought in by an import.
   */
  async ensureSequenceAbove(
    spaceId: string,
    seq: number,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('requirementSpaceSettings')
      .set({ nextSeq: sql`greatest(next_seq, ${seq + 1})` })
      .where('spaceId', '=', spaceId)
      .execute();
  }
}
