import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('requirement_space_settings')
    .ifNotExists()
    .addColumn('space_id', 'uuid', (col) =>
      col.primaryKey().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('key_prefix', 'text', (col) => col.notNull())
    .addColumn('next_seq', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('key_padding', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('property_schema', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_requirement_space_settings_prefix', [
      'workspace_id',
      'key_prefix',
    ])
    .execute();

  await db.schema
    .createTable('requirements')
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
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('node_id', 'text', (col) => col.notNull())
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('properties', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('is_conflict', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('tsv', sql`tsvector`)
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .addUniqueConstraint('uq_requirements_page_node', ['page_id', 'node_id'])
    .execute();

  // a key is owned by exactly one live definition per space
  await db.schema
    .createIndex('uq_requirements_space_key_active')
    .on('requirements')
    .columns(['space_id', 'key'])
    .where(sql.ref('deleted_at'), 'is', null)
    .where(sql.ref('is_conflict'), '=', false)
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_requirements_space_key')
    .on('requirements')
    .columns(['space_id', 'key'])
    .execute();

  await sql`CREATE INDEX idx_requirements_tsv ON requirements USING GIN (tsv)`.execute(
    db,
  );
  await sql`CREATE INDEX idx_requirements_properties ON requirements USING GIN (properties jsonb_path_ops)`.execute(
    db,
  );

  await sql`
    CREATE OR REPLACE FUNCTION requirements_tsvector_trigger() RETURNS trigger AS $$
    begin
        new.tsv :=
                  setweight(to_tsvector('simple', coalesce(new.key, '')), 'A') ||
                  setweight(to_tsvector('english', f_unaccent(coalesce(new.title, ''))), 'A') ||
                  setweight(to_tsvector('english', f_unaccent(substring(coalesce(new.description, ''), 1, 100000))), 'B');
        return new;
    end;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    CREATE TRIGGER requirements_tsvector_update
    BEFORE INSERT OR UPDATE OF key, title, description ON requirements
    FOR EACH ROW EXECUTE FUNCTION requirements_tsvector_trigger();
  `.execute(db);

  // Links are keyed by (space, key) rather than requirement id so they
  // survive a requirement being moved to another page.
  await db.schema
    .createTable('requirement_links')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('source_page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('source_space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    // set when the reference sits inside a requirement block
    .addColumn('source_key', 'text')
    .addColumn('target_space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('target_key', 'text', (col) => col.notNull())
    .addColumn('node_id', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uq_requirement_links_page_node', [
      'source_page_id',
      'node_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_requirement_links_target')
    .on('requirement_links')
    .columns(['target_space_id', 'target_key'])
    .execute();

  await db.schema
    .createIndex('idx_requirement_links_source_key')
    .on('requirement_links')
    .columns(['source_space_id', 'source_key'])
    .execute();

  await db.schema
    .createTable('requirement_baselines')
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
    .addColumn('description', 'text')
    .addColumn('version', 'integer', (col) => col.notNull())
    .addColumn('creator_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .addUniqueConstraint('uq_requirement_baselines_space_version', [
      'space_id',
      'version',
    ])
    .execute();

  await db.schema
    .createTable('requirement_baseline_items')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('baseline_id', 'uuid', (col) =>
      col.references('requirement_baselines.id').onDelete('cascade').notNull(),
    )
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('properties', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('page_title', 'text')
    .addColumn('depends_on_keys', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'::text[]`),
    )
    .addUniqueConstraint('uq_requirement_baseline_items_key', [
      'baseline_id',
      'key',
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('requirement_baseline_items').ifExists().execute();
  await db.schema.dropTable('requirement_baselines').ifExists().execute();
  await db.schema.dropTable('requirement_links').ifExists().execute();
  await db.schema.dropTable('requirements').ifExists().execute();
  await sql`DROP FUNCTION IF EXISTS requirements_tsvector_trigger()`.execute(
    db,
  );
  await db.schema.dropTable('requirement_space_settings').ifExists().execute();
}
