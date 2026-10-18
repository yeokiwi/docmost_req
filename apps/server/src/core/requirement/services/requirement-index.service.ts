import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { InsertableRequirementLink } from '@docmost/db/types/entity.types';
import { RequirementRepo, SpaceKey } from '../repos/requirement.repo';
import { collectRequirementsFromPmJson } from '../utils/requirement-prosemirror.util';
import { validateRequirement } from '../utils/requirement-type.util';
import { RequirementTypeService } from './requirement-type.service';

@Injectable()
export class RequirementIndexService {
  private readonly logger = new Logger(RequirementIndexService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly requirementRepo: RequirementRepo,
    private readonly typeService: RequirementTypeService,
  ) {}

  /**
   * Bring the `requirements` and `requirement_links` rows for a page in line
   * with its current content. Idempotent; safe to run repeatedly.
   */
  async indexPage(pageId: string): Promise<void> {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'spaceId', 'workspaceId', 'content', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    // hard-deleted pages are cleaned up by FK cascades
    if (!page) return;

    const { requirements, refs } = page.deletedAt
      ? { requirements: [], refs: [] }
      : collectRequirementsFromPmJson(page.content);

    if (
      requirements.length === 0 &&
      refs.length === 0 &&
      !(await this.hasIndexedRows(pageId))
    ) {
      return;
    }

    const validRefSpaceIds = await this.resolveRefSpaces(
      page.workspaceId,
      refs.map((r) => r.spaceId).filter(Boolean),
    );

    // every reindex re-checks the page's requirements against their types
    const validation = await this.typeService.validationContext(page.spaceId);
    const validate = (snap: (typeof requirements)[number]) => {
      const result = validateRequirement(snap, validation.types, {
        lockKeys: validation.lockKeys,
        extraPrefixes: validation.extraPrefixes,
      });
      return {
        validationStatus: result.status,
        validationMessages: result.messages as any,
      };
    };

    await executeTx(this.db, async (trx) => {
      await this.requirementRepo.lockSpace(page.spaceId, trx);

      const existing = await this.requirementRepo.findByPageId(pageId, trx);
      const existingByNode = new Map(existing.map((r) => [r.nodeId, r]));
      const seenNodeIds = new Set<string>();
      const freed: SpaceKey[] = [];

      for (const snap of requirements) {
        seenNodeIds.add(snap.nodeId);
        const row = existingByNode.get(snap.nodeId);

        const owner = await this.requirementRepo.findOwner(
          page.spaceId,
          snap.key,
          trx,
        );
        const isConflict = !!owner && owner.id !== row?.id;

        if (row) {
          if (
            !row.deletedAt &&
            (row.key !== snap.key || row.spaceId !== page.spaceId)
          ) {
            freed.push({ spaceId: row.spaceId, key: row.key });
          }
          await this.requirementRepo.update(
            row.id,
            {
              spaceId: page.spaceId,
              key: snap.key,
              title: snap.title,
              description: snap.description,
              properties: snap.properties,
              isConflict,
              deletedAt: null,
              ...validate(snap),
            },
            trx,
          );
        } else {
          await this.requirementRepo.insert(
            {
              workspaceId: page.workspaceId,
              spaceId: page.spaceId,
              pageId,
              nodeId: snap.nodeId,
              key: snap.key,
              title: snap.title,
              description: snap.description,
              properties: snap.properties,
              isConflict,
              ...validate(snap),
            },
            trx,
          );
        }
      }

      const removed = existing.filter(
        (r) => !seenNodeIds.has(r.nodeId) && !r.deletedAt,
      );
      await this.requirementRepo.softDeleteByIds(
        removed.map((r) => r.id),
        trx,
      );
      for (const r of removed) {
        if (!r.isConflict) freed.push({ spaceId: r.spaceId, key: r.key });
      }

      await this.requirementRepo.promoteConflicts(freed, trx);

      const links: InsertableRequirementLink[] = refs.map((ref) => ({
        workspaceId: page.workspaceId,
        sourcePageId: pageId,
        sourceSpaceId: page.spaceId,
        sourceKey: ref.sourceKey,
        targetSpaceId:
          ref.spaceId && validRefSpaceIds.has(ref.spaceId)
            ? ref.spaceId
            : page.spaceId,
        targetKey: ref.key,
        nodeId: ref.nodeId,
        relation: ref.relation,
      }));
      await this.requirementRepo.replaceLinksForPage(pageId, links, trx);
    });

    this.logger.debug(
      `Indexed page ${pageId}: ${requirements.length} requirements, ${refs.length} refs`,
    );
  }

  private async hasIndexedRows(pageId: string): Promise<boolean> {
    const req = await this.db
      .selectFrom('requirements')
      .select('id')
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .limit(1)
      .executeTakeFirst();
    if (req) return true;
    const link = await this.db
      .selectFrom('requirementLinks')
      .select('id')
      .where('sourcePageId', '=', pageId)
      .limit(1)
      .executeTakeFirst();
    return !!link;
  }

  private async resolveRefSpaces(
    workspaceId: string,
    spaceIds: string[],
  ): Promise<Set<string>> {
    const unique = [...new Set(spaceIds)];
    if (unique.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('id', 'in', unique)
      .execute();
    return new Set(rows.map((r) => r.id));
  }
}
