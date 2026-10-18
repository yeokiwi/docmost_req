import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User } from '@docmost/db/types/entity.types';
import { PageAccessService } from '../../page/page-access/page-access.service';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';

const MAX_PAGES = 200;

@Injectable()
export class RequirementLinkTextService {
  private readonly logger = new Logger(RequirementLinkTextService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageAccessService: PageAccessService,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  /**
   * Turns typed occurrences of `key` into requirement references on the
   * other pages of the space the user can edit. Returns how many pages were
   * asked to change.
   */
  async linkKeyInSpace(opts: {
    spaceId: string;
    key: string;
    excludePageId?: string;
    user: User;
  }): Promise<{ pages: number }> {
    const { spaceId, key, excludePageId, user } = opts;
    const pattern = `%${key.replace(/[\\%_]/g, '\\$&')}%`;

    let query = this.db
      .selectFrom('pages')
      .select(['id', 'spaceId'])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .where('textContent', 'ilike', pattern);
    if (excludePageId) query = query.where('id', '!=', excludePageId);
    const candidates = await query.limit(MAX_PAGES).execute();

    let changed = 0;
    for (const candidate of candidates) {
      try {
        await this.pageAccessService.validateCanEdit(candidate as Page, user);
      } catch {
        continue; // read-only or restricted pages are left as they are
      }
      try {
        await this.collaborationGateway.handleYjsEvent(
          'linkRequirementKey',
          `page.${candidate.id}`,
          { key, spaceId: null, user },
        );
        changed++;
      } catch (err) {
        this.logger.warn(
          `Could not link ${key} on page ${candidate.id}: ${(err as Error).message}`,
        );
      }
    }
    return { pages: changed };
  }
}
