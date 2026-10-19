import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { AuthService } from '../auth/services/auth.service';
import { OidcService } from './oidc.service';
import { SsoProviderService } from './sso-provider.service';
import { safeRedirect } from './sso.util';
import { SsoLoginService } from './sso-login.service';
import {
  CreateSsoProviderDto,
  SsoProviderIdDto,
  UpdateSsoProviderDto,
} from './sso.dto';

const STATE_COOKIE = 'ssoState';
const STATE_TTL_SECONDS = 10 * 60;

type SsoState = {
  providerId: string;
  codeVerifier: string;
  state: string;
  nonce: string;
  redirect: string;
  exp: number;
};

@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly providers: SsoProviderService,
    private readonly oidc: OidcService,
    private readonly ssoLogin: SsoLoginService,
    private readonly authService: AuthService,
    private readonly environment: EnvironmentService,
    private readonly encryption: EncryptionService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private callbackUrl(providerId: string) {
    return `${this.environment.getAppUrl()}/api/sso/oidc/${providerId}/callback`;
  }

  // ---- sign-in -------------------------------------------------------------

  @Get('oidc/:providerId/login')
  async login(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query('redirect') redirect: string,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    try {
      const provider = await this.providers.findForLogin(
        providerId,
        workspace.id,
      );
      if (!provider || !provider.isEnabled || provider.type !== 'oidc') {
        throw new ForbiddenException('This sign-in method is not available');
      }
      const auth = await this.oidc.buildLoginUrl(
        provider,
        this.callbackUrl(provider.id),
        provider.groupSync,
      );
      const state: SsoState = {
        providerId: provider.id,
        codeVerifier: auth.codeVerifier,
        state: auth.state,
        nonce: auth.nonce,
        redirect: safeRedirect(redirect),
        exp: Date.now() + STATE_TTL_SECONDS * 1000,
      };
      res.setCookie(
        STATE_COOKIE,
        this.encryption.encrypt(
          JSON.stringify(state),
          EncryptionPurpose.SSO_STATE,
        ),
        {
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/sso',
          maxAge: STATE_TTL_SECONDS,
          secure: this.environment.isHttps(),
        },
      );
      return res.redirect(auth.url, 302);
    } catch (err: any) {
      return this.fail(res, err);
    }
  }

  @Get('oidc/:providerId/callback')
  async callback(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
  ) {
    try {
      const query = req.query as Record<string, string>;
      if (query?.error) {
        throw new ForbiddenException(query.error_description || query.error);
      }
      const state = this.readState(req, providerId);
      res.clearCookie(STATE_COOKIE, { path: '/api/sso' });

      const provider = await this.providers.findForLogin(
        providerId,
        workspace.id,
      );
      if (!provider || !provider.isEnabled) {
        throw new ForbiddenException('This sign-in method is not available');
      }

      const currentUrl = new URL(this.callbackUrl(providerId));
      const raw = new URL(req.url, 'http://placeholder');
      currentUrl.search = raw.search;

      const claims = await this.oidc.exchange(provider, currentUrl, state);
      const user = await this.ssoLogin.resolveUser(provider, claims, workspace);
      // the identity provider is responsible for second factors
      const authToken = await this.authService.completeLogin(
        user,
        workspace.id,
        'oidc',
      );
      res.setCookie('authToken', authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environment.getCookieExpiresIn(),
        secure: this.environment.isHttps(),
      });
      return res.redirect(state.redirect, 302);
    } catch (err: any) {
      return this.fail(res, err);
    }
  }

  private readState(req: FastifyRequest, providerId: string): SsoState {
    const cookie = req.cookies?.[STATE_COOKIE];
    if (!cookie)
      throw new ForbiddenException('Your sign-in session expired. Try again.');
    let state: SsoState;
    try {
      state = JSON.parse(
        this.encryption.decrypt(cookie, EncryptionPurpose.SSO_STATE),
      );
    } catch {
      throw new ForbiddenException(
        'Your sign-in session is invalid. Try again.',
      );
    }
    if (state.providerId !== providerId || state.exp < Date.now()) {
      throw new ForbiddenException('Your sign-in session expired. Try again.');
    }
    return state;
  }

  private fail(res: FastifyReply, err: any) {
    const message =
      err?.response?.message ||
      (err?.name === 'ResponseBodyError' || err?.code
        ? 'Sign-in with the identity provider failed'
        : null) ||
      err?.message ||
      'Sign-in failed';
    this.logger.warn(`SSO sign-in failed: ${err?.message ?? err}`);
    return res.redirect(
      `/login?sso_error=${encodeURIComponent(String(message).slice(0, 200))}`,
      302,
    );
  }

  // ---- administration -----------------------------------------------------

  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  async list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    this.assertAdmin(user, workspace);
    const rows = await this.providers.list(workspace);
    return rows.map((r: any) => ({
      ...r,
      redirectUri: this.callbackUrl(r.id),
    }));
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('providers/create')
  async create(
    @Body() dto: CreateSsoProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    const row: any = await this.providers.create(dto, user, workspace);
    return { ...row, redirectUri: this.callbackUrl(row.id) };
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('providers/update')
  async update(
    @Body() dto: UpdateSsoProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    const row: any = await this.providers.update(dto, workspace);
    return { ...row, redirectUri: this.callbackUrl(row.id) };
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('providers/delete')
  async delete(
    @Body() dto: SsoProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    await this.providers.delete(dto.providerId, workspace);
  }

  @UseGuards(JwtAuthGuard)
  @RequireSessionAuth()
  @HttpCode(HttpStatus.OK)
  @Post('providers/test')
  async test(
    @Body() dto: SsoProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertAdmin(user, workspace);
    return this.providers.test(dto.providerId, workspace);
  }
}
