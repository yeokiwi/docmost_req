export const REQUIREMENT_TYPE = 'requirement';
export const REQUIREMENT_REF_TYPE = 'requirementRef';
export const REQUIREMENT_PROPERTY_TYPE = 'requirementProperty';

export type RequirementSnapshot = {
  nodeId: string;
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
};

export type RequirementRefSnapshot = {
  nodeId: string;
  key: string;
  // the space the ref points at; null means the source page's space
  spaceId: string | null;
  // key of the requirement the link belongs to: the enclosing requirement
  // block, or the requirement defined in the same table row
  sourceKey: string | null;
  // name of the relationship: the title of the table column holding the link
  relation: string | null;
};

// where a node sits inside a table; used to name relationships after columns
type TableContext = {
  relation: string | null;
  rowKey: string | null;
  // the column is marked "ignore for dependencies"
  ignoreDependencies?: boolean;
};

type ColumnMeta = {
  name: string;
  ignoreProperties: boolean;
  ignoreDependencies: boolean;
  // the column holds the requirement's headline/description
  isTitle: boolean;
};

// relationship name of a link written inside a requirement's own text
export const PARAGRAPH_RELATION = 'Dependency';

const TITLE_COLUMN_NAMES = new Set(['description', 'title']);

function findNode(node: any, type: string): any | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = findNode(child, type);
      if (found) return found;
    }
  }
  return null;
}

/** Column name and flags from a heading cell; a property marker overrides the text. */
function columnMeta(cell: any): ColumnMeta {
  const marker = findNode(cell, REQUIREMENT_PROPERTY_TYPE);
  const markerName = String(marker?.attrs?.name ?? '').trim();
  const text = pmNodesToText(cell?.content).replace(/\s+/g, ' ').trim();
  return {
    name: markerName || text,
    ignoreProperties: !!marker?.attrs?.ignoreProperties,
    ignoreDependencies: !!marker?.attrs?.ignoreDependencies,
    isTitle: !!marker?.attrs?.title,
  };
}

/** Without a "Title" marker, a column called Description or Title holds the text. */
function pickTitleColumn(columns: ColumnMeta[]): ColumnMeta | undefined {
  return (
    columns.find((c) => c.isTitle) ??
    columns.find((c) => TITLE_COLUMN_NAMES.has(c.name.toLowerCase()))
  );
}

/**
 * A vertical table lists one requirement's fields as rows: every row starts
 * with a heading cell, and the requirement sits in a value cell.
 */
function isVerticalTable(rows: any[]): boolean {
  if (rows.length < 2) return false;
  const headed = rows.every(
    (r) => r?.content?.[0]?.type === 'tableHeader' && (r.content?.length ?? 0) >= 2,
  );
  if (!headed) return false;
  const inFirstColumn = rows.some((r) => containsRequirement(r.content[0]));
  const inValues = rows.some((r) =>
    (r.content ?? []).slice(1).some((c: any) => containsRequirement(c)),
  );
  return inValues && !inFirstColumn;
}

export const REQUIREMENT_KEY_REGEX = /^[A-Z][A-Z0-9_]{1,15}-\d+$/;

/**
 * Cheap check used on every page save to decide whether indexing is needed.
 */
export function hasRequirementNodes(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false;

  const visit = (node: any): boolean => {
    if (!node || typeof node !== 'object') return false;
    if (node.type === REQUIREMENT_TYPE || node.type === REQUIREMENT_REF_TYPE) {
      return true;
    }
    if (Array.isArray(node.content)) {
      return node.content.some(visit);
    }
    return false;
  };

  return visit(doc);
}

const BLOCK_SEPARATED = new Set([
  'paragraph',
  'heading',
  'listItem',
  'taskItem',
  'codeBlock',
  'tableRow',
  'blockquote',
]);

/**
 * Plain-text rendering of ProseMirror JSON nodes, for requirement
 * descriptions. Inline atoms render as their label.
 */
export function pmNodesToText(nodes: any[] | undefined): string {
  if (!Array.isArray(nodes)) return '';
  const parts: string[] = [];

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    switch (node.type) {
      case 'text':
        parts.push(node.text ?? '');
        return;
      case 'hardBreak':
        parts.push('\n');
        return;
      case 'mention':
        parts.push(node.attrs?.label ? `@${node.attrs.label}` : '');
        return;
      case REQUIREMENT_REF_TYPE:
      case 'status':
        parts.push(node.attrs?.key ?? node.attrs?.text ?? '');
        return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child);
    }
    if (BLOCK_SEPARATED.has(node.type)) parts.push('\n');
  };

  for (const node of nodes) visit(node);

  return parts
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeProperties(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [name, v] of Object.entries(value as Record<string, unknown>)) {
    const trimmedName = name.trim();
    if (!trimmedName || v === null || v === undefined) continue;
    const str = String(v).trim();
    if (str) out[trimmedName] = str;
  }
  return out;
}

