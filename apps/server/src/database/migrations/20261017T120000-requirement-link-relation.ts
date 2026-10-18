import { type Kysely } from 'kysely';

// name of the relationship a link represents, taken from the table column title
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('requirement_links')
    .addColumn('relation', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('requirement_links')
    .dropColumn('relation')
    .execute();
}
