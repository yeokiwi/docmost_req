import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PersonalSpaceService, personalSlugBase } from './personal-space.service';

describe('personalSlugBase', () => {
  it('builds a slug-safe base from the user name', () => {
    expect(personalSlugBase({ name: 'Zoë  Smith', email: 'z@x.io' })).toBe('zoe-smith-personal');
    expect(personalSlugBase({ name: '', email: 'jane.d@x.io' })).toBe('jane-d-personal');
    expect(personalSlugBase({ name: '日本', email: '' } as any)).toBe('my-personal');
  });
});

describe('PersonalSpaceService.create', () => {
  const user = { id: 'u1', name: 'Jane', email: 'j@x.io' } as any;
  const allowed = { id: 'w1', settings: { spaces: { allowPersonal: true } } } as any;

  function setup(existing?: any, takenSlugs: string[] = []) {
    const spaceRepo = {
      findPersonalSpace: jest.fn().mockResolvedValue(existing),
      slugExists: jest.fn(async (slug: string) => takenSlugs.includes(slug)),
    };
    const spaceService = {
      createSpace: jest.fn(async (_u, _w, dto) => ({ id: 's1', ...dto })),
    };
    return {
      service: new PersonalSpaceService(spaceRepo as any, spaceService as any),
      spaceService,
    };
  }

  it('requires the workspace setting', async () => {
    const { service } = setup();
    await expect(service.create(user, { id: 'w1', settings: {} } as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows only one personal space', async () => {
    const { service } = setup({ id: 'old' });
    await expect(service.create(user, allowed)).rejects.toBeInstanceOf(ConflictException);
  });

  it('picks a free slug and marks the space personal', async () => {
    const { service, spaceService } = setup(undefined, ['jane-personal']);
    await service.create(user, allowed);
    expect(spaceService.createSpace).toHaveBeenCalledWith(
      user,
      'w1',
      expect.objectContaining({ slug: 'jane-personal-2', name: 'Jane' }),
      undefined,
      { isPersonal: true },
    );
  });
});
