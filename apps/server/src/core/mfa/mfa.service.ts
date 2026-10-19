import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import * as QRCode from 'qrcode';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import { comparePasswordHash } from '../../common/helpers';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  buildTotp,
  findBackupCode,
  generateBackupCodes,
  hashBackupCode,
  newTotpSecret,
  verifyTotp,
} from './mfa.util';

type MfaRow = {
  id: string;
  userId: string;
  workspaceId: string;
  isEnabled: boolean | null;
  method: string;
  secret: string | null;
  backupCodes: string[] | null;
};

@Injectable()
export class MfaService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly encryption: EncryptionService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  private findRow(userId: string, workspaceId: string): Promise<MfaRow | undefined> {
    return this.db
      .selectFrom('userMfa')
      .selectAll()
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst() as Promise<MfaRow | undefined>;
  }

  private secretOf(row: MfaRow): string {
    return this.encryption.decrypt(row.secret, EncryptionPurpose.MFA_SECRET);
  }

  async status(user: User, workspace: Workspace) {
    const row = await this.findRow(user.id, workspace.id);
    return {
      isEnabled: !!row?.isEnabled,
      method: row?.method ?? 'totp',
      backupCodesRemaining: row?.isEnabled ? row.backupCodes?.length ?? 0 : 0,
      isEnforced: workspace.enforceMfa === true,
    };
  }

  /** Starts (or restarts) enrolment with a fresh secret. */
  async beginSetup(user: User, workspace: Workspace) {
    const existing = await this.findRow(user.id, workspace.id);
    if (existing?.isEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }

    const secret = newTotpSecret();
    const encrypted = this.encryption.encrypt(secret, EncryptionPurpose.MFA_SECRET);
    if (existing) {
      await this.db
        .updateTable('userMfa')
        .set({ secret: encrypted, method: 'totp', isEnabled: false, backupCodes: null, updatedAt: new Date() })
        .where('id', '=', existing.id)
        .execute();
    } else {
      await this.db
        .insertInto('userMfa')
        .values({
          userId: user.id,
          workspaceId: workspace.id,
          method: 'totp',
          isEnabled: false,
          secret: encrypted,
        })
        .execute();
    }

    const totp = buildTotp(secret, user.email, workspace.name || 'Docmost');
    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  /** Confirms enrolment with a code from the app; returns backup codes once. */
  async enable(user: User, workspace: Workspace, code: string) {
    const row = await this.findRow(user.id, workspace.id);
    if (!row?.secret) {
      throw new BadRequestException('Start the setup first');
    }
    if (row.isEnabled) {
      throw new BadRequestException('Two-factor authentication is already enabled');
    }
    if (!verifyTotp(this.secretOf(row), code)) {
      throw new BadRequestException('The code is not valid. Check the time on your device and try again.');
    }

    const backupCodes = generateBackupCodes();
    await this.db
      .updateTable('userMfa')
      .set({
        isEnabled: true,
        backupCodes: backupCodes.map(hashBackupCode),
        updatedAt: new Date(),
      })
      .where('id', '=', row.id)
      .execute();

    this.auditService.setActorId(user.id);
    this.auditService.log({
      event: AuditEvent.USER_MFA_ENABLED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
    return { backupCodes };
  }

  /**
   * Second step of sign-in: a code from the authenticator app, or a
   * single-use backup code.
   */
  async verifyLoginCode(user: User, workspace: Workspace, code: string): Promise<void> {
    const row = await this.findRow(user.id, workspace.id);
    if (!row?.isEnabled || !row.secret) {
      throw new UnauthorizedException('Two-factor authentication is not set up');
    }
    if (verifyTotp(this.secretOf(row), code)) return;

    const hashes = row.backupCodes ?? [];
    const idx = findBackupCode(hashes, code);
    if (idx === -1) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    const remaining = hashes.filter((_, i) => i !== idx);
    await this.db
      .updateTable('userMfa')
      .set({ backupCodes: remaining, updatedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
  }

  async disable(user: User, workspace: Workspace, password: string) {
    if (workspace.enforceMfa) {
      throw new ForbiddenException('Your workspace requires two-factor authentication');
    }
    await this.assertPassword(user, workspace, password);
    await this.db
      .deleteFrom('userMfa')
      .where('userId', '=', user.id)
      .where('workspaceId', '=', workspace.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
  }

  async regenerateBackupCodes(user: User, workspace: Workspace, code: string) {
    const row = await this.findRow(user.id, workspace.id);
    if (!row?.isEnabled) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }
    if (!verifyTotp(this.secretOf(row), code)) {
      throw new BadRequestException('Invalid authentication code');
    }
    const backupCodes = generateBackupCodes();
    await this.db
      .updateTable('userMfa')
      .set({ backupCodes: backupCodes.map(hashBackupCode), updatedAt: new Date() })
      .where('id', '=', row.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.USER_MFA_BACKUP_CODE_GENERATED,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
    return { backupCodes };
  }

  /** Workspace admins can clear a member's 2FA (e.g. lost device). */
  async resetForUser(admin: User, workspace: Workspace, userId: string) {
    if (admin.role !== 'owner' && admin.role !== 'admin') {
      throw new ForbiddenException();
    }
    const target = await this.userRepo.findById(userId, workspace.id);
    if (!target) throw new BadRequestException('User not found');
    if (target.role === 'owner' && admin.role !== 'owner') {
      throw new ForbiddenException('Only an owner can reset an owner');
    }
    await this.db
      .deleteFrom('userMfa')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspace.id)
      .execute();
    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: userId,
      metadata: { resetBy: admin.id },
    });
  }

  private async assertPassword(user: User, workspace: Workspace, password: string) {
    const withPassword = await this.userRepo.findById(user.id, workspace.id, {
      includePassword: true,
    });
    if (!withPassword?.password || !(await comparePasswordHash(password, withPassword.password))) {
      throw new BadRequestException('Incorrect password');
    }
  }
}
