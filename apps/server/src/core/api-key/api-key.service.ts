import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { ApiKey, User, Workspace } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { TokenService } from '../auth/services/token.service';
import { JwtApiKeyPayload } from '../auth/dto/jwt-payload';
import { isUserDisabled } from '../../common/helpers';
import { UserRole } from '../../common/helpers/types/permission';
import { CreateApiKeyDto } from './api-key.dto';

// lastUsedAt is informational; avoid a write on every request
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function isAdminRole(role: string | null | undefined) {
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

export function apiRestrictedToAdmins(workspace: Pick<Workspace, 'settings'>) {
  return (workspace.settings as any)?.api?.restrictToAdmins === true;
}

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async list(user: User, workspace: Workspace, adminView = false) {
    if (adminView && !isAdminRole(user.role)) {
      throw new ForbiddenException();
    }
    const rows = await this.db
      .selectFrom('apiKeys as k')
      .leftJoin('users as u', 'u.id', 'k.creatorId')
      .select([
        'k.id',
        'k.name',
        'k.creatorId',
        'k.expiresAt',
        'k.lastUsedAt',
        'k.createdAt',
        'u.name as creatorName',
        'u.email as creatorEmail',
        'u.avatarUrl as creatorAvatarUrl',
      ])
      .where('k.workspaceId', '=', workspace.id)
      .where('k.deletedAt', 'is', null)
      .$if(!adminView, (qb) => qb.where('k.creatorId', '=', user.id))
      .orderBy('k.createdAt', 'desc')
      .execute();
    return { items: rows };
  }

  async create(user: User, workspace: Workspace, dto: CreateApiKeyDto) {
    if (apiRestrictedToAdmins(workspace) && !isAdminRole(user.role)) {
      throw new ForbiddenException('API keys are restricted to workspace admins');
    }

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Expiry date must be in the future');
      }
    }

    const apiKey = await this.db
      .insertInto('apiKeys')
      .values({
        name: dto.name.trim(),
        creatorId: user.id,
        workspaceId: workspace.id,
        expiresAt,
      })
      .returningAll()
      .executeTakeFirst();

    const expiresInSeconds = expiresAt
      ? Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      : undefined;
    const token = await this.tokenService.generateApiToken({
      apiKeyId: apiKey.id,
      user,
      workspaceId: workspace.id,
      expiresIn: expiresInSeconds,
    });

    return { apiKey: this.publicFields(apiKey), token };
  }

  async rename(user: User, workspace: Workspace, apiKeyId: string, name: string) {
    const key = await this.findManageable(user, workspace, apiKeyId);
    await this.db
      .updateTable('apiKeys')
      .set({ name: name.trim(), updatedAt: new Date() })
      .where('id', '=', key.id)
      .execute();
    return { ...this.publicFields(key), name: name.trim() };
  }

  async revoke(user: User, workspace: Workspace, apiKeyId: string) {
    const key = await this.findManageable(user, workspace, apiKeyId);
    await this.db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', key.id)
      .execute();
    return key;
  }

  /** Called by the JWT strategy for tokens of type api_key. */
  async validateApiKey(payload: JwtApiKeyPayload) {
    const key = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', payload.apiKeyId)
      .executeTakeFirst();

    if (
      !key ||
      key.deletedAt ||
      key.workspaceId !== payload.workspaceId ||
      key.creatorId !== payload.sub
    ) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('API key has expired');
    }

    const workspace = await this.workspaceRepo.findById(payload.workspaceId);
    if (!workspace) throw new UnauthorizedException();

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) throw new UnauthorizedException();

    if (apiRestrictedToAdmins(workspace) && !isAdminRole(user.role)) {
      throw new UnauthorizedException('API access is restricted to workspace admins');
    }

    const lastUsed = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
    if (Date.now() - lastUsed > LAST_USED_WRITE_INTERVAL_MS) {
      this.db
        .updateTable('apiKeys')
        .set({ lastUsedAt: new Date() })
        .where('id', '=', key.id)
        .execute()
        .catch(() => undefined);
    }

    return { user, workspace, apiKeyId: key.id };
  }

  private async findManageable(user: User, workspace: Workspace, apiKeyId: string) {
    const key = await this.db
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', apiKeyId)
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!key) throw new NotFoundException('API key not found');
    if (key.creatorId !== user.id && !isAdminRole(user.role)) {
      throw new ForbiddenException();
    }
    return key;
  }

  private publicFields(key: ApiKey) {
    return {
      id: key.id,
      name: key.name,
      creatorId: key.creatorId,
      expiresAt: key.expiresAt,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    };
  }
}
