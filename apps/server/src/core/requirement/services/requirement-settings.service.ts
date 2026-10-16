import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { RequirementSpaceSetting } from '@docmost/db/types/entity.types';
import { RequirementSettingsRepo } from '../repos/requirement-settings.repo';
import { UpdateRequirementSettingsDto } from '../dto/requirement.dto';
import { formatRequirementKey } from '../utils/requirement-prosemirror.util';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../../common/events/audit-events';

export type RequirementPropertyDefinition = {
  name: string;
  type: 'text' | 'select';
  options?: string[];
};

@Injectable()
export class RequirementSettingsService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly settingsRepo: RequirementSettingsRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getSettings(spaceId: string): Promise<RequirementSpaceSetting | null> {
    return (await this.settingsRepo.findBySpaceId(spaceId)) ?? null;
  }

  async updateSettings(
    dto: UpdateRequirementSettingsDto,
    workspaceId: string,
  ): Promise<RequirementSpaceSetting> {
    const keyPrefix = dto.keyPrefix.trim().toUpperCase();
    const propertySchema = this.normalizeSchema(dto.propertySchema ?? []);

    const prefixOwner = await this.settingsRepo.findByPrefix(
      workspaceId,
      keyPrefix,
    );
    if (prefixOwner && prefixOwner.spaceId !== dto.spaceId) {
      throw new BadRequestException(
        'This key prefix is already used by another space',
      );
    }

    const existing = await this.settingsRepo.findBySpaceId(dto.spaceId);
    let result: RequirementSpaceSetting;

    if (!existing) {
      result = await this.settingsRepo.insert({
        spaceId: dto.spaceId,
        workspaceId,
        keyPrefix,
        keyPadding: dto.keyPadding ?? 3,
        propertySchema,
      });
    } else {
      if (existing.keyPrefix !== keyPrefix && existing.nextSeq > 1) {
        throw new BadRequestException(
          'The key prefix cannot be changed after keys have been assigned',
        );
      }
      result = await this.settingsRepo.update(dto.spaceId, {
        keyPrefix,
        keyPadding: dto.keyPadding ?? existing.keyPadding,
        propertySchema,
      });
    }

    this.auditService.log({
      event: AuditEvent.REQUIREMENT_SETTINGS_UPDATED,
      resourceType: AuditResource.REQUIREMENT,
      resourceId: dto.spaceId,
      spaceId: dto.spaceId,
      changes: {
        before: existing
          ? { keyPrefix: existing.keyPrefix, keyPadding: existing.keyPadding }
          : undefined,
        after: { keyPrefix: result.keyPrefix, keyPadding: result.keyPadding },
      },
    });

    return result;
  }

  async allocateKeys(
    spaceId: string,
    count = 1,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    const reserved = await this.settingsRepo.reserveSequence(
      spaceId,
      count,
      trx,
    );
    if (!reserved) {
      throw new NotFoundException(
        'Requirements are not configured for this space',
      );
    }
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      keys.push(
        formatRequirementKey(
          reserved.keyPrefix,
          Number(reserved.firstSeq) + i,
          reserved.keyPadding,
        ),
      );
    }
    return keys;
  }

  private normalizeSchema(
    schema: RequirementPropertyDefinition[],
  ): RequirementPropertyDefinition[] {
    const seen = new Set<string>();
    const out: RequirementPropertyDefinition[] = [];
    for (const def of schema) {
      const name = def.name?.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const options =
        def.type === 'select'
          ? [...new Set((def.options ?? []).map((o) => o.trim()))].filter(
              Boolean,
            )
          : undefined;
      out.push({ name, type: def.type === 'select' ? 'select' : 'text', options });
    }
    return out;
  }
}
