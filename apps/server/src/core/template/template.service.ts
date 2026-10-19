import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Template, User, Workspace } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import {
  jsonToNode,
  jsonToText,
} from '../../collaboration/collaboration.util';
import { removeMarkTypeFromDoc } from '../../common/helpers/prosemirror/utils';
import { UserRole } from '../../common/helpers/types/permission';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export function isWorkspaceAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
}

export function allowsMemberTemplates(workspace: Pick<Workspace, 'settings'>) {
  return (workspace.settings as any)?.templates?.allowMemberTemplates === true;
}

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
  ) {}

  async list(
    user: User,
    workspace: Workspace,
    pagination: PaginationOptions,
    spaceId?: string,
  ) {
    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    return this.templateRepo.findTemplates(workspace.id, spaceIds, pagination, {
      spaceId,
    });
  }

  async getForRead(templateId: string, user: User, workspace: Workspace) {
    const template = await this.templateRepo.findById(templateId, workspace.id, {
      includeContent: true,
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    if (template.spaceId) {
      const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
      if (!spaceIds.includes(template.spaceId)) {
        throw new NotFoundException('Template not found');
      }
    }
    return template;
  }

  async create(dto: CreateTemplateDto, user: User, workspace: Workspace) {
    const spaceId = dto.spaceId ?? null;
    await this.assertCanManageScope(spaceId, user, workspace);

    let content: any = dto.content;
    if (dto.pageId) {
      const page = await this.pageRepo.findById(dto.pageId, {
        includeContent: true,
      });
      if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
        throw new NotFoundException('Page not found');
      }
      await this.pageAccessService.validateCanView(page, user);
      // comments belong to the page, not to the template
      content = page.content
        ? removeMarkTypeFromDoc(jsonToNode(page.content as any), 'comment').toJSON()
        : null;
    }
    content = this.normaliseContent(content);

    const { id } = await this.templateRepo.insertTemplate({
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      icon: dto.icon || null,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
      content,
      textContent: jsonToText(content),
    });

    return this.templateRepo.findById(id, workspace.id, {
      includeContent: true,
    });
  }

  async update(dto: UpdateTemplateDto, user: User, workspace: Workspace) {
    const template = await this.getForRead(dto.templateId, user, workspace);
    await this.assertCanModify(template, user, workspace);

    if (dto.spaceId !== undefined && (dto.spaceId ?? null) !== template.spaceId) {
      await this.assertCanManageScope(dto.spaceId ?? null, user, workspace);
    }

    const values: Record<string, any> = { lastUpdatedById: user.id };
    if (dto.title !== undefined) values.title = dto.title.trim();
    if (dto.description !== undefined) {
      values.description = dto.description.trim() || null;
    }
    if (dto.icon !== undefined) values.icon = dto.icon || null;
    if (dto.spaceId !== undefined) values.spaceId = dto.spaceId ?? null;
    if (dto.content !== undefined) {
      const content = this.normaliseContent(dto.content);
      values.content = content;
      values.textContent = jsonToText(content);
    }

    await this.templateRepo.updateTemplate(values, template.id, workspace.id);
    return this.templateRepo.findById(template.id, workspace.id, {
      includeContent: true,
    });
  }

  async delete(templateId: string, user: User, workspace: Workspace) {
    const template = await this.getForRead(templateId, user, workspace);
    await this.assertCanModify(template, user, workspace);
    await this.templateRepo.deleteTemplate(template.id, workspace.id);
  }

  /** Whether the user may add templates to the given scope. */
  async canManageScope(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
  ): Promise<boolean> {
    if (!spaceId) {
      return isWorkspaceAdmin(user) || allowsMemberTemplates(workspace);
    }
    if (isWorkspaceAdmin(user)) {
      const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
      if (spaceIds.includes(spaceId)) return true;
    }
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page);
  }

  private async assertCanManageScope(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
  ) {
    if (!(await this.canManageScope(spaceId, user, workspace))) {
      throw new ForbiddenException(
        spaceId
          ? 'You need edit access to this space to manage its templates'
          : 'Only workspace admins can manage workspace templates',
      );
    }
  }

  private async assertCanModify(
    template: Template,
    user: User,
    workspace: Workspace,
  ) {
    if (isWorkspaceAdmin(user)) return;

    if (template.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        template.spaceId,
      );
      if (ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        return;
      }
      if (
        ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page) &&
        template.creatorId === user.id
      ) {
        return;
      }
    } else if (
      allowsMemberTemplates(workspace) &&
      template.creatorId === user.id
    ) {
      return;
    }

    throw new ForbiddenException('You cannot change this template');
  }

  private normaliseContent(content: any) {
    if (content === undefined || content === null) return EMPTY_DOC;
    if (typeof content !== 'object' || content.type !== 'doc') {
      throw new BadRequestException('Template content must be a document');
    }
    return content;
  }
}
