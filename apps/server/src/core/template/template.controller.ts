import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { TemplateService } from './template.service';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  TemplateIdDto,
  UpdateTemplateDto,
} from './dto/template.dto';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async list(
    @Body() dto: ListTemplatesDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.list(user, workspace, pagination, dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateService.getForRead(
      dto.templateId,
      user,
      workspace,
    );
    const canEdit = await this.templateService
      .canManageScope(template.spaceId, user, workspace)
      .catch(() => false);
    return { ...template, permissions: { canEdit } };
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.update(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.templateService.delete(dto.templateId, user, workspace);
  }

  // Which scopes the current user may add templates to.
  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  async permissions(
    @Body() dto: ListTemplatesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const canManageWorkspace = await this.templateService.canManageScope(
      null,
      user,
      workspace,
    );
    const canManageSpace = dto.spaceId
      ? await this.templateService
          .canManageScope(dto.spaceId, user, workspace)
          .catch(() => false)
      : false;
    return { canManageWorkspace, canManageSpace };
  }
}
