import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { v7 } from 'uuid';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { FileTask } from '@docmost/db/types/entity.types';
import { generateSlugId } from '../../../common/helpers';
import { PageService } from '../../../core/page/services/page.service';
import { ImportPageNode } from '../dto/file-task-dto';
import { buildAttachmentCandidates } from '../utils/import.utils';
import {
  ConfluenceAttachment,
  confluencePageId,
  formatConfluenceHtml,
  parseConfluenceIndex,
  parseConfluencePage,
  rewriteConfluenceLinks,
  appendUnreferencedAttachments,
} from '../utils/confluence-formatter';
import { FileImportTaskService } from './file-import-task.service';

type ParsedPage = {
  relPath: string; // relative to the extract dir
  href: string; // file name as referenced inside the export
  title: string;
  bodyHtml: string;
  attachments: ConfluenceAttachment[];
  breadcrumbHrefs: string[];
};

/**
 * Imports a Confluence "Export space → HTML" archive (Cloud, Server and
 * Data Center) into a Docmost space, keeping the page tree, attachments,
 * images, draw.io diagrams and links between pages.
 */
@Injectable()
export class ConfluenceImportService {
  private readonly logger = new Logger(ConfluenceImportService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    @Inject(forwardRef(() => FileImportTaskService))
    private readonly fileImportTaskService: FileImportTaskService,
  ) {}

  async processConfluenceImport(opts: {
    extractDir: string;
    fileTask: FileTask;
  }): Promise<void> {
    const { extractDir, fileTask } = opts;

    const root = await findExportRoot(extractDir);
    if (!root) {
      throw new Error(
        'This does not look like a Confluence HTML export (no index.html or pages found)',
      );
    }
    const rootRel = path.relative(extractDir, root).split(path.sep).join('/');
    const prefix = rootRel ? `${rootRel}/` : '';

    let index: ReturnType<typeof parseConfluenceIndex> = {
      parents: new Map(),
      order: [],
    };
    try {
      index = parseConfluenceIndex(await fs.readFile(path.join(root, 'index.html'), 'utf-8'));
    } catch {
      // exports without index.html still import, flat or by breadcrumbs
    }

    const files = (await fs.readdir(root)).filter(
      (f) => /\.html?$/i.test(f) && !/^index\.html?$/i.test(f),
    );

    const pages = new Map<string, ParsedPage>(); // by href
    for (const file of files) {
      const html = await fs.readFile(path.join(root, file), 'utf-8');
      const parts = parseConfluencePage(html, index.spaceName);
      pages.set(file, { relPath: prefix + file, href: file, ...parts });
    }
    if (pages.size === 0) return;

    // Confluence page id -> export file, for links that use Confluence URLs
    const hrefById = new Map<string, string>();
    for (const href of pages.keys()) {
      const id = confluencePageId(href);
      if (id) hrefById.set(id, href);
    }

    const parentOf = (href: string): string | null => {
      const fromIndex = index.parents.get(href);
      if (fromIndex !== undefined) return fromIndex && pages.has(fromIndex) ? fromIndex : null;
      const crumbs = pages.get(href)!.breadcrumbHrefs.filter((h) => pages.has(h) && h !== href);
      return crumbs.length ? crumbs[crumbs.length - 1] : null;
    };

    const nodes = new Map<string, ImportPageNode>(); // by relPath
    const nodeByHref = new Map<string, ImportPageNode>();
    for (const p of pages.values()) {
      const node: ImportPageNode = {
        id: v7(),
        slugId: generateSlugId(),
        name: p.title || path.basename(p.href, path.extname(p.href)),
        content: '',
        parentPageId: null,
        fileExtension: '.html',
        filePath: p.relPath,
      };
      nodes.set(p.relPath, node);
      nodeByHref.set(p.href, node);
    }

    // parents, guarding against cycles in malformed exports
    for (const href of pages.keys()) {
      let parent = parentOf(href);
      const seen = new Set([href]);
      let cursor = parent;
      while (cursor) {
        if (seen.has(cursor)) {
          parent = null;
          break;
        }
        seen.add(cursor);
        cursor = parentOf(cursor);
      }
      if (parent) nodeByHref.get(href)!.parentPageId = nodeByHref.get(parent)!.id;
    }

    // positions: index order first, then by title
    const orderIdx = new Map(index.order.map((h, i) => [h, i] as const));
    const siblings = new Map<string | null, { href: string; node: ImportPageNode }[]>();
    for (const [href, node] of nodeByHref) {
      const list = siblings.get(node.parentPageId) ?? [];
      list.push({ href, node });
      siblings.set(node.parentPageId, list);
    }
    let rootPos: string | null = null;
    for (const [parentId, list] of siblings) {
      list.sort((a, b) => {
        const ia = orderIdx.get(a.href) ?? Number.MAX_SAFE_INTEGER;
        const ib = orderIdx.get(b.href) ?? Number.MAX_SAFE_INTEGER;
        return ia !== ib ? ia - ib : a.node.name.localeCompare(b.node.name);
      });
      let prev: string | null = null;
      for (const [i, { node }] of list.entries()) {
        if (parentId === null && i === 0) {
          rootPos = await this.pageService.nextPagePosition(fileTask.spaceId);
          node.position = rootPos;
        } else {
          node.position = generateJitteredKeyBetween(prev, null);
        }
        prev = node.position;
      }
    }

    const space = await this.db
      .selectFrom('spaces')
      .select(['slug'])
      .where('id', '=', fileTask.spaceId)
      .executeTakeFirst();

    const attachmentCandidates = await buildAttachmentCandidates(extractDir);

    await this.fileImportTaskService.persistPageTree({
      pagesMap: nodes,
      extractDir,
      fileTask,
      attachmentCandidates,
      spaceSlug: space?.slug,
      keepHeadings: true,
      loadPage: async (node) => {
        const p = pages.get(path.posix.basename(node.filePath))!;
        let html = formatConfluenceHtml(p.bodyHtml);
        html = rewriteConfluenceLinks(html, hrefById);
        html = appendUnreferencedAttachments(html, p.attachments);
        return { html, attachments: p.attachments, isConfluence: true };
      },
    });

    this.logger.log(`Confluence import: ${nodes.size} pages from ${rootRel || '.'}`);
  }
}

/** The folder that holds index.html (exports wrap it in a SPACEKEY folder). */
export async function findExportRoot(dir: string, depth = 0): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && /^index\.html?$/i.test(e.name))) return dir;
  if (depth >= 3) return null;
  const subdirs = entries.filter(
    (e) => e.isDirectory() && !['attachments', 'images', 'styles', '__MACOSX'].includes(e.name),
  );
  for (const d of subdirs) {
    const found = await findExportRoot(path.join(dir, d.name), depth + 1);
    if (found) return found;
  }
  // no index.html: the shallowest folder with page files
  if (depth === 0) {
    if (entries.some((e) => e.isFile() && /\.html?$/i.test(e.name))) return dir;
    for (const d of subdirs) {
      const inner = await fs.readdir(path.join(dir, d.name));
      if (inner.some((f) => /\.html?$/i.test(f))) return path.join(dir, d.name);
    }
  }
  return null;
}
