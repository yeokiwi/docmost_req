import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import * as path from 'path';
import * as bytes from 'bytes';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import {
  AllocateKeyDto,
  BaselineIdDto,
  CompareBaselinesDto,
  ConfirmImportDto,
  CreateBaselineDto,
  ExportRequirementsDto,
  ListRequirementsDto,
  PageIdDto,
  RequirementInfoDto,
  SpaceIdDto,
  TraceabilityDto,
  UpdateRequirementSettingsDto,
} from './dto/requirement.dto';
import { RequirementSettingsService } from './services/requirement-settings.service';
import { RequirementQueryService } from './services/requirement-query.service';
import { RequirementBaselineService } from './services/requirement-baseline.service';
import { RequirementTransferService } from './services/requirement-transfer.service';
import { RequirementRepo } from './repos/requirement.repo';

@UseGuards(JwtAuthGuard)
@Controller('requirements')
export class RequirementController {
  private readonly logger = new Logger(RequirementController.name);

  constructor(
    private readonly settingsService: RequirementSettingsService,
    private readonly queryService: RequirementQueryService,
    private readonly baselineService: RequirementBaselineService,
    private readonly transferService: RequirementTransferService,
    private readonly requirementRepo: RequirementRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  private async assertSpace(
    user: User,
    workspace: Workspace,
    spaceId: string,
    action: SpaceCaslAction,
    subject: SpaceCaslSubject,
  ) {
    const space = await this.spaceRepo.findById(spaceId, workspace.id);
    if (!space) throw new NotFoundException('Space not found');
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, subject)) throw new ForbiddenException();
    return space;
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings')
  async getSettings(
    @Body() dto: SpaceIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    return this.settingsService.getSettings(dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('settings/update')
  async updateSettings(
    @Body() dto: UpdateRequirementSettingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Manage,
      SpaceCaslSubject.Settings,
    );
    return this.settingsService.updateSettings(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('allocate-key')
  async allocateKey(
    @Body() dto: AllocateKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );
    const keys = await this.settingsService.allocateKeys(
      dto.spaceId,
      dto.count ?? 1,
    );
    return { key: keys[0], keys };
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(
    @Body() dto: ListRequirementsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    return this.queryService.list(
      dto.spaceId,
      dto.filter,
      user.id,
      dto.limit ?? 50,
      dto.offset ?? 0,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @Body() dto: RequirementInfoDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    let requirement = dto.requirementId
      ? await this.requirementRepo.findById(dto.requirementId, workspace.id)
      : undefined;

    if (!requirement && dto.spaceId && dto.key) {
      const space = await this.spaceRepo.findById(dto.spaceId, workspace.id);
      if (space) {
        requirement = await this.queryService.findOwnerByKey(
          dto.spaceId,
          dto.key,
        );
      }
    }

    if (!requirement || requirement.deletedAt) {
      throw new NotFoundException('Requirement not found');
    }

    const page = await this.pageRepo.findById(requirement.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Requirement not found');
    }
    await this.pageAccessService.validateCanView(page, user);

    return this.queryService.getDetail(requirement, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('page-conflicts')
  async pageConflicts(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);
    return {
      nodeIds: await this.requirementRepo.findConflictNodeIds(page.id),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('traceability')
  async traceability(
    @Body() dto: TraceabilityDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    return this.queryService.traceability(
      dto.spaceId,
      dto.rowFilter,
      dto.columnFilter,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('baselines')
  async listBaselines(
    @Body() dto: SpaceIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    return this.baselineService.list(dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('baselines/create')
  async createBaseline(
    @Body() dto: CreateBaselineDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );
    return this.baselineService.create(
      dto.spaceId,
      dto.name,
      dto.description,
      user,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('baselines/delete')
  async deleteBaseline(
    @Body() dto: BaselineIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const baseline = await this.baselineService.getBaseline(
      dto.baselineId,
      workspace.id,
    );
    await this.assertSpace(
      user,
      workspace,
      baseline.spaceId,
      SpaceCaslAction.Manage,
      SpaceCaslSubject.Settings,
    );
    await this.baselineService.delete(baseline);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('baselines/compare')
  async compareBaselines(
    @Body() dto: CompareBaselinesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const from = await this.baselineService.getBaseline(
      dto.fromBaselineId,
      workspace.id,
    );
    const to = dto.toBaselineId
      ? await this.baselineService.getBaseline(dto.toBaselineId, workspace.id)
      : null;
    if (to && to.spaceId !== from.spaceId) {
      throw new BadRequestException('Baselines belong to different spaces');
    }
    await this.assertSpace(
      user,
      workspace,
      from.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    return {
      from,
      to,
      diff: await this.baselineService.compare(from, to),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('export')
  async export(
    @Body() dto: ExportRequirementsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const space = await this.assertSpace(
      user,
      workspace,
      dto.spaceId,
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );

    const file = await this.transferService.export({
      spaceId: dto.spaceId,
      spaceSlug: space.slug,
      format: dto.format,
      filter: dto.filter,
      baselineId: dto.baselineId,
      workspaceId: workspace.id,
      userId: user.id,
    });

    res.headers({
      'Content-Type': file.contentType,
      'Content-Disposition':
        'attachment; filename="' + encodeURIComponent(file.fileName) + '"',
    });
    res.send(file.buffer);
  }

  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('import/preview')
  async importPreview(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: bytes('10mb'), fields: 2, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err?.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException('File too large. Exceeds the 10mb limit');
      }
    }
    if (!file) throw new BadRequestException('Failed to upload file');

    const ext = path.extname(file.filename).toLowerCase();
    if (!['.xlsx', '.csv'].includes(ext)) {
      throw new BadRequestException('Only .xlsx and .csv files are supported');
    }

    const spaceId = file.fields?.spaceId?.value;
    if (!spaceId) throw new BadRequestException('spaceId is required');

    await this.assertSpace(
      user,
      workspace,
      spaceId,
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );

    const buffer = await file.toBuffer();
    const parsed = await this.transferService.parseUpload(buffer, ext);
    const rows = await this.transferService.planKeys(spaceId, parsed.rows);

    return {
      fileName: file.filename,
      rows,
      propertyNames: parsed.propertyNames,
      warnings: parsed.warnings,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('import/confirm')
  async importConfirm(
    @Body() dto: ConfirmImportDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.parentPageId) {
      const parentPage = await this.pageRepo.findById(dto.parentPageId);
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== dto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      await this.assertSpace(
        user,
        workspace,
        dto.spaceId,
        SpaceCaslAction.Create,
        SpaceCaslSubject.Page,
      );
    }

    const page = await this.transferService.confirmImport(
      dto,
      user,
      workspace.id,
    );
    return { pageId: page.id, slugId: page.slugId, title: page.title };
  }
}
