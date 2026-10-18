import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // a requirement type: a named key pattern with its own sequence, the
  // properties its requirements must (or should) have, and a table template
  await db.schema
    .createTable('requirement_types')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('key_prefix', 'text', (col) => col.notNull())
    .addColumn('next_seq', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('key_padding', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('color', 'text', (col) => col.notNull().defaultTo('blue'))
    .addColumn('properties', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_requirement_types_space_prefix', [
      'space_id',
      'key_prefix',
    ])
    .execute();

  // when set, only keys matching a requirement type may be inserted
  await db.schema
    .alterTable('requirement_space_settings')
    .addColumn('lock_keys', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute();

  // result of checking a requirement against its type
  await db.schema
    .alterTable('requirements')
    .addColumn('validation_status', 'text')
    .addColumn('validation_messages', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('requirements')
    .dropColumn('validation_messages')
    .dropColumn('validation_status')
    .execute();
  await db.schema
    .alterTable('requirement_space_settings')
    .dropColumn('lock_keys')
    .execute();
  await db.schema.dropTable('requirement_types').ifExists().execute();
}
