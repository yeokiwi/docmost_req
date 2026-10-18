import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { Requirement } from '@docmost/db/types/entity.types';
import { RequirementFilterDto } from '../dto/requirement.dto';
import {
  parseRequirementQuery,
  QueryClause,
  toLikePattern,
} from '../utils/requirement-query.parser';

// Upper bound on rows scanned per query before page-access filtering.
export const MAX_REQUIREMENT_SCAN = 5000;
export const MAX_MATRIX_SIDE = 300;

export type RequirementListItem = {
  id: string;
  spaceId: string;
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
  pageId: string;
  nodeId: string;
  isConflict: boolean;
  validationStatus: 'valid' | 'warning' | 'error' | null;
  validationMessages: Array<{ level: string; property?: string; message: string }>;
  createdAt: Date;
  updatedAt: Date;
  pageTitle: string | null;
  pageSlugId: string;
  referenceCount: number;
  dependsOn: string[];
};

@Injectable()
export class RequirementQueryService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  /** One search clause as a SQL condition on the current requirement row. */
  private clauseSql(clause: QueryClause) {
    const negate = clause.op === '!=' || clause.op === '!~';
    const pattern = clause.op === '~' || clause.op === '!~';
    const value = clause.value;
    // = compares case-insensitively; ~ is a LIKE pattern where % is the wildcard
    const match = (column: any) =>
      pattern
        ? sql<boolean>`${column} ilike ${toLikePattern(value)}`
        : sql<boolean>`lower(${column}) = lower(${value})`;

    let condition;
    switch (clause.field.kind) {
      case 'key':
        condition = match(sql.ref('requirements.key'));
        break;
      case 'title':
        condition = match(sql.ref('requirements.title'));
        break;
      case 'page':
        condition = match(sql.ref('pages.title'));
        break;
      case 'text': {
        // text searches the title and description; = means "contains"
        const like = pattern ? toLikePattern(value) : `%${toLikePattern(value)}%`;
        condition = sql<boolean>`(${sql.ref('requirements.title')} ilike ${like} or ${sql.ref('requirements.description')} ilike ${like})`;
        break;
      }
      case 'property':
        condition = match(sql`(${sql.ref('requirements.properties')} ->> ${clause.field.name})`);
        break;
      case 'to':
      case 'from': {
        const rel = clause.field.relation;
        const relation = rel
          ? sql`and lower(rl.relation) = lower(${rel})`
          : sql``;
        // TO/PARENT: rows that reference the value; FROM/CHILD: rows the value references
        condition =
          clause.field.kind === 'to'
            ? sql<boolean>`exists (
                select 1 from requirement_links rl
                where rl.source_space_id = ${sql.ref('requirements.spaceId')}
                  and rl.source_key = ${sql.ref('requirements.key')}
                  and ${match(sql.ref('rl.target_key'))} ${relation})`
            : sql<boolean>`exists (
                select 1 from requirement_links rl
                where rl.target_space_id = ${sql.ref('requirements.spaceId')}
                  and rl.target_key = ${sql.ref('requirements.key')}
                  and ${match(sql.ref('rl.source_key'))} ${relation})`;
        break;
      }
    }
    return negate ? sql<boolean>`not coalesce(${condition}, false)` : condition;
  }

  private buildQuery(spaceId: string, filter: RequirementFilterDto = {}) {
    let query = this.db
      .selectFrom('requirements')
      .innerJoin('pages', 'pages.id', 'requirements.pageId')
      .select([
        'requirements.id',
        'requirements.spaceId',
        'requirements.key',
        'requirements.title',
        'requirements.description',
        'requirements.properties',
        'requirements.pageId',
        'requirements.nodeId',
        'requirements.isConflict',
        'requirements.validationStatus',
        'requirements.validationMessages',
        'requirements.createdAt',
        'requirements.updatedAt',
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
      ])
      .select((eb) => [
        eb
          .selectFrom('requirementLinks')
          .select((eb2) => eb2.fn.countAll<number>().as('c'))
          .whereRef(
            'requirementLinks.targetSpaceId',
            '=',
            'requirements.spaceId',
          )
          .whereRef('requirementLinks.targetKey', '=', 'requirements.key')
          .as('referenceCount'),
        sql<string[]>`coalesce((
          select array_agg(distinct rl.target_key order by rl.target_key)
          from requirement_links rl
          where rl.source_space_id = ${sql.ref('requirements.spaceId')}
            and rl.source_key = ${sql.ref('requirements.key')}
        ), '{}')`.as('dependsOn'),
      ])
      .where('requirements.spaceId', '=', spaceId)
      .where('requirements.deletedAt', 'is', null)
      .where('pages.deletedAt', 'is', null);

    const text = filter.text?.trim();
    if (text) {
      const like = `%${text.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('requirements.key', 'ilike', like),
          eb('requirements.title', 'ilike', like),
          sql<boolean>`${sql.ref('requirements.tsv')} @@ websearch_to_tsquery('english', f_unaccent(${text}))`,
        ]),
      );
    }

    const prefix = filter.keyPrefix?.trim();
    if (prefix) {
      const like = `${prefix.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      query = query.where('requirements.key', 'ilike', like);
    }

    if (filter.keys?.length) {
      query = query.where(
        'requirements.key',
        'in',
        filter.keys.map((k) => k.toUpperCase()),
      );
    }

    const properties = this.cleanProperties(filter.properties);
    if (Object.keys(properties).length > 0) {
      query = query.where(
        sql<boolean>`${sql.ref('requirements.properties')} @> ${JSON.stringify(properties)}::text::jsonb`,
      );
    }

    if (filter.pageId) {
      query = query.where('requirements.pageId', '=', filter.pageId);
    }

    if (filter.query?.trim()) {
      let clauses: QueryClause[];
      try {
        clauses = parseRequirementQuery(filter.query);
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
      for (const clause of clauses) {
        query = query.where(this.clauseSql(clause));
      }
    }

    if (filter.validation === 'error' || filter.validation === 'warning' || filter.validation === 'valid') {
      query = query.where('requirements.validationStatus', '=', filter.validation);
    } else if (filter.validation === 'issues') {
      query = query.where('requirements.validationStatus', 'in', ['error', 'warning']);
    }

    if (filter.coverage === 'covered' || filter.coverage === 'uncovered') {
      const exists = sql<boolean>`exists (
        select 1 from requirement_links rl
        where rl.target_space_id = ${sql.ref('requirements.spaceId')}
          and rl.target_key = ${sql.ref('requirements.key')}
      )`;
      query = query.where(
        filter.coverage === 'covered' ? exists : sql<boolean>`not ${exists}`,
      );
    }

    return query
      .orderBy(sql`substring(${sql.ref('requirements.key')} from '^(.*)-')`)
      .orderBy(
        sql`nullif(substring(${sql.ref('requirements.key')} from '-([0-9]+)$'), '')::bigint`,
      )
      .orderBy('requirements.key')
      .orderBy('requirements.isConflict')
      .orderBy('requirements.createdAt');
  }

  private cleanProperties(
    properties?: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (!properties || typeof properties !== 'object') return out;
    for (const [k, v] of Object.entries(properties)) {
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const value = String(v).trim();
      if (k.trim() && value) out[k.trim()] = value;
    }
    return out;
  }

  private async filterAccessible<T extends { pageId: string }>(
    rows: T[],
    userId: string,
    spaceId: string,
  ): Promise<T[]> {
    const pageIds = [...new Set(rows.map((r) => r.pageId))];
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds,
        userId,
        spaceId,
      }),
    );
    return rows.filter((r) => accessible.has(r.pageId));
  }

  async findAll(
    spaceId: string,
    filter: RequirementFilterDto | undefined,
    userId: string,
  ): Promise<RequirementListItem[]> {
    const rows = await this.buildQuery(spaceId, filter)
      .limit(MAX_REQUIREMENT_SCAN)
      .execute();
    const items = rows.map((r) => ({
      ...r,
      properties: (r.properties ?? {}) as Record<string, string>,
      referenceCount: Number(r.referenceCount ?? 0),
    })) as unknown as RequirementListItem[];
    return this.filterAccessible(items, userId, spaceId);
  }

  async list(
    spaceId: string,
    filter: RequirementFilterDto | undefined,
    userId: string,
    limit = 50,
    offset = 0,
  ) {
    const all = await this.findAll(spaceId, filter, userId);
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
      truncated: all.length >= MAX_REQUIREMENT_SCAN,
    };
  }

  async getDetail(requirement: Requirement, userId: string) {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'slugId', 'spaceId'])
      .where('id', '=', requirement.pageId)
      .executeTakeFirst();

    const incoming = await this.db
      .selectFrom('requirementLinks')
      .innerJoin('pages', 'pages.id', 'requirementLinks.sourcePageId')
      .select([
        'requirementLinks.sourcePageId',
        'requirementLinks.sourceSpaceId',
        'requirementLinks.sourceKey',
        'requirementLinks.relation',
        'pages.title as pageTitle',
        'pages.slugId as pageSlugId',
      ])
      .where('requirementLinks.targetSpaceId', '=', requirement.spaceId)
      .where('requirementLinks.targetKey', '=', requirement.key)
      .where('pages.deletedAt', 'is', null)
      .execute();

    const outgoing = await this.db
      .selectFrom('requirementLinks')
      .leftJoin('requirements as target', (join) =>
        join
          .onRef('target.spaceId', '=', 'requirementLinks.targetSpaceId')
          .onRef('target.key', '=', 'requirementLinks.targetKey')
          .on('target.deletedAt', 'is', null)
          .on('target.isConflict', '=', false),
      )
      .select([
        'requirementLinks.targetSpaceId',
        'requirementLinks.targetKey',
        'target.id as targetId',
        'target.title as targetTitle',
        'target.pageId as targetPageId',
        'requirementLinks.relation',
      ])
      .where('requirementLinks.sourceSpaceId', '=', requirement.spaceId)
      .where('requirementLinks.sourceKey', '=', requirement.key)
      .execute();

    const sourcePageIds = [...new Set(incoming.map((l) => l.sourcePageId))];
    const accessibleSources = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: sourcePageIds,
        userId,
      }),
    );

    const dedupe = new Map<string, (typeof incoming)[number]>();
    for (const link of incoming) {
      if (!accessibleSources.has(link.sourcePageId)) continue;
      dedupe.set(
        `${link.sourcePageId}:${link.sourceKey ?? ''}:${link.relation ?? ''}`,
        link,
      );
    }

    const visibleIncoming = [...dedupe.values()];

    return {
      requirement,
      page,
      referencedByPages: visibleIncoming.filter((l) => !l.sourceKey),
      referencedByRequirements: visibleIncoming.filter((l) => !!l.sourceKey),
      dependsOn: [
        ...new Map(
          outgoing.map((o) => [
            `${o.targetSpaceId}:${o.targetKey}:${o.relation ?? ''}`,
            o,
          ]),
        ).values(),
      ],
    };
  }

  async findOwnerByKey(spaceId: string, key: string) {
    return this.db
      .selectFrom('requirements')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('key', '=', key.toUpperCase())
      .where('deletedAt', 'is', null)
      .where('isConflict', '=', false)
      .executeTakeFirst();
  }

  /**
   * Rows reference columns: a cell is set when the row requirement's block
   * contains a reference to the column requirement.
   */
  async traceability(
    spaceId: string,
    rowFilter: RequirementFilterDto | undefined,
    columnFilter: RequirementFilterDto | undefined,
    userId: string,
  ) {
    const rows = (await this.findAll(spaceId, rowFilter, userId)).slice(
      0,
      MAX_MATRIX_SIDE,
    );
    const columns = (await this.findAll(spaceId, columnFilter, userId)).slice(
      0,
      MAX_MATRIX_SIDE,
    );

    const colKeys = new Set(columns.map((c) => c.key));

    const cells: Array<[string, string]> = [];
    for (const row of rows) {
      for (const dep of row.dependsOn ?? []) {
        if (colKeys.has(dep)) cells.push([row.key, dep]);
      }
    }

    // named relationships (table column titles) between row and column requirements
    const cellRelations: Array<[string, string, string]> = [];
    if (rows.length && colKeys.size) {
      const named = await this.db
        .selectFrom('requirementLinks')
        .select([
          'requirementLinks.sourceKey',
          'requirementLinks.targetKey',
          'requirementLinks.relation',
        ])
        .where('requirementLinks.sourceSpaceId', '=', spaceId)
        .where('requirementLinks.targetSpaceId', '=', spaceId)
        .where(
          'requirementLinks.sourceKey',
          'in',
          rows.map((r) => r.key),
        )
        .where('requirementLinks.relation', 'is not', null)
        .execute();
      const seenRel = new Set<string>();
      for (const n of named) {
        if (!n.sourceKey || !n.relation || !colKeys.has(n.targetKey)) continue;
        const id = `${n.sourceKey}|${n.targetKey}`;
        if (seenRel.has(id)) continue;
        seenRel.add(id);
        cellRelations.push([n.sourceKey, n.targetKey, n.relation]);
      }
    }

    // pages that reference a row requirement outside any requirement block
    const rowKeys = rows.map((r) => r.key);
    const pageRefs: Array<{
      key: string;
      pageId: string;
      pageSlugId: string;
      pageTitle: string | null;
    }> = [];
    if (rowKeys.length) {
      const links = await this.db
        .selectFrom('requirementLinks')
        .innerJoin('pages', 'pages.id', 'requirementLinks.sourcePageId')
        .select([
          'requirementLinks.targetKey as key',
          'requirementLinks.sourcePageId as pageId',
          'pages.slugId as pageSlugId',
          'pages.title as pageTitle',
        ])
        .where('requirementLinks.targetSpaceId', '=', spaceId)
        .where('requirementLinks.targetKey', 'in', rowKeys)
        .where('requirementLinks.sourceKey', 'is', null)
        .where('pages.deletedAt', 'is', null)
        .execute();
      const accessible = new Set(
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds: [...new Set(links.map((l) => l.pageId))],
          userId,
        }),
      );
      const seen = new Set<string>();
      for (const l of links) {
        const id = `${l.key}:${l.pageId}`;
        if (!accessible.has(l.pageId) || seen.has(id)) continue;
        seen.add(id);
        pageRefs.push(l);
      }
    }

    const pick = (r: RequirementListItem) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      pageId: r.pageId,
      pageSlugId: r.pageSlugId,
      referenceCount: r.referenceCount,
    });

    return {
      rows: rows.map(pick),
      columns: columns.map(pick),
      cells,
      cellRelations,
      pageRefs,
      truncated:
        rows.length >= MAX_MATRIX_SIDE || columns.length >= MAX_MATRIX_SIDE,
    };
  }

  /**
   * Pages of the space whose links point to requirements that no longer
   * exist (deleted, or never defined), with the missing keys.
   */
  async brokenLinks(spaceId: string, userId: string) {
    const rows = await this.db
      .selectFrom('requirementLinks')
      .innerJoin('pages', 'pages.id', 'requirementLinks.sourcePageId')
      .select([
        'requirementLinks.sourcePageId as pageId',
        'requirementLinks.targetKey as key',
        'pages.title as title',
        'pages.slugId as slugId',
      ])
      .where('requirementLinks.sourceSpaceId', '=', spaceId)
      .where('pages.deletedAt', 'is', null)
      .where(
        sql<boolean>`not exists (
          select 1 from requirements r
          where r.space_id = ${sql.ref('requirementLinks.targetSpaceId')}
            and r.key = ${sql.ref('requirementLinks.targetKey')}
            and r.deleted_at is null
            and r.is_conflict = false
        )`,
      )
      .orderBy('pages.title')
      .limit(MAX_REQUIREMENT_SCAN)
      .execute();

    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(rows.map((r) => r.pageId))],
        userId,
        spaceId,
      }),
    );
    const byPage = new Map<
      string,
      { pageId: string; title: string | null; slugId: string; keys: string[] }
    >();
    for (const r of rows) {
      if (!accessible.has(r.pageId)) continue;
      const entry = byPage.get(r.pageId) ?? {
        pageId: r.pageId,
        title: r.title,
        slugId: r.slugId,
        keys: [],
      };
      if (!entry.keys.includes(r.key)) entry.keys.push(r.key);
      byPage.set(r.pageId, entry);
    }
    return [...byPage.values()];
  }

  /** Requirements whose key starts with `query`, across the given spaces. */
  async searchKeys(opts: {
    query: string;
    spaceIds: string[];
    preferSpaceId?: string;
    limit: number;
    userId: string;
  }) {
    if (!opts.spaceIds.length) return [];
    const rows = await this.db
      .selectFrom('requirements')
      .innerJoin('spaces', 'spaces.id', 'requirements.spaceId')
      .innerJoin('pages', 'pages.id', 'requirements.pageId')
      .select([
        'requirements.id',
        'requirements.key',
        'requirements.title',
        'requirements.spaceId',
        'requirements.pageId',
        'spaces.name as spaceName',
        'spaces.slug as spaceSlug',
      ])
      .where('requirements.spaceId', 'in', opts.spaceIds)
      .where('requirements.deletedAt', 'is', null)
      .where('requirements.isConflict', '=', false)
      .where('pages.deletedAt', 'is', null)
      .where(
        sql<boolean>`${sql.ref('requirements.key')} ilike ${toLikePattern(opts.query.trim()) + '%'}`,
      )
      .orderBy(
        sql`case when ${sql.ref('requirements.spaceId')} = ${opts.preferSpaceId ?? null} then 0 else 1 end`,
      )
      .orderBy('requirements.key')
      .limit(opts.limit * 3)
      .execute();

    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(rows.map((r) => r.pageId))],
        userId: opts.userId,
      }),
    );
    return rows.filter((r) => accessible.has(r.pageId)).slice(0, opts.limit);
  }
}
