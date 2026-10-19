import { DbAuditService } from './db-audit.service';

function setup(ctx: any) {
  const values = jest.fn();
  const db = {
    insertInto: jest.fn(() => ({
      values: (v: any) => {
        values(v);
        return { execute: () => Promise.resolve() };
      },
    })),
  };
  const cls = { get: jest.fn(() => ctx), set: jest.fn() };
  return { service: new DbAuditService(db as any, cls as any), values, db };
}

const U1 = '0191a0b0-0000-7000-8000-000000000001';
const S1 = '0191a0b0-0000-7000-8000-000000000002';

describe('DbAuditService', () => {
  it('writes the event with request context', () => {
    const { service, values } = setup({
      workspaceId: 'w1',
      actorId: U1,
      actorType: 'user',
      ipAddress: '::ffff:10.0.0.5',
      userAgent: 'jest',
    });
    service.log({ event: 'page.created', resourceType: 'page', resourceId: U1, spaceId: S1 } as any);
    expect(values.mock.calls[0][0][0]).toMatchObject({
      workspaceId: 'w1',
      actorId: U1,
      actorType: 'user',
      resourceId: U1,
      spaceId: S1,
      ipAddress: '10.0.0.5',
      userAgent: 'jest',
    });
  });

  it('skips events outside a workspace request', () => {
    const { service, db } = setup({ workspaceId: null });
    service.log({ event: 'x', resourceType: 'page' } as any);
    expect(db.insertInto).not.toHaveBeenCalled();
  });

  it('uses the user as actor for unauthenticated auth events', () => {
    const { service, values } = setup({ workspaceId: 'w1', actorId: null });
    service.log({ event: 'user.login', resourceType: 'user', resourceId: U1 } as any);
    expect(values.mock.calls[0][0][0]).toMatchObject({ actorId: U1, actorType: 'user' });
  });

  it('keeps non-uuid resource ids in metadata', () => {
    const { service, values } = setup({ workspaceId: 'w1', actorId: U1 });
    service.log({ event: 'workspace.updated', resourceType: 'workspace', resourceId: 'settings' } as any);
    const row = values.mock.calls[0][0][0];
    expect(row.resourceId).toBeNull();
    expect(row.metadata).toEqual({ resourceKey: 'settings' });
  });
});
