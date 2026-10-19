import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { PagePermissionService } from './page-permission.service';
import {
  AddPagePermissionsDto,
  ChangePagePermissionRoleDto,
  PagePermissionPageDto,
  PagePermissionTargetDto,
} from './page-permission.dto';

@UseGuards(JwtAuthGuard)
@Controller('page-permissions')
export class PagePermissionController {
  constructor(
    private readonly service: PagePermissionService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private audit(
    event: (typeof AuditEvent)[keyof typeof AuditEvent],
    pageId: string,
    spaceId: string,
    changes?: any,
  ) {
    this.auditService.log({
      event,
      resourceType: AuditResource.PAGE,
      resourceId: pageId,
      spaceId,
      changes,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.info(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  async members(
    @Body() dto: PagePermissionPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.members(page, user, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  async restrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.restrict(page, user);
    this.audit(AuditEvent.PAGE_RESTRICTED, page.id, page.spaceId);
    return this.service.info(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unrestrict')
  async unrestrict(
    @Body() dto: PagePermissionPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.unrestrict(page, user);
    this.audit(AuditEvent.PAGE_RESTRICTION_REMOVED, page.id, page.spaceId);
    return this.service.info(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add')
  async add(
    @Body() dto: AddPagePermissionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.add(page, user, dto);
    this.audit(AuditEvent.PAGE_PERMISSION_ADDED, page.id, page.spaceId, {
      after: { userIds: dto.userIds, groupIds: dto.groupIds, role: dto.role },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async remove(
    @Body() dto: PagePermissionTargetDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.remove(page, user, dto);
    this.audit(AuditEvent.PAGE_PERMISSION_REMOVED, page.id, page.spaceId, {
      before: { userId: dto.userId, groupId: dto.groupId },
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('change-role')
  async changeRole(
    @Body() dto: ChangePagePermissionRoleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.changeRole(page, user, dto);
    this.audit(AuditEvent.PAGE_PERMISSION_ROLE_CHANGED, page.id, page.spaceId, {
      after: { userId: dto.userId, groupId: dto.groupId, role: dto.role },
    });
  }
}
