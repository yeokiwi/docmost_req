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
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  AddPagePermissionsDto,
  ChangePagePermissionRoleDto,
  PagePermissionTargetDto,
} from './page-permission.dto';

@Injectable()
export class PagePermissionService {
  private readonly logger = new Logger(PagePermissionService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
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

  /**
   * Space admins can always manage access (so a page can never be locked
   * away for good); otherwise the user needs edit rights on the page.
   */
  async canManage(page: Page, user: User): Promise<boolean> {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      return false;
    }
    if (ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      return true;
    }
    const { hasAnyRestriction, canEdit } =
      await this.pagePermissionRepo.canUserEditPage(user.id, page.id, {
        skipCache: true,
      });
    if (hasAnyRestriction) return canEdit;
    return ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  }

  private async assertCanManage(page: Page, user: User) {
    if (!(await this.canManage(page, user))) {
      throw new ForbiddenException(
        'You cannot change who can access this page',
      );
    }
  }

  async info(page: Page, user: User) {
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    const canManage = await this.canManage(page, user);
    const { canAccess } = await this.pagePermissionRepo.canUserEditPage(
      user.id,
      page.id,
    );
    if (!canAccess && !canManage) throw new ForbiddenException();

    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    const ancestor = await this.pagePermissionRepo.findRestrictedAncestor(
      page.id,
    );
    let inheritedFrom: {
      id: string;
      title: string | null;
      slugId: string;
    } | null = null;
    if (ancestor && ancestor.pageId !== page.id) {
      const p = await this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId'])
        .where('id', '=', ancestor.pageId)
        .executeTakeFirst();
      inheritedFrom = p ?? null;
    }

    return {
      restricted: !!access,
      inheritedFrom,
      permissions: { canManage },
    };
  }

  async members(page: Page, user: User, pagination: PaginationOptions) {
    await this.info(page, user);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) return { items: [], meta: { hasNextPage: false } };
    return this.pagePermissionRepo.getPagePermissionsPaginated(
      access.id,
      pagination,
    );
  }

  /** Restricts the page; the user who restricts it becomes a writer. */
  async restrict(page: Page, user: User) {
    await this.assertCanManage(page, user);
    const existing = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (existing) return;

    await executeTx(this.db, async (trx) => {
      const access = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: 'restricted',
          creatorId: user.id,
        },
        trx,
      );
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: access.id,
            userId: user.id,
            role: 'writer',
            addedById: user.id,
          },
        ],
        trx,
      );
    });
  }

  async unrestrict(page: Page, user: User) {
    await this.assertCanManage(page, user);
    await this.pagePermissionRepo.deletePageAccess(page.id);
  }

  async add(page: Page, user: User, dto: AddPagePermissionsDto) {
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);

    const userIds = [...new Set(dto.userIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException('userIds or groupIds is required');
    }

    // only space members can be given access to a page in the space
    if (userIds.length) {
      const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
        userIds,
        page.spaceId,
      );
      if (userIds.some((id) => !inSpace.has(id))) {
        throw new BadRequestException(
          'Every user must be a member of this space',
        );
      }
    }
    if (groupIds.length) {
      const groups = await this.db
        .selectFrom('groups')
        .select('id')
        .where('id', 'in', groupIds)
        .where('workspaceId', '=', page.workspaceId)
        .execute();
      if (groups.length !== groupIds.length) {
        throw new BadRequestException('Group not found');
      }
    }

    const existing = await this.db
      .selectFrom('pagePermissions')
      .select(['userId', 'groupId'])
      .where('pageAccessId', '=', access.id)
      .execute();
    const haveUsers = new Set(existing.map((e) => e.userId).filter(Boolean));
    const haveGroups = new Set(existing.map((e) => e.groupId).filter(Boolean));

    const newUserIds = userIds.filter((id) => !haveUsers.has(id));
    const newGroupIds = groupIds.filter((id) => !haveGroups.has(id));

    await executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.insertPagePermissions(
        [
          ...newUserIds.map((userId) => ({
            pageAccessId: access.id,
            userId,
            role: dto.role,
            addedById: user.id,
          })),
          ...newGroupIds.map((groupId) => ({
            pageAccessId: access.id,
            groupId,
            role: dto.role,
            addedById: user.id,
          })),
        ],
        trx,
      );
      // existing entries take the requested role
      for (const id of userIds.filter((id) => haveUsers.has(id))) {
        await this.pagePermissionRepo.updatePagePermissionRole(
          access.id,
          dto.role,
          { userId: id },
          trx,
        );
      }
      for (const id of groupIds.filter((id) => haveGroups.has(id))) {
        await this.pagePermissionRepo.updatePagePermissionRole(
          access.id,
          dto.role,
          { groupId: id },
          trx,
        );
      }
    });

    const notify = newUserIds.filter((id) => id !== user.id);
    if (notify.length) {
      this.notificationQueue
        .add(QueueJob.PAGE_PERMISSION_GRANTED, {
          userIds: notify,
          pageId: page.id,
          spaceId: page.spaceId,
          workspaceId: page.workspaceId,
          actorId: user.id,
          role: dto.role,
        })
        .catch((err) =>
          this.logger.warn(`Failed to queue notification: ${err.message}`),
        );
    }
  }

  async remove(page: Page, user: User, dto: PagePermissionTargetDto) {
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);
    this.assertSingleTarget(dto);

    await executeTx(this.db, async (trx) => {
      if (dto.userId) {
        await this.pagePermissionRepo.deletePagePermissionByUserId(
          access.id,
          dto.userId,
          trx,
        );
      } else {
        await this.pagePermissionRepo.deletePagePermissionByGroupId(
          access.id,
          dto.groupId,
          trx,
        );
      }
      await this.assertHasWriter(access.id, trx);
    });
  }

  async changeRole(page: Page, user: User, dto: ChangePagePermissionRoleDto) {
    await this.assertCanManage(page, user);
    const access = await this.requireAccess(page);
    this.assertSingleTarget(dto);

    await executeTx(this.db, async (trx) => {
      await this.pagePermissionRepo.updatePagePermissionRole(
        access.id,
        dto.role,
        dto.userId ? { userId: dto.userId } : { groupId: dto.groupId },
        trx,
      );
      await this.assertHasWriter(access.id, trx);
    });
  }

  private async requireAccess(page: Page) {
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      page.id,
    );
    if (!access) throw new BadRequestException('This page is not restricted');
    return access;
  }

  private assertSingleTarget(dto: PagePermissionTargetDto) {
    if (!!dto.userId === !!dto.groupId) {
      throw new BadRequestException('Provide either userId or groupId');
    }
  }

  // a restricted page must keep at least one writer; throwing rolls back
  private async assertHasWriter(pageAccessId: string, trx: any) {
    const writers = await this.pagePermissionRepo.countWritersByPageAccessId(
      pageAccessId,
      { trx },
    );
    if (writers === 0) {
      throw new BadRequestException(
        'A restricted page needs at least one person who can edit',
      );
    }
  }
}
