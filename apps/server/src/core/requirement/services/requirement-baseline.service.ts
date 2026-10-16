import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx, executeTx } from '@docmost/db/utils';
import { RequirementBaseline, User } from '@docmost/db/types/entity.types';
import { RequirementBaselineRepo } from '../repos/requirement-baseline.repo';
import { RequirementRepo } from '../repos/requirement.repo';
import {
  BaselineSnapshotItem,
  diffBaselines,
} from '../utils/baseline-diff.util';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../../common/events/audit-events';

@Injectable()
export class RequirementBaselineService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly baselineRepo: RequirementBaselineRepo,
    private readonly requirementRepo: RequirementRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getBaseline(
    baselineId: string,
    workspaceId: string,
  ): Promise<RequirementBaseline> {
    const baseline = await this.baselineRepo.findById(baselineId, workspaceId);
    if (!baseline) throw new NotFoundException('Baseline not found');
    return baseline;
  }

  async list(spaceId: string) {
    return this.baselineRepo.findBySpaceId(spaceId);
  }

  /**
   * Snapshot every live, non-conflicting requirement in the space. Baselines
   * capture the whole space regardless of the creator's page restrictions so
   * that every baseline of a space is comparable.
   */
  async create(
    spaceId: string,
    name: string,
    description: string | undefined,
    user: User,
    workspaceId: string,
  ): Promise<RequirementBaseline> {
    const baseline = await executeTx(this.db, async (trx) => {
      await this.requirementRepo.lockSpace(spaceId, trx);
      const version = await this.baselineRepo.nextVersion(spaceId, trx);

      const created = await this.baselineRepo.insert(
        {
          workspaceId,
          spaceId,
          name: name.trim(),
          description: description?.trim() || null,
          version,
          creatorId: user.id,
        },
        trx,
      );

      const snapshot = await this.currentSnapshot(spaceId, trx);
      await this.baselineRepo.insertItems(
        snapshot.map((item) => ({
          baselineId: created.id,
          key: item.key,
          title: item.title,
          description: item.description,
          properties: item.properties,
          pageId: item.pageId,
          pageTitle: item.pageTitle,
          dependsOnKeys: item.dependsOnKeys,
        })),
        trx,
      );

      return created;
    });

    this.auditService.log({
      event: AuditEvent.REQUIREMENT_BASELINE_CREATED,
      resourceType: AuditResource.REQUIREMENT_BASELINE,
      resourceId: baseline.id,
      spaceId,
      metadata: { name: baseline.name, version: baseline.version },
    });

    return baseline;
  }

  async delete(baseline: RequirementBaseline) {
    await this.baselineRepo.softDelete(baseline.id);
    this.auditService.log({
      event: AuditEvent.REQUIREMENT_BASELINE_DELETED,
      resourceType: AuditResource.REQUIREMENT_BASELINE,
      resourceId: baseline.id,
      spaceId: baseline.spaceId,
      metadata: { name: baseline.name, version: baseline.version },
    });
  }

  async getItems(baselineId: string): Promise<BaselineSnapshotItem[]> {
    const items = await this.baselineRepo.findItems(baselineId);
    return items.map((i) => ({
      key: i.key,
      title: i.title,
      description: i.description,
      properties: (i.properties ?? {}) as Record<string, string>,
      pageId: i.pageId,
      pageTitle: i.pageTitle,
      dependsOnKeys: i.dependsOnKeys ?? [],
    }));
  }

  async compare(
    from: RequirementBaseline,
    to: RequirementBaseline | null,
  ) {
    const fromItems = await this.getItems(from.id);
    const toItems = to
      ? await this.getItems(to.id)
      : await this.currentSnapshot(from.spaceId);
    return diffBaselines(fromItems, toItems);
  }

  async currentSnapshot(
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<BaselineSnapshotItem[]> {
    const db = dbOrTx(this.db, trx);
    const rows = await db
      .selectFrom('requirements')
      .innerJoin('pages', 'pages.id', 'requirements.pageId')
      .select([
        'requirements.key',
        'requirements.title',
        'requirements.description',
        'requirements.properties',
        'requirements.pageId',
        'pages.title as pageTitle',
      ])
      .where('requirements.spaceId', '=', spaceId)
      .where('requirements.deletedAt', 'is', null)
      .where('requirements.isConflict', '=', false)
      .where('pages.deletedAt', 'is', null)
      .execute();

    const links = await db
      .selectFrom('requirementLinks')
      .select(['sourceKey', 'targetKey'])
      .where('sourceSpaceId', '=', spaceId)
      .where('sourceKey', 'is not', null)
      .execute();

    const deps = new Map<string, Set<string>>();
    for (const l of links) {
      if (!deps.has(l.sourceKey)) deps.set(l.sourceKey, new Set());
      deps.get(l.sourceKey).add(l.targetKey);
    }

    return rows.map((r) => ({
      key: r.key,
      title: r.title,
      description: r.description,
      properties: (r.properties ?? {}) as Record<string, string>,
      pageId: r.pageId,
      pageTitle: r.pageTitle,
      dependsOnKeys: [...(deps.get(r.key) ?? [])].sort(),
    }));
  }
}
