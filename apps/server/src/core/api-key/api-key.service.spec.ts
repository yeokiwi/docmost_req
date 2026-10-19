import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

function db(row: any) {
  const chain: any = {
    selectAll: () => chain,
    select: () => chain,
    where: () => chain,
    set: () => chain,
    values: () => chain,
    returningAll: () => chain,
    executeTakeFirst: async () => row,
    execute: async () => [],
  };
  return {
    selectFrom: () => chain,
    updateTable: jest.fn(() => chain),
    insertInto: () => chain,
  };
}

function setup(row: any, opts: { user?: any; workspace?: any } = {}) {
  const user = opts.user ?? { id: 'u1', role: 'member' };
  const workspace = opts.workspace ?? { id: 'w1', settings: {} };
  const tokenService = { generateApiToken: jest.fn().mockResolvedValue('tok') };
  const userRepo = { findById: jest.fn().mockResolvedValue(user) };
  const workspaceRepo = { findById: jest.fn().mockResolvedValue(workspace) };
  const database = db(row);
  const service = new ApiKeyService(
    database as any,
    tokenService as any,
    userRepo as any,
    workspaceRepo as any,
  );
  return { service, tokenService, database };
}

const payload = { sub: 'u1', apiKeyId: 'k1', workspaceId: 'w1', type: 'api_key' } as any;
const key = { id: 'k1', creatorId: 'u1', workspaceId: 'w1', deletedAt: null, expiresAt: null, lastUsedAt: null };

describe('ApiKeyService.validateApiKey', () => {
  it('accepts an active key and records use', async () => {
    const { service, database } = setup(key);
    const res = await service.validateApiKey(payload);
    expect(res.user.id).toBe('u1');
    expect(database.updateTable).toHaveBeenCalledWith('apiKeys');
  });

  it.each([
    ['revoked', { ...key, deletedAt: new Date() }],
    ['expired', { ...key, expiresAt: new Date(Date.now() - 1000) }],
    ['other user', { ...key, creatorId: 'u2' }],
    ['missing', undefined],
  ])('rejects a %s key', async (_label, row) => {
    const { service } = setup(row);
    await expect(service.validateApiKey(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects member keys when the API is restricted to admins', async () => {
    const { service } = setup(key, {
      workspace: { id: 'w1', settings: { api: { restrictToAdmins: true } } },
    });
    await expect(service.validateApiKey(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ApiKeyService.create', () => {
  it('blocks members when restricted to admins', async () => {
    const { service } = setup(key);
    await expect(
      service.create(
        { id: 'u1', role: 'member' } as any,
        { id: 'w1', settings: { api: { restrictToAdmins: true } } } as any,
        { name: 'k' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the token once with the key', async () => {
    const { service, tokenService } = setup({ ...key, name: 'k', createdAt: new Date() });
    const res = await service.create({ id: 'u1', role: 'member' } as any, { id: 'w1', settings: {} } as any, {
      name: 'k',
    });
    expect(res.token).toBe('tok');
    expect(tokenService.generateApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: 'k1', expiresIn: undefined }),
    );
  });
});
