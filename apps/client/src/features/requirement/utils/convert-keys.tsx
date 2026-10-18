import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import i18n from "@/i18n.ts";
import { linkKeyOccurrences } from "../services/requirement-service";
import { getEditorPageId, resolveEditorSpaceId } from "./editor-space";
import TransformKeyForm, {
  TransformOptions,
} from "../components/transform-key-form";

const KEY_CHAR = /[A-Za-z0-9_]/;

/** A short token without blanks or slashes that contains a digit, e.g. REQ-567 */
export function isKeyLike(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && t.length <= 64 && !/[\s/\\]/.test(t) && /\d/.test(t);
}

/** Positions where `key` stands alone (not inside a longer key). */
export function findKeyOccurrences(text: string, key: string): number[] {
  const out: number[] = [];
  let from = 0;
  while (key) {
    const at = text.indexOf(key, from);
    if (at < 0) break;
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + key.length] ?? "";
    const ok = (c: string) => !c || !(KEY_CHAR.test(c) || c === "-");
    if (ok(before) && ok(after)) out.push(at);
    from = at + key.length;
  }
  return out;
}

type Range = { from: number; to: number };
type KeyBlock = Range & { key: string };

function insideRequirement(doc: PMNode, pos: number): boolean {
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === "requirement") return true;
  }
  return false;
}

/** Paragraphs whose whole text is a key, within the current selection. */
export function selectedKeyParagraphs(editor: Editor): {
  blocks: KeyBlock[];
  mixed: boolean;
} {
  const { selection, doc } = editor.state;
  const blocks: KeyBlock[] = [];
  let mixed = false;

  const consider = (node: PMNode, pos: number, covered: boolean) => {
    const text = node.textContent.trim();
    if (!text || insideRequirement(doc, pos)) return;
    if (covered && isKeyLike(text)) {
      blocks.push({ from: pos, to: pos + node.nodeSize, key: text });
    } else {
      mixed = true;
    }
  };

  if (selection instanceof CellSelection) {
    selection.forEachCell((cell, cellPos) => {
      if (cell.type.name === "tableHeader") return;
      cell.forEach((child, offset) => {
        if (child.type.name === "paragraph") {
          consider(child, cellPos + 1 + offset, true);
        } else if (child.textContent.trim()) {
          mixed = true;
        }
      });
    });
  } else if (!selection.empty) {
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (node.type.name === "requirement") return false;
      if (node.type.name === "paragraph") {
        const covers =
          selection.from <= pos + 1 && selection.to >= pos + node.nodeSize - 1;
        consider(node, pos, covers);
        return false;
      }
      return true;
    });
  }
  return { blocks, mixed };
}

function wrapAsRequirement(tr: Transaction, range: Range, key: string) {
  const { schema } = tr.doc.type;
  const node = schema.nodes.requirement.create(
    { key: key.toUpperCase(), title: "", properties: {} },
    schema.nodes.paragraph.create(),
  );
  tr.replaceWith(range.from, range.to, node);
}

/** Alt+Shift+R over typed keys: each becomes a requirement with that key. */
export function convertSelectedKeys(editor: Editor): boolean {
  const { blocks, mixed } = selectedKeyParagraphs(editor);
  if (!blocks.length || mixed) return false;

  const shown = blocks.slice(0, 3).map((b) => b.key);
  const preview =
    blocks.length > 3 ? `${shown.join(", ")} …` : shown.join(", ");

  modals.openConfirmModal({
    title: i18n.t("Turn keys into requirements"),
    centered: true,
    children: i18n.t(
      "This will turn {{count}} typed keys into requirements ({{keys}}).",
      { count: blocks.length, keys: preview },
    ),
    labels: { confirm: i18n.t("Insert"), cancel: i18n.t("Cancel") },
    onConfirm: () => {
      // read again: the document may have changed while the dialog was open
      const fresh = selectedKeyParagraphs(editor).blocks;
      if (!fresh.length) return;
      const tr = editor.state.tr;
      for (let i = fresh.length - 1; i >= 0; i--) {
        wrapAsRequirement(tr, fresh[i], fresh[i].key);
      }
      editor.view.dispatch(tr);
      notifications.show({
        message: i18n.t("{{count}} requirements inserted", {
          count: fresh.length,
        }),
      });
    },
  });
  return true;
}

/** The selected text when it is a key, and whether it is a paragraph on its own. */
export function selectedKey(
  editor: Editor,
): { key: string; whole: Range | null; selected: Range } | null {
  const { selection, doc } = editor.state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { $from, $to, from, to } = selection;
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return null;
  const key = doc.textBetween(from, to).trim();
  if (!isKeyLike(key)) return null;
  const parent = $from.parent;
  const whole =
    parent.type.name === "paragraph" &&
    parent.textContent.trim() === key &&
    !insideRequirement(doc, from)
      ? { from: $from.before(), to: $from.after() }
      : null;
  return { key, whole, selected: { from, to } };
}

