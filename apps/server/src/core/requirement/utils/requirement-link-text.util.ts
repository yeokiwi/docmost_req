/**
 * Turns plain-text occurrences of a requirement key in ProseMirror JSON into
 * requirement references, so typed keys become links.
 */

const KEY_CHAR = /[A-Za-z0-9_]/;

// text that must stay as typed: code, and anything already a link
const SKIP_NODES = new Set(['codeBlock', 'requirementRef']);
const SKIP_MARKS = new Set(['code', 'link']);

/** Positions where `key` occurs as a whole token (not inside a longer key). */
export function findKeyOccurrences(text: string, key: string): number[] {
  const out: number[] = [];
  if (!key) return out;
  let from = 0;
  for (;;) {
    const at = text.indexOf(key, from);
    if (at < 0) break;
    const before = at > 0 ? text[at - 1] : '';
    const after = text[at + key.length] ?? '';
    const beforeOk = !before || !(KEY_CHAR.test(before) || before === '-');
    const afterOk = !after || !(KEY_CHAR.test(after) || after === '-');
    if (beforeOk && afterOk) out.push(at);
    from = at + key.length;
  }
  return out;
}

export function linkKeyInPmJson(
  doc: any,
  key: string,
  spaceId: string | null,
  newId: () => string,
): { doc: any; count: number } {
  let count = 0;

  const visit = (node: any): any[] => {
    if (!node || typeof node !== 'object') return [node];

    if (node.type === 'text') {
      const marked = (node.marks ?? []).some((m: any) =>
        SKIP_MARKS.has(m?.type),
      );
      const text: string = node.text ?? '';
      const hits = marked ? [] : findKeyOccurrences(text, key);
      if (!hits.length) return [node];
      const parts: any[] = [];
      let cursor = 0;
      for (const at of hits) {
        if (at > cursor) {
          parts.push({ ...node, text: text.slice(cursor, at) });
        }
        parts.push({
          type: 'requirementRef',
          attrs: { id: newId(), key, requirementId: null, spaceId },
        });
        count++;
        cursor = at + key.length;
      }
      if (cursor < text.length) {
        parts.push({ ...node, text: text.slice(cursor) });
      }
      return parts;
    }

    if (SKIP_NODES.has(node.type) || !Array.isArray(node.content)) {
      return [node];
    }
    return [
      { ...node, content: node.content.flatMap((child: any) => visit(child)) },
    ];
  };

  const [out] = visit(doc);
  return { doc: out, count };
}
