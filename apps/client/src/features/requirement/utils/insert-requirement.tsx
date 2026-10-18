import type { Editor, Range } from "@tiptap/core";
import { notifications } from "@mantine/notifications";
import i18n from "@/i18n.ts";
import { CellSelection } from "@tiptap/pm/tables";
import { modals } from "@mantine/modals";
import {
  allocateRequirementKey,
  allocateRequirementKeys,
  getRequirementSettings,
} from "../services/requirement-service";
import BulkInsertRequirementsForm, {
  buildBulkKeys,
} from "../components/bulk-insert-requirements-form";
import { resolveEditorSpaceId } from "./editor-space";

function showError(err: unknown) {
  const status = (err as any)?.response?.status;
  const message =
    status === 404
      ? i18n.t(
          "Requirements are not configured for this space. Set a key prefix in space settings.",
        )
      : (err as any)?.response?.data?.message ||
        i18n.t("Failed to insert requirement");
  notifications.show({ message, color: "red" });
}

/**
 * Alt+Shift+R: with several table cells or paragraphs selected, turn each into
 * its own requirement (after asking for a prefix and first number); otherwise
 * insert a single requirement.
 */
export function insertRequirementFromShortcut(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  if (bulkTargets(editor).length > 0) {
    openBulkInsertDialog(editor);
  } else {
    void insertRequirementBlock(editor);
  }
  return true;
}

type BulkTarget = { from: number; to: number };

/** Content ranges to wrap: selected body cells, or each selected paragraph/heading. */
function bulkTargets(editor: Editor): BulkTarget[] {
  const { selection, schema, doc } = editor.state;
  const reqType = schema.nodes.requirement;
  const hasRequirement = (node: any) => {
    let found = false;
    node.descendants((n: any) => {
      if (n.type === reqType) found = true;
      return !found;
    });
    return found;
  };

  if (selection instanceof CellSelection) {
    const targets: BulkTarget[] = [];
    selection.forEachCell((cell, pos) => {
      // header cells name columns; cells that already hold a requirement are left alone
      if (cell.type.name === "tableHeader" || hasRequirement(cell)) return;
      targets.push({ from: pos + 1, to: pos + cell.nodeSize - 1 });
    });
    return targets;
  }

  if (selection.empty) return [];
  const targets: BulkTarget[] = [];
  doc.nodesBetween(selection.from, selection.to, (node, pos, parent) => {
    if (node.type === reqType) return false;
    if (
      (node.type.name === "paragraph" || node.type.name === "heading") &&
      parent &&
      parent.type.name !== "tableCell" &&
      parent.type.name !== "tableHeader"
    ) {
      if (node.content.size > 0) {
        targets.push({ from: pos, to: pos + node.nodeSize });
      }
      return false;
    }
    return true;
  });
  // a single paragraph is an ordinary insert
  return targets.length > 1 ? targets : [];
}

async function openBulkInsertDialog(editor: Editor) {
  const count = bulkTargets(editor).length;
  let defaultPrefix = "";
  let defaultNumber = "1";
  let spaceKeyPrefix: string | null = null;
  try {
    const spaceId = await resolveEditorSpaceId(editor);
    const settings = spaceId ? await getRequirementSettings(spaceId) : null;
    if (settings) {
      spaceKeyPrefix = `${settings.keyPrefix}-`;
      defaultPrefix = spaceKeyPrefix;
      defaultNumber = String(settings.nextSeq).padStart(settings.keyPadding, "0");
    }
  } catch {
    // fall back to an empty prefix the user fills in
  }

  const id = modals.open({
    title: i18n.t("Insert the requirement macro"),
    centered: true,
    children: (
      <BulkInsertRequirementsForm
        count={count}
        defaultPrefix={defaultPrefix}
        defaultNumber={defaultNumber}
        onCancel={() => modals.close(id)}
        onSubmit={(prefix, first) => {
          modals.close(id);
          const untouched =
            prefix === spaceKeyPrefix && first === defaultNumber;
          void runBulkInsert(editor, prefix, first, untouched);
        }}
      />
    ),
  });
}

async function runBulkInsert(
  editor: Editor,
  prefix: string,
  first: string,
  reserveFromSpace: boolean,
) {
  try {
    // ranges are read again: the document may have changed while the dialog was open
    const targets = bulkTargets(editor);
    if (!targets.length) return;

    let keys: string[];
    if (reserveFromSpace) {
      // the defaults are the space's next keys, so reserve them to keep the sequence moving
      const spaceId = await resolveEditorSpaceId(editor);
      if (!spaceId) return;
      keys = await allocateRequirementKeys(spaceId, targets.length);
    } else {
      keys = buildBulkKeys(prefix, first, targets.length).map((k) =>
        k.toUpperCase(),
      );
    }

    const { state, view } = editor;
    const type = state.schema.nodes.requirement;
    const tr = state.tr;
    // last range first so earlier positions stay valid
    for (let i = targets.length - 1; i >= 0; i--) {
      const { from, to } = targets[i];
      const content = tr.doc.slice(from, to).content;
      const wrapped = type.create(
        { key: keys[i], title: "", properties: {} },
        content,
      );
      tr.replaceWith(from, to, wrapped);
    }
    view.dispatch(tr);
    notifications.show({
      message: i18n.t("{{count}} requirements inserted", {
        count: targets.length,
      }),
    });
  } catch (err) {
    showError(err);
  }
}

export async function insertRequirementBlock(
  editor: Editor,
  range?: Range,
): Promise<void> {
  if (range) editor.chain().focus().deleteRange(range).run();

  try {
    const spaceId = await resolveEditorSpaceId(editor);
    if (!spaceId) return;
    const key = await allocateRequirementKey(spaceId);
    editor.chain().focus().setRequirement({ key, title: "" }).run();
  } catch (err) {
    showError(err);
  }
}

/**
 * Gives an existing requirement block a freshly allocated key, used to
 * resolve duplicate keys after copy/paste.
 */
export async function reassignRequirementKey(
  editor: Editor,
  getPos: () => number | undefined,
): Promise<void> {
  try {
    const spaceId = await resolveEditorSpaceId(editor);
    if (!spaceId) return;
    const key = await allocateRequirementKey(spaceId);
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor
      .chain()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node || node.type.name !== "requirement") return false;
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, key });
        return true;
      })
      .run();
    notifications.show({
      message: i18n.t("Requirement key changed to {{key}}", { key }),
    });
  } catch (err) {
    showError(err);
  }
}

export async function insertRequirementRef(
  editor: Editor,
  range?: Range,
): Promise<void> {
  if (range) editor.chain().focus().deleteRange(range).run();
  const spaceId = await resolveEditorSpaceId(editor).catch(() => undefined);
  editor
    .chain()
    .focus()
    .setRequirementRef({ key: "", spaceId: spaceId ?? null })
    .run();
}

export async function insertRequirementReport(
  editor: Editor,
  range?: Range,
): Promise<void> {
  if (range) editor.chain().focus().deleteRange(range).run();
  const spaceId = await resolveEditorSpaceId(editor).catch(() => undefined);
  if (!spaceId) return;
  editor
    .chain()
    .focus()
    .setRequirementReport({ spaceId, filter: { coverage: "any" } })
    .run();
}
