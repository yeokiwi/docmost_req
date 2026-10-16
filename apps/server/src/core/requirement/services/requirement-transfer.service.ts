import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { Page, User } from '@docmost/db/types/entity.types';
import { generateNodeId } from '@docmost/editor-ext';
import { PageService } from '../../page/services/page.service';
import { RequirementQueryService } from './requirement-query.service';
import { RequirementBaselineService } from './requirement-baseline.service';
import { RequirementSettingsService } from './requirement-settings.service';
import { RequirementIndexService } from './requirement-index.service';
import { RequirementSettingsRepo } from '../repos/requirement-settings.repo';
import { RequirementRepo } from '../repos/requirement.repo';
import {
  ConfirmImportDto,
  RequirementFilterDto,
} from '../dto/requirement.dto';
import {
  buildExportTable,
  collectPropertyNames,
  ImportedRow,
  ParsedSheet,
  parseRequirementKey,
  parseSheetTable,
  SheetRequirement,
} from '../utils/requirement-sheet.util';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../../common/events/audit-events';
import { RequirementPropertyDefinition } from './requirement-settings.service';

const UTF8_BOM = '\uFEFF';

export type ExportFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

@Injectable()
export class RequirementTransferService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    private readonly queryService: RequirementQueryService,
    private readonly baselineService: RequirementBaselineService,
    private readonly settingsService: RequirementSettingsService,
    private readonly settingsRepo: RequirementSettingsRepo,
    private readonly requirementRepo: RequirementRepo,
    private readonly indexService: RequirementIndexService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async export(opts: {
    spaceId: string;
    spaceSlug: string;
    format: 'xlsx' | 'csv';
    filter?: RequirementFilterDto;
    baselineId?: string;
    workspaceId: string;
    userId: string;
  }): Promise<ExportFile> {
    let items: SheetRequirement[];
    let suffix = '';

    if (opts.baselineId) {
      const baseline = await this.baselineService.getBaseline(
        opts.baselineId,
        opts.workspaceId,
      );
      if (baseline.spaceId !== opts.spaceId) {
        throw new NotFoundException('Baseline not found');
      }
      items = (await this.baselineService.getItems(baseline.id)).map((i) => ({
        key: i.key,
        title: i.title,
        description: i.description,
        properties: i.properties,
        pageTitle: i.pageTitle,
        dependsOn: i.dependsOnKeys,
      }));
      suffix = `-baseline-v${baseline.version}`;
    } else {
      items = (
        await this.queryService.findAll(opts.spaceId, opts.filter, opts.userId)
      ).filter((i) => !i.isConflict);
    }

    const settings = await this.settingsService.getSettings(opts.spaceId);
    const schemaNames = (
      (settings?.propertySchema ?? []) as RequirementPropertyDefinition[]
    ).map((d) => d.name);
    const table = buildExportTable(
      items,
      collectPropertyNames(items, schemaNames),
    );

    const baseName = `${opts.spaceSlug || 'space'}-requirements${suffix}`;

    this.auditService.log({
      event: AuditEvent.REQUIREMENTS_EXPORTED,
      resourceType: AuditResource.REQUIREMENT,
      resourceId: opts.spaceId,
      spaceId: opts.spaceId,
      metadata: {
        format: opts.format,
        count: items.length,
        baselineId: opts.baselineId,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Requirements');
    sheet.addRows(table);

    if (opts.format === 'csv') {
      const csv = await workbook.csv.writeBuffer();
      return {
        // BOM so Excel detects UTF-8
        buffer: Buffer.concat([
          Buffer.from(UTF8_BOM, 'utf8'),
          Buffer.from(csv as ArrayBuffer),
        ]),
        fileName: `${baseName}.csv`,
        contentType: 'text/csv; charset=utf-8',
      };
    }

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column, index) => {
      column.width = index === 2 ? 60 : index === 1 ? 40 : 18;
    });
    sheet.getColumn(3).alignment = { wrapText: true, vertical: 'top' };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer as ArrayBuffer),
      fileName: `${baseName}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async parseUpload(buffer: Buffer, ext: string): Promise<ParsedSheet> {
    const workbook = new ExcelJS.Workbook();
    try {
      if (ext === '.csv') {
        const text = buffer.toString('utf8');
        await workbook.csv.read(
          Readable.from(text.startsWith(UTF8_BOM) ? text.slice(1) : text),
        );
      } else {
        await workbook.xlsx.load(buffer as any);
      }
    } catch {
      throw new BadRequestException('Unable to read the spreadsheet file');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('The file has no worksheet');

    const table: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      // exceljs row.values is 1-based
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      table.push(values);
    });

    return parseSheetTable(table);
  }

  /**
   * Annotates parsed rows with the key each will receive: an existing key is
   * kept when it uses this space's prefix and is not already defined.
   */
  async planKeys(
    spaceId: string,
    rows: ImportedRow[],
  ): Promise<Array<ImportedRow & { keepKey: boolean }>> {
    const settings = await this.settingsService.getSettings(spaceId);
    if (!settings) {
      throw new BadRequestException(
        'Configure a requirement key prefix for this space first',
      );
    }

    const candidateKeys = rows
      .map((r) => r.key)
      .filter((k) => parseRequirementKey(k ?? '')?.prefix === settings.keyPrefix);
    const taken = new Set(
      await this.requirementRepo.findActiveKeys(spaceId, candidateKeys),
    );

    const seen = new Set<string>();
    return rows.map((row) => {
      const parsed = parseRequirementKey(row.key ?? '');
      const keepKey =
        !!parsed &&
        parsed.prefix === settings.keyPrefix &&
        !taken.has(row.key) &&
        !seen.has(row.key);
      if (keepKey) seen.add(row.key);
      return { ...row, keepKey };
    });
  }

  async confirmImport(
    dto: ConfirmImportDto,
    user: User,
    workspaceId: string,
  ): Promise<Page> {
    if (dto.rows.length === 0) {
      throw new BadRequestException('Nothing to import');
    }

    const rows: ImportedRow[] = dto.rows.map((r) => ({
      key: r.key?.trim().toUpperCase() || undefined,
      title: r.title.trim(),
      description: r.description,
      properties: this.cleanProperties(r.properties),
    }));
    const planned = await this.planKeys(dto.spaceId, rows);

    const page = await executeTx(this.db, async (trx) => {
      const toAllocate = planned.filter((r) => !r.keepKey).length;
      const allocated =
        toAllocate > 0
          ? await this.settingsService.allocateKeys(
              dto.spaceId,
              toAllocate,
              trx,
            )
          : [];

      let maxKeptSeq = 0;
      let allocIndex = 0;
      const nodes = planned.map((row) => {
        let key: string;
        if (row.keepKey) {
          key = row.key;
          maxKeptSeq = Math.max(maxKeptSeq, parseRequirementKey(key).seq);
        } else {
          key = allocated[allocIndex++];
        }
        return this.buildRequirementNode(key, row);
      });

      if (maxKeptSeq > 0) {
        await this.settingsRepo.ensureSequenceAbove(
          dto.spaceId,
          maxKeptSeq,
          trx,
        );
      }

      return this.pageService.create(
        user.id,
        workspaceId,
        {
          spaceId: dto.spaceId,
          parentPageId: dto.parentPageId,
          title: dto.pageTitle.trim(),
          content: { type: 'doc', content: nodes },
          format: 'json',
        },
        trx,
      );
    });

    // index now rather than waiting for the PAGE_CREATED job, which may
    // have run before the transaction committed
    await this.indexService.indexPage(page.id);

    this.auditService.log({
      event: AuditEvent.REQUIREMENTS_IMPORTED,
      resourceType: AuditResource.REQUIREMENT,
      resourceId: page.id,
      spaceId: dto.spaceId,
      metadata: { count: planned.length, pageId: page.id },
    });

    return page;
  }

  private cleanProperties(
    properties?: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    if (!properties || typeof properties !== 'object') return out;
    for (const [k, v] of Object.entries(properties)) {
      if (typeof v !== 'string' && typeof v !== 'number') continue;
      const name = k.trim().slice(0, 64);
      const value = String(v).trim().slice(0, 500);
      if (name && value) out[name] = value;
    }
    return out;
  }

  private buildRequirementNode(key: string, row: ImportedRow) {
    const paragraphs = (row.description ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        type: 'paragraph',
        attrs: { id: generateNodeId() },
        content: [{ type: 'text', text: line }],
      }));

    return {
      type: 'requirement',
      attrs: {
        id: generateNodeId(),
        key,
        title: row.title,
        properties: row.properties ?? {},
      },
      content:
        paragraphs.length > 0
          ? paragraphs
          : [{ type: 'paragraph', attrs: { id: generateNodeId() } }],
    };
  }
}