function firstRequirementKey(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === REQUIREMENT_TYPE) {
    const key = String(node.attrs?.key ?? '').trim().toUpperCase();
    if (key) return key;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = firstRequirementKey(child);
      if (found) return found;
    }
  }
  return null;
}

function containsRequirement(node: any): boolean {
  return firstRequirementKey(node) !== null;
}

/**
 * Walks a page's ProseMirror JSON and returns the requirements it defines
 * and the requirement references it contains.
 *
 * Requirement nodes without a node id fall back to `key:<KEY>` so content
 * created outside the editor still indexes deterministically. When a page
 * defines the same node id twice, the first occurrence wins.
 *
 * In a table, a reference belongs to the requirement defined in its row and
 * is named after its column's title (the first row, when it defines no
 * requirement).
 */
export function collectRequirementsFromPmJson(doc: unknown): {
  requirements: RequirementSnapshot[];
  refs: RequirementRefSnapshot[];
} {
  const requirements: RequirementSnapshot[] = [];
  const refs: RequirementRefSnapshot[] = [];
  if (!doc || typeof doc !== 'object') return { requirements, refs };

  const seenReqNodes = new Set<string>();
  const seenRefNodes = new Set<string>();
  let refFallbackIndex = 0;

  // properties gathered from table columns and property markers, per key
  const columnProps = new Map<string, Record<string, string>>();
  const markerProps = new Map<string, Record<string, string>>();
  const documentProps: Record<string, string> = {};

  // text of the title column, per key: becomes the title/description when the block has none
  const titleText = new Map<string, string>();
  // the requirement of the last vertical table: following requirements become its children
  let verticalParent: string | null = null;

  const addProp = (
    target: Map<string, Record<string, string>>,
    key: string,
    name: string,
    value: string,
  ) => {
    const props = target.get(key) ?? {};
    if (!(name in props)) props[name] = value;
    target.set(key, props);
  };

  const visitTable = (table: any, enclosingKey: string | null): void => {
    const rows: any[] = Array.isArray(table.content) ? table.content : [];
    if (isVerticalTable(rows)) {
      visitVerticalTable(rows, enclosingKey);
      return;
    }
    const headerRow =
      rows.length > 0 && !containsRequirement(rows[0]) ? rows[0] : null;
    const columns: ColumnMeta[] = [];
    if (headerRow) {
      for (const cell of headerRow.content ?? []) {
        const span = Math.max(1, Number(cell?.attrs?.colspan) || 1);
        const meta = columnMeta(cell);
        for (let i = 0; i < span; i++) columns.push(meta);
      }
    }

    const titleColumn = pickTitleColumn(columns);

    for (const row of rows) {
      if (row === headerRow) {
        // header cells hold titles, not requirements, but visit them anyway
        visit(row, enclosingKey, undefined);
        continue;
      }
      const rowKey = firstRequirementKey(row);
      let col = 0;
      for (const cell of row?.content ?? []) {
        const span = Math.max(1, Number(cell?.attrs?.colspan) || 1);
        const meta = columns[col];
        const ctx: TableContext = {
          relation: meta?.name || null,
          rowKey,
          ignoreDependencies: !!meta?.ignoreDependencies,
        };
        if (Array.isArray(cell?.content)) {
          for (const child of cell.content) visit(child, enclosingKey, ctx);
        }

        // every other column of the row is a property of the row's requirement;
        // a column of links is a dependency instead
        if (
          rowKey &&
          meta?.name &&
          !meta.ignoreProperties &&
          !containsRequirement(cell) &&
          !findNode(cell, REQUIREMENT_REF_TYPE)
        ) {
          const text = pmNodesToText(cell?.content).trim();
          if (text) addProp(columnProps, rowKey, meta.name, text);
        }
        if (rowKey && meta && meta === titleColumn && !containsRequirement(cell)) {
          const text = pmNodesToText(cell?.content).trim();
          if (text && !titleText.has(rowKey)) titleText.set(rowKey, text);
        }
        col += span;
      }
    }
  };

  const visitVerticalTable = (rows: any[], enclosingKey: string | null) => {
    const key = rows.map(firstRequirementKey).find(Boolean) ?? null;
    // set first, so the table's own requirement is not made a child of the previous one
    if (key) verticalParent = null;
    const metas = rows.map((r) => columnMeta(r.content[0]));
    const titleMeta = pickTitleColumn(metas);

    rows.forEach((row, i) => {
      const meta = metas[i];
      const values = (row.content ?? []).slice(1);
      const ctx: TableContext = {
        relation: meta.name || null,
        rowKey: key,
        ignoreDependencies: meta.ignoreDependencies,
      };
      for (const cell of values) {
        for (const child of cell?.content ?? []) visit(child, enclosingKey, ctx);
      }
      if (!key || values.some((c: any) => containsRequirement(c))) return;
      if (values.some((c: any) => findNode(c, REQUIREMENT_REF_TYPE))) return;
      const text = values
        .map((c: any) => pmNodesToText(c?.content).trim())
        .filter(Boolean)
        .join('\n');
      if (!text) return;
      if (meta.name && !meta.ignoreProperties) addProp(columnProps, key, meta.name, text);
      if (meta === titleMeta && !titleText.has(key)) titleText.set(key, text);
    });

    verticalParent = key;
  };

  const visit = (
    node: any,
    enclosingKey: string | null,
    ctx: TableContext | undefined,
  ): void => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'table') {
      visitTable(node, enclosingKey);
      return;
    }

    if (node.type === REQUIREMENT_TYPE) {
      const key = String(node.attrs?.key ?? '').trim().toUpperCase();
      let childKey = enclosingKey;
      if (key) {
        const nodeId =
          typeof node.attrs?.id === 'string' && node.attrs.id
            ? node.attrs.id
            : `key:${key}`;
        if (!seenReqNodes.has(nodeId)) {
          seenReqNodes.add(nodeId);
          // requirements after a vertical table are its children
          if (verticalParent && verticalParent !== key) {
            const linkId = `auto:${verticalParent}:${nodeId}`;
            if (!seenRefNodes.has(linkId)) {
              seenRefNodes.add(linkId);
              refs.push({
                nodeId: linkId,
                key: verticalParent,
                spaceId: null,
                sourceKey: key,
                relation: null,
              });
            }
          }
          requirements.push({
            nodeId,
            key,
            title: String(node.attrs?.title ?? '').trim(),
            description: pmNodesToText(node.content),
            properties: normalizeProperties(node.attrs?.properties),
          });
        }
        childKey = key;
      }
      if (Array.isArray(node.content)) {
        for (const child of node.content) visit(child, childKey, ctx);
      }
      return;
    }

    if (node.type === REQUIREMENT_PROPERTY_TYPE) {
      const name = String(node.attrs?.name ?? '').trim();
      const value = String(node.attrs?.value ?? '').trim();
      // without a value the marker only renames or ignores a column
      if (!name || !value) return;
      if (node.attrs?.wholeDocument) {
        if (!(name in documentProps)) documentProps[name] = value;
        return;
      }
      const target = enclosingKey ?? ctx?.rowKey ?? null;
      if (target) addProp(markerProps, target, name, value);
      return;
    }

    if (node.type === REQUIREMENT_REF_TYPE) {
      const key = String(node.attrs?.key ?? '').trim().toUpperCase();
      // a column marked "ignore for dependencies" links from the page, not the row
      const sourceKey =
        enclosingKey ?? (ctx?.ignoreDependencies ? null : ctx?.rowKey) ?? null;
      // a requirement referencing itself is not a link
      if (!key || key === sourceKey) return;
      const nodeId =
        typeof node.attrs?.id === 'string' && node.attrs.id
          ? node.attrs.id
          : `ref:${refFallbackIndex++}`;
      if (seenRefNodes.has(nodeId)) return;
      seenRefNodes.add(nodeId);
      refs.push({
        nodeId,
        key,
        spaceId:
          typeof node.attrs?.spaceId === 'string' && node.attrs.spaceId
            ? node.attrs.spaceId
            : null,
        sourceKey,
        // in a table the column names the relationship; in the
        // requirement's own text it is a plain "Dependency"
        relation: !sourceKey
          ? null
          : enclosingKey
            ? PARAGRAPH_RELATION
            : ctx?.ignoreDependencies
              ? null
              : (ctx?.relation ?? null),
      });
      return;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child, enclosingKey, ctx);
    }
  };

  visit(doc, null, undefined);

  // an explicit link makes the automatic vertical-table one redundant
  const explicit = new Set(
    refs.filter((r) => !r.nodeId.startsWith('auto:')).map((r) => `${r.sourceKey}|${r.key}`),
  );
  const keptRefs = refs.filter(
    (r) => !r.nodeId.startsWith('auto:') || !explicit.has(`${r.sourceKey}|${r.key}`),
  );

  // precedence: the block's own properties, then markers inside it, then its
  // table columns, then page-wide markers
  for (const r of requirements) {
    const text = titleText.get(r.key);
    if (text) {
      if (!r.title) r.title = text.split('\n')[0].slice(0, 255);
      if (!r.description) r.description = text;
    }
    r.properties = {
      ...documentProps,
      ...(columnProps.get(r.key) ?? {}),
      ...(markerProps.get(r.key) ?? {}),
      ...r.properties,
    };
  }
  return { requirements, refs: keptRefs };
}

export function formatRequirementKey(
  prefix: string,
  seq: number,
  padding: number,
): string {
  return `${prefix}-${String(seq).padStart(padding, '0')}`;
}
