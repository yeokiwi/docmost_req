export type SheetRequirement = {
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
  pageTitle?: string | null;
  dependsOn?: string[];
  referenceCount?: number;
};

export type ImportedRow = {
  key?: string;
  title: string;
  description?: string;
  properties: Record<string, string>;
};

export type ParsedSheet = {
  rows: ImportedRow[];
  propertyNames: string[];
  warnings: string[];
};

const FIXED_EXPORT_HEADERS = ['Key', 'Title', 'Description', 'Page'];

// Columns produced by export that are derived and ignored on import.
const DERIVED_COLUMNS = new Set([
  'page',
  'depends on',
  'referenced by',
  'reference count',
]);

const KEY_ALIASES = new Set(['key', 'id', 'requirement key', 'req id']);
const TITLE_ALIASES = new Set(['title', 'name', 'summary', 'requirement']);
const DESCRIPTION_ALIASES = new Set(['description', 'text', 'details']);

export const MAX_IMPORT_ROWS = 2000;

export function collectPropertyNames(
  items: SheetRequirement[],
  schemaNames: string[] = [],
): string[] {
  const names = [...schemaNames];
  const seen = new Set(schemaNames.map((n) => n.toLowerCase()));
  for (const item of items) {
    for (const name of Object.keys(item.properties ?? {})) {
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        names.push(name);
      }
    }
  }
  return names;
}

export function buildExportTable(
  items: SheetRequirement[],
  propertyNames: string[],
): string[][] {
  const header = [
    ...FIXED_EXPORT_HEADERS,
    ...propertyNames,
    'Depends on',
    'Reference count',
  ];
  const rows = items.map((item) => [
    item.key,
    item.title ?? '',
    item.description ?? '',
    item.pageTitle ?? '',
    ...propertyNames.map((name) => item.properties?.[name] ?? ''),
    (item.dependsOn ?? []).join(', '),
    item.referenceCount === undefined ? '' : String(item.referenceCount),
  ]);
  return [header, ...rows];
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    // exceljs rich text / hyperlink / formula cells
    const v = value as any;
    if (Array.isArray(v.richText)) {
      return v.richText.map((r: any) => r.text ?? '').join('');
    }
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    return '';
  }
  return String(value);
}

/**
 * Turns a raw 2D sheet (first row = header) into import rows. Unknown columns
 * become properties; derived export columns are ignored.
 */
export function parseSheetTable(table: unknown[][]): ParsedSheet {
  const warnings: string[] = [];
  const nonEmpty = table.filter((row) =>
    (row ?? []).some((c) => cellToString(c).trim() !== ''),
  );
  if (nonEmpty.length === 0) {
    return { rows: [], propertyNames: [], warnings: ['The file is empty'] };
  }

  const header = nonEmpty[0].map((c) => cellToString(c).trim());
  let keyCol = -1;
  let titleCol = -1;
  let descCol = -1;
  const propertyCols: Array<{ index: number; name: string }> = [];

  header.forEach((name, index) => {
    const lower = name.toLowerCase();
    if (!name) return;
    if (keyCol < 0 && KEY_ALIASES.has(lower)) keyCol = index;
    else if (titleCol < 0 && TITLE_ALIASES.has(lower)) titleCol = index;
    else if (descCol < 0 && DESCRIPTION_ALIASES.has(lower)) descCol = index;
    else if (!DERIVED_COLUMNS.has(lower)) {
      propertyCols.push({ index, name: name.slice(0, 64) });
    }
  });

  if (titleCol < 0) {
    return {
      rows: [],
      propertyNames: [],
      warnings: ['A "Title" column is required'],
    };
  }

  const rows: ImportedRow[] = [];
  const body = nonEmpty.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    warnings.push(
      `Only the first ${MAX_IMPORT_ROWS} of ${body.length} rows will be imported`,
    );
  }

  for (const [i, raw] of body.slice(0, MAX_IMPORT_ROWS).entries()) {
    const row = raw ?? [];
    const title = cellToString(row[titleCol]).trim().slice(0, 500);
    if (!title) {
      warnings.push(`Row ${i + 2} skipped: missing title`);
      continue;
    }
    const properties: Record<string, string> = {};
    for (const { index, name } of propertyCols) {
      const value = cellToString(row[index]).trim();
      if (value) properties[name] = value.slice(0, 500);
    }
    rows.push({
      key:
        keyCol >= 0
          ? cellToString(row[keyCol]).trim().toUpperCase() || undefined
          : undefined,
      title,
      description:
        descCol >= 0
          ? cellToString(row[descCol]).trim().slice(0, 20000)
          : undefined,
      properties,
    });
  }

  return {
    rows,
    propertyNames: propertyCols.map((p) => p.name),
    warnings,
  };
}

/**
 * Splits a requirement key into prefix and sequence number, e.g.
 * "SYS-012" -> { prefix: "SYS", seq: 12 }.
 */
export function parseRequirementKey(
  key: string,
): { prefix: string; seq: number } | null {
  const match = /^([A-Z][A-Z0-9_]{1,15})-(\d{1,9})$/.exec(key ?? '');
  if (!match) return null;
  return { prefix: match[1], seq: Number(match[2]) };
}
