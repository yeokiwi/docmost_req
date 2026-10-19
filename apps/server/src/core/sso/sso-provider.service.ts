import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { CreateSsoProviderDto, UpdateSsoProviderDto } from './sso.dto';
import { OidcService } from './oidc.service';
import { normaliseIssuer } from './sso.util';

export type SsoProviderRow = {
  id: string;
  name: string;
  type: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  allowSignup: boolean;
  isEnabled: boolean;
  groupSync: boolean;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

const PUBLIC_FIELDS = [
  'id',
  'name',
  'type',
  'oidcIssuer',
  'oidcClientId',
  'allowSignup',
  'isEnabled',
  'groupSync',
  'createdAt',
  'updatedAt',
] as const;

@Injectable()
export class SsoProviderService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly encryption: EncryptionService,
    private readonly oidcService: OidcService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  list(workspace: Workspace) {
    return this.db
      .selectFrom('authProviders')
      .select(PUBLIC_FIELDS as any)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  /** Full row including the decrypted client secret (server-side use only). */
  async findForLogin(providerId: string, workspaceId: string) {
    const row = (await this.db
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', providerId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst()) as SsoProviderRow | undefined;
    if (!row) return undefined;
    return {
      ...row,
      oidcClientSecret: this.decryptSecret(row.oidcClientSecret),
    };
  }

  async create(dto: CreateSsoProviderDto, user: User, workspace: Workspace) {
    const issuer = normaliseIssuer(dto.oidcIssuer);
    await this.assertDiscoverable(issuer);
    const row = await this.db
      .insertInto('authProviders')
      .values({
        name: dto.name.trim(),
        type: 'oidc',
        oidcIssuer: issuer,
        oidcClientId: dto.oidcClientId.trim(),
        oidcClientSecret: this.encryptSecret(dto.oidcClientSecret),
        allowSignup: dto.allowSignup ?? false,
        isEnabled: dto.isEnabled ?? false,
        groupSync: dto.groupSync ?? false,
        creatorId: user.id,
        workspaceId: workspace.id,
      })
      .returning(PUBLIC_FIELDS as any)
      .executeTakeFirst();
    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_CREATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: (row as any).id,
      changes: {
        after: { name: dto.name, issuer, isEnabled: dto.isEnabled ?? false },
      },
    });
    return row;
  }

  async update(dto: UpdateSsoProviderDto, workspace: Workspace) {
    const existing = await this.findForLogin(dto.providerId, workspace.id);
    if (!existing) throw new NotFoundException('SSO provider not found');

    const values: Record<string, any> = { updatedAt: new Date() };
    if (dto.name !== undefined) values.name = dto.name.trim();
    if (dto.oidcIssuer !== undefined) {
      values.oidcIssuer = normaliseIssuer(dto.oidcIssuer);
      await this.assertDiscoverable(values.oidcIssuer);
    }
    if (dto.oidcClientId !== undefined)
      values.oidcClientId = dto.oidcClientId.trim();
    if (dto.oidcClientSecret)
      values.oidcClientSecret = this.encryptSecret(dto.oidcClientSecret);
    if (dto.allowSignup !== undefined) values.allowSignup = dto.allowSignup;
    if (dto.isEnabled !== undefined) values.isEnabled = dto.isEnabled;
    if (dto.groupSync !== undefined) values.groupSync = dto.groupSync;

    if (dto.isEnabled === false)
      await this.assertNotLastEnforced(existing, workspace);

    const row = await this.db
      .updateTable('authProviders')
      .set(values)
      .where('id', '=', existing.id)
      .returning(PUBLIC_FIELDS as any)
      .executeTakeFirst();
    this.oidcService.forget(existing.id);
    const { oidcClientSecret, updatedAt, ...logged } = values;
    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_UPDATED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: existing.id,
      changes: { after: logged },
    });
    return row;
  }

  async delete(providerId: string, workspace: Workspace) {
    const existing = await this.findForLogin(providerId, workspace.id);
    if (!existing) throw new NotFoundException('SSO provider not found');
    await this.assertNotLastEnforced(existing, workspace);
    await this.db
      .deleteFrom('authProviders')
      .where('id', '=', existing.id)
      .execute();
    this.oidcService.forget(existing.id);
    this.auditService.log({
      event: AuditEvent.SSO_PROVIDER_DELETED,
      resourceType: AuditResource.SSO_PROVIDER,
      resourceId: existing.id,
      changes: { before: { name: existing.name } },
    });
  }

  async test(providerId: string, workspace: Workspace) {
    const p = await this.findForLogin(providerId, workspace.id);
    if (!p) throw new NotFoundException('SSO provider not found');
    const meta = await this.oidcService.describe(p.oidcIssuer);
    return { ok: true, ...meta };
  }

  // password login is blocked while SSO is enforced; keep a way in
  private async assertNotLastEnforced(p: SsoProviderRow, workspace: Workspace) {
    if (!workspace.enforceSso || !p.isEnabled) return;
    const others = await this.db
      .selectFrom('authProviders')
      .select('id')
      .where('workspaceId', '=', workspace.id)
      .where('isEnabled', '=', true)
      .where('id', '!=', p.id)
      .execute();
    if (others.length === 0) {
      throw new BadRequestException(
        'Turn off "Enforce SSO" before disabling the last active provider',
      );
    }
  }

  private async assertDiscoverable(issuer: string) {
    try {
      await this.oidcService.describe(issuer);
    } catch (err: any) {
      throw new BadRequestException(
        `Could not load the OpenID configuration from ${issuer}: ${err?.message ?? err}`,
      );
    }
  }

  private encryptSecret(secret: string) {
    return this.encryption.encrypt(secret, EncryptionPurpose.SSO_CLIENT_SECRET);
  }

  private decryptSecret(value: string | null) {
    if (!value) return null;
    try {
      return this.encryption.decrypt(
        value,
        EncryptionPurpose.SSO_CLIENT_SECRET,
      );
    } catch {
      // rows written before encryption hold the plain secret
      return value;
    }
  }
}
