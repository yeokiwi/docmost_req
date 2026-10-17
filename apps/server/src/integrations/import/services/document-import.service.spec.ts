import * as fs from 'fs';
import * as path from 'path';
import { DocumentImportService } from './document-import.service';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, '__fixtures__', name));

describe('DocumentImportService', () => {
  let uploads: string[];
  let rows: any[];
  let service: DocumentImportService;

  beforeEach(() => {
    uploads = [];
    rows = [];
    service = new DocumentImportService(
      {
        upload: async (p: string) => {
          uploads.push(p);
        },
      } as any,
      {
        insertInto: () => ({
          values: (v: any) => ({ execute: async () => rows.push(v) }),
        }),
      } as any,
    );
  });

  it('converts a docx with headings, tables and images', async () => {
    const html = await service.convertDocxToHtml(
      fixture('sample.docx'),
      'ws',
      'space',
      'page',
      'user',
    );

    expect(html).toContain('<h1');
    expect(html).toContain('Sample Spec');
    expect(html).toContain('<table');
    expect(html).toContain('SYS-001');
    expect(html).toMatch(/<img[^>]+data-attachment-id="[^"]+"/);
    expect(html).toContain('/api/files/');
    expect(uploads).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pageId: 'page',
      spaceId: 'space',
      workspaceId: 'ws',
      creatorId: 'user',
    });
  });

  it('converts a text pdf to html', async () => {
    const html = await service.convertPdfToHtml(
      fixture('sample.pdf'),
      'ws',
      'space',
      'page',
      'user',
    );

    expect(html).toContain('Sample Spec');
    expect(html).toContain('SYS-001');
  });

  it('rejects a pdf with no extractable text', async () => {
    await expect(
      service.convertPdfToHtml(Buffer.from('not a pdf'), 'ws', 's', 'p', 'u'),
    ).rejects.toThrow();
  });

  it('rejects an empty docx', async () => {
    await expect(
      service.convertDocxToHtml(Buffer.from('nope'), 'ws', 's', 'p', 'u'),
    ).rejects.toThrow();
  });
});
