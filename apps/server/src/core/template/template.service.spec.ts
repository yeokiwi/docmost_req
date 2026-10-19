import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TemplateService } from './template.service';

function ability(canManagePage: boolean, canManageSettings = false) {
  return {
    can: (_action: string, subject: string) =>
      subject === 'settings' ? canManageSettings : canManagePage,
  };
}

function setup(opts: {
  spaceIds?: string[];
  template?: any;
  ability?: any;
  page?: any;
}) {
  const templateRepo = {
    findById: jest.fn().mockResolvedValue(opts.template),
    findTemplates: jest.fn().mockResolvedValue({ items: [] }),
    insertTemplate: jest.fn().mockResolvedValue({ id: 't-new' }),
    updateTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
  };
  const spaceMemberRepo = {
    getUserSpaceIds: jest.fn().mockResolvedValue(opts.spaceIds ?? []),
  };
  const pageRepo = { findById: jest.fn().mockResolvedValue(opts.page) };
  const spaceAbility = {
    createForUser: jest.fn().mockResolvedValue(opts.ability ?? ability(false)),
  };
  const pageAccess = { validateCanView: jest.fn() };
  const service = new TemplateService(
    templateRepo as any,
    spaceMemberRepo as any,
    pageRepo as any,
    spaceAbility as any,
    pageAccess as any,
  );
  return { service, templateRepo, pageAccess };
}

const member = { id: 'u1', role: 'member' } as any;
const admin = { id: 'a1', role: 'admin' } as any;
const ws = (allowMemberTemplates = false) =>
  ({ id: 'w1', settings: { templates: { allowMemberTemplates } } }) as any;

describe('TemplateService', () => {
  it('only admins create workspace templates unless members are allowed', async () => {
    const { service } = setup({});
    await expect(
      service.create({ title: 'T' }, member, ws(false)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const ok = setup({});
    await ok.service.create({ title: 'T' }, member, ws(true));
    expect(ok.templateRepo.insertTemplate).toHaveBeenCalled();

    const adm = setup({});
    await adm.service.create({ title: 'T' }, admin, ws(false));
    expect(adm.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: null,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      }),
    );
  });

  it('space templates need page-edit rights in that space', async () => {
    const denied = setup({ ability: ability(false) });
    await expect(
      denied.service.create({ title: 'T', spaceId: 's1' }, member, ws()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const allowed = setup({ ability: ability(true) });
    await allowed.service.create({ title: 'T', spaceId: 's1' }, member, ws());
    expect(allowed.templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 's1' }),
    );
  });

  it('copies page content without comment marks', async () => {
    const page = {
      id: 'p1',
      workspaceId: 'w1',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello',
                marks: [{ type: 'comment', attrs: { commentId: 'c1' } }],
              },
            ],
          },
        ],
      },
    };
    const { service, templateRepo, pageAccess } = setup({ page });
    await service.create({ title: 'T', pageId: 'p1' }, admin, ws());
    expect(pageAccess.validateCanView).toHaveBeenCalled();
    const inserted = templateRepo.insertTemplate.mock.calls[0][0];
    expect(JSON.stringify(inserted.content)).not.toContain('comment');
    expect(inserted.textContent).toContain('Hello');
  });

  it('hides space templates from non-members', async () => {
    const { service } = setup({
      template: { id: 't1', spaceId: 's2' },
      spaceIds: ['s1'],
    });
    await expect(service.getForRead('t1', member, ws())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('members may only change their own workspace templates', async () => {
    const other = setup({
      template: { id: 't1', spaceId: null, creatorId: 'someone' },
    });
    await expect(
      other.service.update({ templateId: 't1', title: 'x' }, member, ws(true)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const own = setup({
      template: { id: 't1', spaceId: null, creatorId: 'u1' },
    });
    await own.service.update({ templateId: 't1', title: ' x ' }, member, ws(true));
    expect(own.templateRepo.updateTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'x' }),
      't1',
      'w1',
    );
  });

  it('space admins may delete any template in their space', async () => {
    const { service, templateRepo } = setup({
      template: { id: 't1', spaceId: 's1', creatorId: 'someone' },
      spaceIds: ['s1'],
      ability: ability(true, true),
    });
    await service.delete('t1', member, ws());
    expect(templateRepo.deleteTemplate).toHaveBeenCalledWith('t1', 'w1');
  });
});
