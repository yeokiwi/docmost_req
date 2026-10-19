import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import { NotificationType } from '../notification/notification.constants';
import {
  ListVerificationsDto,
  PeriodUnit,
  SetupVerificationDto,
} from './page-verification.dto';
import {
  addPeriod,
  computeVerificationState,
  VerificationState,
} from './page-verification.util';

type VerificationRow = {
  id: string;
  pageId: string;
  workspaceId: string;
  spaceId: string;
  type: string;
  status: string | null;
  mode: string | null;
  periodAmount: number | null;
  periodUnit: string | null;
  verifiedAt: Date | null;
  verifiedById: string | null;
  expiresAt: Date | null;
  requestedAt: Date | null;
  requestedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  rejectionComment: string | null;
};

@Injectable()
export class PageVerificationService {
  private readonly logger = new Logger(PageVerificationService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  async loadPage(pageId: string, workspace: Workspace): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private findRow(pageId: string): Promise<VerificationRow | undefined> {
    return this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst() as Promise<VerificationRow | undefined>;
  }

  private async verifierIdsOf(verificationId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verificationId)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'asc')
      .execute();
    return rows.map((r) => r.userId);
  }

  private async canEdit(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user);
      return true;
    } catch {
      return false;
    }
  }

  private async isSpaceAdmin(spaceId: string, user: User): Promise<boolean> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  /** Verification details for the page header and modal. */
  async getInfo(page: Page, user: User) {
    await this.pageAccessService.validateCanView(page, user);
    const row = await this.findRow(page.id);
    const canManage = await this.canEdit(page, user);

    if (!row) {
      return { verification: null, permissions: { canManage, canVerify: false } };
    }

    const verifierIds = await this.verifierIdsOf(row.id);
    const userIds = [
      ...new Set(
        [
          ...verifierIds,
          row.verifiedById,
          row.requestedById,
          row.rejectedById,
        ].filter(Boolean) as string[],
      ),
    ];
    const users = userIds.length
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'avatarUrl', 'email'])
          .where('id', 'in', userIds)
          .execute()
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const pick = (id: string | null) => (id ? byId.get(id) ?? null : null);

    const state = computeVerificationState(row, page.updatedAt);
    const isVerifier = verifierIds.includes(user.id);

    return {
      verification: {
        id: row.id,
        pageId: row.pageId,
        type: row.type,
        status: row.status,
        state,
        periodAmount: row.periodAmount,
        periodUnit: row.periodUnit,
        verifiedAt: row.verifiedAt,
        verifiedBy: pick(row.verifiedById),
        expiresAt: row.expiresAt,
        requestedAt: row.requestedAt,
        requestedBy: pick(row.requestedById),
        rejectedAt: row.rejectedAt,
        rejectedBy: pick(row.rejectedById),
        rejectionComment: row.rejectionComment,
        verifiers: verifierIds.map((id) => byId.get(id)).filter(Boolean),
      },
      permissions: { canManage, canVerify: isVerifier },
    };
  }

  /** Creates or reconfigures the verification of a page. */
  async setup(page: Page, dto: SetupVerificationDto, user: User) {
    if (!(await this.canEdit(page, user))) {
      throw new ForbiddenException('You need edit access to configure verification');
    }

    const verifierIds = [...new Set(dto.verifierIds)];
    const withAccess = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      verifierIds,
      page.spaceId,
    );
    const missing = verifierIds.filter((id) => !withAccess.has(id));
    if (missing.length > 0) {
      throw new BadRequestException('Every verifier must be a member of this space');
    }

    const isExpiring = dto.type === 'expiring';
    const periodAmount = isExpiring ? dto.periodAmount ?? null : null;
    const periodUnit: PeriodUnit | null =
      isExpiring && periodAmount ? dto.periodUnit ?? 'month' : null;

    const existing = await this.findRow(page.id);

    await executeTx(this.db, async (trx) => {
      let verificationId: string;
      if (!existing) {
        const inserted = await trx
          .insertInto('pageVerifications')
          .values({
            pageId: page.id,
            workspaceId: page.workspaceId,
            spaceId: page.spaceId,
            type: dto.type,
            status: null,
            mode: periodAmount ? 'period' : 'indefinite',
            periodAmount,
            periodUnit,
            creatorId: user.id,
          })
          .returning('id')
          .executeTakeFirst();
        verificationId = inserted.id;
      } else {
        verificationId = existing.id;
        const typeChanged = existing.type !== dto.type;
        const values: Record<string, any> = {
          type: dto.type,
          mode: periodAmount ? 'period' : 'indefinite',
          periodAmount,
          periodUnit,
          updatedAt: new Date(),
        };
        if (typeChanged) {
          // a different workflow starts from scratch
          Object.assign(values, {
            status: null,
            verifiedAt: null,
            verifiedById: null,
            expiresAt: null,
            requestedAt: null,
            requestedById: null,
            rejectedAt: null,
            rejectedById: null,
            rejectionComment: null,
          });
        } else if (isExpiring && existing.verifiedAt) {
          // keep the current verification but re-derive its expiry
          values.expiresAt = periodAmount
            ? addPeriod(new Date(existing.verifiedAt), periodAmount, periodUnit)
            : null;
        }
        await trx
          .updateTable('pageVerifications')
          .set(values)
          .where('id', '=', verificationId)
          .execute();
        await trx
          .deleteFrom('pageVerifiers')
          .where('pageVerificationId', '=', verificationId)
          .execute();
      }

      await trx
        .insertInto('pageVerifiers')
        .values(
          verifierIds.map((userId, i) => ({
            pageVerificationId: verificationId,
            userId,
            isPrimary: i === 0,
            addedById: user.id,
          })),
        )
        .execute();
    });

    return this.getInfo(page, user);
  }

  async remove(page: Page, user: User) {
    if (!(await this.canEdit(page, user))) {
      throw new ForbiddenException();
    }
    await this.db
      .deleteFrom('pageVerifications')
      .where('pageId', '=', page.id)
      .execute();
  }

  private async requireRow(page: Page): Promise<VerificationRow> {
    const row = await this.findRow(page.id);
    if (!row) throw new BadRequestException('This page has no verification set up');
    return row;
  }

  private async requireVerifier(row: VerificationRow, user: User) {
    const verifierIds = await this.verifierIdsOf(row.id);
    if (!verifierIds.includes(user.id)) {
      throw new ForbiddenException('Only the assigned verifiers can do this');
    }
    return verifierIds;
  }

  /** Expiring type: a verifier confirms the page is accurate. */
  async verify(page: Page, user: User) {
    await this.pageAccessService.validateCanView(page, user);
    const row = await this.requireRow(page);
    if (row.type !== 'expiring') {
      throw new BadRequestException('Use approve for approval workflows');
    }
    const verifierIds = await this.requireVerifier(row, user);

    const now = new Date();
    const expiresAt =
      row.periodAmount && row.periodUnit
        ? addPeriod(now, row.periodAmount, row.periodUnit as PeriodUnit)
        : null;

    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'verified',
        verifiedAt: now,
        verifiedById: user.id,
        expiresAt,
        updatedAt: now,
      })
      .where('id', '=', row.id)
      .execute();

    // a fresh period: reminders for the previous one no longer apply
    await this.db
      .deleteFrom('notifications')
      .where('pageVerificationId', '=', row.id)
      .where('type', 'in', [
        NotificationType.PAGE_VERIFICATION_EXPIRING,
        NotificationType.PAGE_VERIFICATION_EXPIRED,
      ])
      .execute();

    this.queue(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: verifierIds.filter((id) => id !== user.id),
    });

    return this.getInfo(page, user);
  }

  /** Approval workflow: an editor submits the page to the approvers. */
  async requestApproval(page: Page, user: User) {
    if (!(await this.canEdit(page, user))) {
      throw new ForbiddenException();
    }
    const row = await this.requireRow(page);
    if (row.type !== 'qms') {
      throw new BadRequestException('This page uses expiring verification');
    }
    if (row.status === 'pending') {
      throw new BadRequestException('Approval has already been requested');
    }
    const verifierIds = await this.verifierIdsOf(row.id);
    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'pending',
        requestedAt: now,
        requestedById: user.id,
        rejectedAt: null,
        rejectedById: null,
        rejectionComment: null,
        updatedAt: now,
      })
      .where('id', '=', row.id)
      .execute();

    this.queue(QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: verifierIds.filter((id) => id !== user.id),
    });
    return this.getInfo(page, user);
  }

  async approve(page: Page, user: User) {
    await this.pageAccessService.validateCanView(page, user);
    const row = await this.requireRow(page);
    if (row.type !== 'qms') {
      throw new BadRequestException('Use verify for expiring verification');
    }
    const verifierIds = await this.requireVerifier(row, user);
    if (row.status !== 'pending') {
      throw new BadRequestException('Approval has not been requested');
    }
    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'approved',
        verifiedAt: now,
        verifiedById: user.id,
        updatedAt: now,
      })
      .where('id', '=', row.id)
      .execute();

    const notify = new Set(verifierIds.filter((id) => id !== user.id));
    if (row.requestedById && row.requestedById !== user.id) {
      notify.add(row.requestedById);
    }
    this.queue(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
      pageId: page.id,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      actorId: user.id,
      verifierIds: [...notify],
    });
    return this.getInfo(page, user);
  }

  async reject(page: Page, user: User, comment?: string) {
    await this.pageAccessService.validateCanView(page, user);
    const row = await this.requireRow(page);
    if (row.type !== 'qms') {
      throw new BadRequestException('Only approval workflows can be rejected');
    }
    await this.requireVerifier(row, user);
    if (row.status !== 'pending') {
      throw new BadRequestException('Approval has not been requested');
    }
    const now = new Date();
    await this.db
      .updateTable('pageVerifications')
      .set({
        status: 'rejected',
        rejectedAt: now,
        rejectedById: user.id,
        rejectionComment: comment?.trim() || null,
        updatedAt: now,
      })
      .where('id', '=', row.id)
      .execute();

    if (row.requestedById && row.requestedById !== user.id) {
      this.queue(QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION, {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: page.workspaceId,
        actorId: user.id,
        requestedById: row.requestedById,
        comment: comment?.trim() || undefined,
      });
    }
    return this.getInfo(page, user);
  }

  /** Verified pages overview: pages in spaces the user belongs to. */
  async list(user: User, workspace: Workspace, dto: ListVerificationsDto) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (spaceIds.length === 0) return { items: [] };
    if (dto.spaceId && !spaceIds.includes(dto.spaceId)) return { items: [] };

    const rows = await this.db
      .selectFrom('pageVerifications as v')
      .innerJoin('pages as p', 'p.id', 'v.pageId')
      .innerJoin('spaces as s', 's.id', 'v.spaceId')
      .leftJoin('users as u', 'u.id', 'v.verifiedById')
      .select([
        'v.id',
        'v.pageId',
        'v.spaceId',
        'v.type',
        'v.status',
        'v.verifiedAt',
        'v.expiresAt',
        'v.requestedAt',
        'p.title as pageTitle',
        'p.icon as pageIcon',
        'p.slugId as pageSlugId',
        'p.updatedAt as pageUpdatedAt',
        's.name as spaceName',
        's.slug as spaceSlug',
        'u.name as verifiedByName',
      ])
      .where('v.workspaceId', '=', workspace.id)
      .where('p.deletedAt', 'is', null)
      .where('v.spaceId', 'in', dto.spaceId ? [dto.spaceId] : spaceIds)
      .$if(!!dto.type, (qb) => qb.where('v.type', '=', dto.type))
      .orderBy('v.updatedAt', 'desc')
      .limit(500)
      .execute();

    // pages the user cannot open (page-level restrictions) are left out
    const visible: typeof rows = [];
    for (const r of rows) {
      const page = { id: r.pageId, spaceId: r.spaceId } as Page;
      try {
        await this.pageAccessService.validateCanView(page, user);
        visible.push(r);
      } catch {
        // not visible
      }
    }

    const items = visible.map((r) => ({
      ...r,
      state: computeVerificationState(r, r.pageUpdatedAt) as VerificationState,
    }));
    return {
      items: dto.state ? items.filter((i) => i.state === dto.state) : items,
    };
  }

  private queue(name: string, data: Record<string, any>) {
    this.notificationQueue.add(name, data).catch((err) =>
      this.logger.warn(`Failed to queue ${name}: ${err.message}`),
    );
  }
}
