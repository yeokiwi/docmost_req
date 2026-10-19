import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { Space, User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceService } from './space.service';

export function personalSpacesAllowed(workspace: Pick<Workspace, 'settings'>) {
  return (workspace.settings as any)?.spaces?.allowPersonal === true;
}

/** Base for a personal space slug, e.g. "jane-doe" -> "jane-doe-personal". */
export function personalSlugBase(user: Pick<User, 'name' | 'email'>): string {
  const source = (user.name || user.email?.split('@')[0] || 'my').toLowerCase();
  const cleaned = source
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${cleaned || 'my'}-personal`;
}

@Injectable()
export class PersonalSpaceService {
  constructor(
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceService: SpaceService,
  ) {}

  find(user: User, workspace: Workspace): Promise<Space | undefined> {
    return this.spaceRepo.findPersonalSpace(user.id, workspace.id);
  }

  async create(
    user: User,
    workspace: Workspace,
    name?: string,
  ): Promise<Space> {
    if (!personalSpacesAllowed(workspace)) {
      throw new ForbiddenException('Personal spaces are disabled in this workspace');
    }
    if (await this.find(user, workspace)) {
      throw new ConflictException('You already have a personal space');
    }

    const base = personalSlugBase(user);
    let slug = base;
    for (let i = 2; await this.spaceRepo.slugExists(slug, workspace.id); i++) {
      slug = `${base}-${i}`;
    }

    return this.spaceService.createSpace(
      user,
      workspace.id,
      {
        name: name?.trim() || user.name || 'Personal space',
        description: '',
        slug,
      },
      undefined,
      { isPersonal: true },
    );
  }
}