function countSimilar(
  editor: Editor,
  key: string,
  pattern: string,
): number | null {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
  let count = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "requirement") return false;
    if (node.type.name !== "paragraph") return true;
    const text = node.textContent.trim();
    if (text && text !== key && isKeyLike(text) && regex.test(text)) count++;
    return false;
  });
  return count;
}

/** Ranges of loose occurrences of `key` in running text, excluding `skip`. */
function looseOccurrences(editor: Editor, key: string, skip: Range): Range[] {
  const out: Range[] = [];
  editor.state.doc.descendants((node, pos, parent) => {
    if (node.type.name === "codeBlock" || node.type.name === "requirementRef") {
      return false;
    }
    if (!node.isText || !parent) return true;
    if (node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) {
      return true;
    }
    for (const at of findKeyOccurrences(node.text ?? "", key)) {
      const from = pos + at;
      const to = from + key.length;
      if (from >= skip.from && to <= skip.to) continue;
      out.push({ from, to });
    }
    return true;
  });
  return out;
}

function similarBlocks(
  editor: Editor,
  key: string,
  pattern: string,
): KeyBlock[] {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${pattern})$`);
  } catch {
    return [];
  }
  const out: KeyBlock[] = [];
  const seen = new Set<string>();
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "requirement") return false;
    if (node.type.name !== "paragraph") return true;
    const text = node.textContent.trim();
    if (
      text &&
      text !== key &&
      !seen.has(text) &&
      isKeyLike(text) &&
      regex.test(text)
    ) {
      seen.add(text);
      out.push({ from: pos, to: pos + node.nodeSize, key: text });
    }
    return false;
  });
  return out;
}

/**
 * Opens the transform dialog for the selected key. Works in view mode too:
 * the changes are dispatched straight to the editor state, which syncs like
 * any other edit.
 */
export function openTransformDialog(editor: Editor): boolean {
  const found = selectedKey(editor);
  if (!found) return false;
  const { key, whole, selected } = found;

  const id = modals.open({
    title: i18n.t("Transform {{key}}", { key }),
    centered: true,
    children: (
      <TransformKeyForm
        keyText={key}
        whole={!!whole}
        canLinkSpace
        countSimilar={(pattern) => countSimilar(editor, key, pattern)}
        onCancel={() => modals.close(id)}
        onSubmit={(options) => {
          modals.close(id);
          void runTransform(editor, key, whole, selected, options);
        }}
      />
    ),
  });
  return true;
}

/** Applies the page edits of the transform dialog in one transaction. */
export function applyTransform(
  editor: Editor,
  key: string,
  whole: Range | null,
  selected: Range,
  options: Pick<TransformOptions, "definePattern" | "pattern">,
  spaceId: string | null,
) {
  const { state, view } = editor;
  const refType = state.schema.nodes.requirementRef;

  type Edit = { range: Range; apply: (tr: Transaction) => void };
  const edits: Edit[] = [];
  const makeRef = () => refType.create({ key: key.toUpperCase(), spaceId });

  // the selected key itself
  if (whole) {
    edits.push({
      range: whole,
      apply: (tr) => wrapAsRequirement(tr, whole, key),
    });
  } else {
    edits.push({
      range: selected,
      apply: (tr) => tr.replaceWith(selected.from, selected.to, makeRef()),
    });
  }

  // every other occurrence on this page becomes a link
  for (const range of looseOccurrences(editor, key, whole ?? selected)) {
    edits.push({
      range,
      apply: (tr) => tr.replaceWith(range.from, range.to, makeRef()),
    });
  }

  if (whole && options.definePattern) {
    for (const block of similarBlocks(editor, key, options.pattern)) {
      edits.push({
        range: block,
        apply: (tr) => wrapAsRequirement(tr, block, block.key),
      });
    }
  }

  const tr = state.tr;
  // later positions first so earlier ones stay valid
  edits
    .sort((a, b) => b.range.from - a.range.from)
    .forEach((e) => e.apply(tr));
  view.dispatch(tr);
}

async function runTransform(
  editor: Editor,
  key: string,
  whole: Range | null,
  selected: Range,
  options: TransformOptions,
) {
  const spaceId = await resolveEditorSpaceId(editor).catch(() => undefined);
  applyTransform(editor, key, whole, selected, options, spaceId ?? null);

  notifications.show({
    message: i18n.t("{{key}} transformed", { key }),
  });

  if (options.linkSpace && spaceId) {
    try {
      const { pages } = await linkKeyOccurrences({
        spaceId,
        key: key.toUpperCase(),
        excludePageId: getEditorPageId(editor) ?? undefined,
      });
      if (pages > 0) {
        notifications.show({
          message: i18n.t("Linked {{key}} on {{count}} other pages", {
            key,
            count: pages,
          }),
        });
      }
    } catch {
      notifications.show({
        message: i18n.t("Could not link {{key}} on other pages", { key }),
        color: "red",
      });
    }
  }
}
