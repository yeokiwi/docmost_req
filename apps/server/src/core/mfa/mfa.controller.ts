import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { isUserDisabled } from '../../common/helpers';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { TokenService } from '../auth/services/token.service';
import { AuthService } from '../auth/services/auth.service';
import { JwtType } from '../auth/dto/jwt-payload';
import { MfaService } from './mfa.service';
import { MfaCodeDto, MfaDisableDto, MfaRegenerateDto } from './mfa.dto';
import { IsUUID } from 'class-validator';

export const MFA_COOKIE = 'mfaToken';

class ResetUserMfaDto {
  @IsUUID()
  userId: string;
}

@Controller('mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService,
    private readonly userRepo: UserRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  // ---- signed-in user -----------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('status')
  status(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.status(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  setup(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.mfaService.beginSetup(user, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  enable(
    @Body() dto: MfaCodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.mfaService.enable(user, workspace, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(
    @Body() dto: MfaDisableDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.mfaService.disable(user, workspace, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('backup-codes')
  regenerate(
    @Body() dto: MfaRegenerateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.mfaService.regenerateBackupCodes(user, workspace, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('reset-user')
  async resetUser(
    @Body() dto: ResetUserMfaDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.mfaService.resetForUser(user, workspace, dto.userId);
  }

  // ---- second sign-in step (password checked, mfaToken cookie set) --------

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login/verify')
  async loginVerify(
    @Body() dto: MfaCodeDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const user = await this.pendingUser(req, workspace);
    await this.mfaService.verifyLoginCode(user, workspace, dto.code);
    await this.finishLogin(user, workspace, res);
  }

  /** Enforced enrolment during sign-in for users without 2FA. */
  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login/setup')
  async loginSetup(@Req() req: FastifyRequest, @AuthWorkspace() workspace: Workspace) {
    const user = await this.pendingUser(req, workspace);
    return this.mfaService.beginSetup(user, workspace);
  }

  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false })
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login/enable')
  async loginEnable(
    @Body() dto: MfaCodeDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const user = await this.pendingUser(req, workspace);
    const result = await this.mfaService.enable(user, workspace, dto.code);
    await this.finishLogin(user, workspace, res);
    return result;
  }

  private async pendingUser(req: FastifyRequest, workspace: Workspace): Promise<User> {
    const token = req.cookies?.[MFA_COOKIE];
    if (!token) throw new UnauthorizedException('Sign in again');
    let payload: any;
    try {
      payload = await this.tokenService.verifyJwt(token, JwtType.MFA_TOKEN);
    } catch {
      throw new UnauthorizedException('Sign in again');
    }
    if (payload.workspaceId !== workspace.id) throw new UnauthorizedException();
    const user = await this.userRepo.findById(payload.sub, workspace.id);
    if (!user || isUserDisabled(user)) throw new UnauthorizedException();
    return user;
  }

  private async finishLogin(user: User, workspace: Workspace, res: FastifyReply) {
    const authToken = await this.authService.completeLogin(user, workspace.id, 'password+mfa');
    res.clearCookie(MFA_COOKIE, { path: '/' });
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
