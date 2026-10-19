import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { DEFAULT_AUDIT_RETENTION_DAYS } from '../../integrations/audit/db-audit.service';
import { AuditRetentionDto, ListAuditDto } from './audit.dto';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private assertCanView(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async list(
    @Body() dto: ListAuditDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanView(user, workspace);
    const limit = dto.limit ?? 50;

    const rows = await this.db
      .selectFrom('audit as a')
      .leftJoin('users as u', 'u.id', 'a.actorId')
      .leftJoin('spaces as s', 's.id', 'a.spaceId')
      .select([
        'a.id',
        'a.event',
        'a.resourceType',
        'a.resourceId',
        'a.spaceId',
        'a.actorId',
        'a.actorType',
        'a.changes',
        'a.metadata',
        'a.ipAddress',
        'a.userAgent',
        'a.createdAt',
        'u.name as actorName',
        'u.email as actorEmail',
        'u.avatarUrl as actorAvatarUrl',
        's.name as spaceName',
      ])
      .where('a.workspaceId', '=', workspace.id)
      .$if(!!dto.event, (qb) =>
        dto.event.endsWith('.')
          ? qb.where('a.event', 'like', `${dto.event}%`)
          : qb.where('a.event', '=', dto.event),
      )
      .$if(!!dto.resourceType, (qb) => qb.where('a.resourceType', '=', dto.resourceType))
      .$if(!!dto.actorId, (qb) => qb.where('a.actorId', '=', dto.actorId))
      .$if(!!dto.spaceId, (qb) => qb.where('a.spaceId', '=', dto.spaceId))
      .$if(!!dto.from, (qb) => qb.where('a.createdAt', '>=', new Date(dto.from)))
      .$if(!!dto.to, (qb) => qb.where('a.createdAt', '<=', new Date(dto.to)))
      // ids are time-ordered (uuid v7), so they double as a stable cursor
      .$if(!!dto.cursor, (qb) => qb.where('a.id', '<', dto.cursor))
      .orderBy('a.id', 'desc')
      .limit(limit + 1)
      .execute();

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    return {
      items,
      meta: {
        hasNextPage,
        nextCursor: hasNextPage ? items[items.length - 1].id : null,
      },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async settings(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertCanView(user, workspace);
    const ws = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspace.id)
      .executeTakeFirst();
    return {
      retentionDays: Number(ws?.auditRetentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention')
  async retention(
    @Body() dto: AuditRetentionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertCanView(user, workspace);
    await this.auditService.updateRetention(workspace.id, dto.retentionDays);
    return { retentionDays: dto.retentionDays };
  }
}
