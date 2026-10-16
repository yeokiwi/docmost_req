export const REQUIREMENT_TYPE = 'requirement';
export const REQUIREMENT_REF_TYPE = 'requirementRef';

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
  // key of the enclosing requirement block, if any
  sourceKey: string | null;
};

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

/**
 * Walks a page's ProseMirror JSON and returns the requirements it defines
 * and the requirement references it contains.
 *
 * Requirement nodes without a node id fall back to `key:<KEY>` so content
 * created outside the editor still indexes deterministically. When a page
 * defines the same node id twice, the first occurrence wins.
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

  const visit = (node: any, enclosingKey: string | null): void => {
    if (!node || typeof node !== 'object') return;

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
        for (const child of node.content) visit(child, childKey);
      }
      return;
    }

    if (node.type === REQUIREMENT_REF_TYPE) {
      const key = String(node.attrs?.key ?? '').trim().toUpperCase();
      // a requirement referencing itself is not a link
      if (!key || key === enclosingKey) return;
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
        sourceKey: enclosingKey,
      });
      return;
    }

    if (Array.isArray(node.content)) {
      for (const child of node.content) visit(child, enclosingKey);
    }
  };

  visit(doc, null);
  return { requirements, refs };
}

export function formatRequirementKey(
  prefix: string,
  seq: number,
  padding: number,
): string {
  return `${prefix}-${String(seq).padStart(padding, '0')}`;
}
