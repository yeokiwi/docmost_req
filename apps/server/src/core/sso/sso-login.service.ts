import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { SignupService } from '../auth/services/signup.service';
import { GroupUserService } from '../group/services/group-user.service';
import { isUserDisabled } from '../../common/helpers';
import { validateAllowedEmail } from '../auth/auth.util';
import { OidcClaims } from './sso.util';
import { SsoProviderRow } from './sso-provider.service';

/** Maps a verified OIDC identity to a workspace user (link or sign up). */
@Injectable()
export class SsoLoginService {
  private readonly logger = new Logger(SsoLoginService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly signupService: SignupService,
    private readonly groupUserService: GroupUserService,
  ) {}

  async resolveUser(
    provider: SsoProviderRow,
    claims: OidcClaims,
    workspace: Workspace,
  ): Promise<User> {
    if (!claims.sub)
      throw new ForbiddenException('The identity provider returned no subject');

    let user: User | undefined;
    const account = await this.db
      .selectFrom('authAccounts')
      .select(['userId'])
      .where('authProviderId', '=', provider.id)
      .where('providerUserId', '=', claims.sub)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (account) {
      user = await this.userRepo.findById(account.userId, workspace.id);
    }

    if (!user) {
      if (!claims.email) {
        throw new ForbiddenException(
          'The identity provider did not share an email address',
        );
      }
      if (claims.emailVerified === false) {
        throw new ForbiddenException(
          'Your email address is not verified at the identity provider',
        );
      }
      user = await this.userRepo.findByEmail(claims.email, workspace.id);

      if (!user) {
        // a pending invitation counts as permission to join
        const invitation = await this.db
          .selectFrom('workspaceInvitations')
          .select(['id', 'role', 'groupIds'])
          .where('workspaceId', '=', workspace.id)
          .where(sql`lower(email)`, '=', claims.email)
          .executeTakeFirst();

        if (!provider.allowSignup && !invitation) {
          throw new ForbiddenException(
            'No account exists for this email. Ask a workspace admin to invite you.',
          );
        }
        if (!invitation) validateAllowedEmail(claims.email, workspace);
        user = await this.signupService.signup(
          {
            name: claims.name || claims.email.split('@')[0],
            email: claims.email,
            // never used: the account signs in through SSO
            password: randomBytes(32).toString('base64url'),
          },
          workspace.id,
        );
        await this.db
          .updateTable('users')
          .set({
            hasGeneratedPassword: true,
            emailVerifiedAt: new Date(),
            ...(invitation ? { role: invitation.role } : {}),
          })
          .where('id', '=', user.id)
          .execute();
        if (invitation) {
          for (const groupId of invitation.groupIds ?? []) {
            await this.groupUserService
              .addUsersToGroupBatch([user.id], groupId, workspace.id)
              .catch(() => undefined);
          }
          await this.db
            .deleteFrom('workspaceInvitations')
            .where('id', '=', invitation.id)
            .execute();
        }
      }

      await this.db
        .insertInto('authAccounts')
        .values({
          userId: user.id,
          providerUserId: claims.sub,
          authProviderId: provider.id,
          workspaceId: workspace.id,
        })
        .execute();
    }

    if (isUserDisabled(user)) {
      throw new ForbiddenException('Your account is deactivated');
    }

    if (!user.emailVerifiedAt) {
      await this.db
        .updateTable('users')
        .set({ emailVerifiedAt: new Date() })
        .where('id', '=', user.id)
        .execute();
    }

    if (provider.groupSync && claims.groups.length > 0) {
      await this.syncGroups(user, workspace, claims.groups).catch((err) =>
        this.logger.warn(`Group sync failed for ${user.id}: ${err.message}`),
      );
    }
    return user;
  }

  /**
   * Adds the user to workspace groups whose name matches an IdP group
   * (case-insensitive). Membership is only added, never removed, so groups
   * managed by hand inside Docmost are left alone.
   */
  async syncGroups(user: User, workspace: Workspace, idpGroups: string[]) {
    const names = [...new Set(idpGroups.map((g) => g.toLowerCase()))];
    const groups = await this.db
      .selectFrom('groups')
      .select(['id'])
      .where('workspaceId', '=', workspace.id)
      .where('isDefault', '=', false)
      .where(sql`lower(name)`, 'in', names)
      .execute();
    for (const g of groups) {
      await this.groupUserService.addUsersToGroupBatch(
        [user.id],
        g.id,
        workspace.id,
      );
    }
  }
}
