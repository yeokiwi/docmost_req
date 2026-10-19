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
import { PageVerificationService } from './page-verification.service';
import {
  ListVerificationsDto,
  RejectVerificationDto,
  SetupVerificationDto,
  VerificationPageIdDto,
} from './page-verification.dto';

@UseGuards(JwtAuthGuard)
@Controller('page-verifications')
export class PageVerificationController {
  constructor(private readonly service: PageVerificationService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(
    @Body() dto: VerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.getInfo(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setup(
    @Body() dto: SetupVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.setup(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async remove(
    @Body() dto: VerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    await this.service.remove(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  async verify(
    @Body() dto: VerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.verify(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('request-approval')
  async requestApproval(
    @Body() dto: VerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.requestApproval(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('approve')
  async approve(
    @Body() dto: VerificationPageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.approve(page, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject')
  async reject(
    @Body() dto: RejectVerificationDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.service.loadPage(dto.pageId, workspace);
    return this.service.reject(page, user, dto.comment);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(
    @Body() dto: ListVerificationsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.list(user, workspace, dto);
  }
}
