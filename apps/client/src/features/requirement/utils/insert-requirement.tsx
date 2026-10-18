import type { Editor, Range } from "@tiptap/core";
import { notifications } from "@mantine/notifications";
import i18n from "@/i18n.ts";
import { CellSelection } from "@tiptap/pm/tables";
import { modals } from "@mantine/modals";
import {
  allocateRequirementKey,
  allocateRequirementKeys,
  getRequirementSettings,
  listRequirementTypes,
} from "../services/requirement-service";
import {
  IRequirementType,
  IRequirementTypeList,
} from "../types/requirement.types";
import {
  findTableAround,
  requirementTableTemplate,
} from "./requirement-table";
import { convertSelectedKeys, openTransformDialog } from "./convert-keys";
import InsertRequirementDialog, {
  matchRequirementType,
} from "../components/insert-requirement-dialog";
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
 * Alt+Shift+R: typed keys in the selection become requirements; a key inside
 * text opens the transform dialog; several empty cells or paragraphs get new
 * keys (after asking for a prefix and first number); otherwise a single
 * requirement is inserted.
 */
export function insertRequirementFromShortcut(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  // keys that are already typed become requirements with those keys
  if (convertSelectedKeys(editor)) return true;
  // a key selected inside running text: link/transform dialog
  if (openTransformDialog(editor)) return true;
  if (bulkTargets(editor).length > 0) {
    openBulkInsertDialog(editor);
  } else {
    void openInsertDialog(editor);
  }
  return true;
}

/** Ask for a key: a new one defines a requirement, an existing one links to it. */
async function openInsertDialog(editor: Editor) {
  const spaceId = await resolveEditorSpaceId(editor).catch(() => undefined);
  let nextKey: string | null = null;
  let typeList: IRequirementTypeList | null = null;
  try {
    const [settings, types] = await Promise.all([
      spaceId ? getRequirementSettings(spaceId) : null,
      spaceId ? listRequirementTypes(spaceId) : null,
    ]);
    typeList = types;
    if (settings) {
      nextKey = `${settings.keyPrefix}-${String(settings.nextSeq).padStart(settings.keyPadding, "0")}`;
    }
  } catch {
    // no prefix configured: the user types a key
  }
  // remember where the cursor was; the dialog takes focus
  const { from, to } = editor.state.selection;
  const types = typeList?.types ?? [];

  const id = modals.open({
    title: i18n.t("Insert requirement"),
    centered: true,
    children: (
      <InsertRequirementDialog
        spaceId={spaceId}
        nextKey={nextKey}
        types={types}
        lockKeys={typeList?.lockKeys}
        defaultPrefix={typeList?.defaultPrefix}
        onSelect={async (choice) => {
          modals.close(id);
          editor.chain().focus().setTextSelection({ from, to }).run();
          try {
            if (choice.kind === "next") {
              await insertRequirementBlock(editor);
            } else if (choice.kind === "type") {
              const [key] = await allocateRequirementKeys(spaceId!, 1, choice.type.id);
              insertTypedRequirement(editor, key, choice.type);
            } else if (choice.kind === "define") {
              insertTypedRequirement(
                editor,
                choice.key,
                matchRequirementType(choice.key, types),
              );
            } else {
              editor
                .chain()
                .focus()
                .setRequirementRef({ key: choice.key, spaceId: spaceId ?? null })
                .run();
            }
          } catch (err) {
            showError(err);
          }
        }}
      />
    ),
  });
}

/**
 * Inserts a requirement; when its type has properties and the cursor is on an
 * empty line or in an empty table, inserts the type's table template instead.
 */
export function insertTypedRequirement(
  editor: Editor,
  key: string,
  type: IRequirementType | null,
) {
  const properties = type?.properties ?? [];
  const { state } = editor;
  const { $from } = state.selection;

  if (properties.length) {
    const template = requirementTableTemplate(
      key,
      properties,
      i18n.t("Requirement"),
    );
    const table = findTableAround(editor, $from.pos);
    if (table) {
      let hasRequirement = false;
      table.node.descendants((n) => {
        if (n.type.name === "requirement") hasRequirement = true;
        return !hasRequirement;
      });
      // columns are only added to a table that has no text yet
      if (!hasRequirement && !table.node.textContent.trim()) {
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: table.pos, to: table.pos + table.node.nodeSize },
            template,
          )
          .run();
        return;
      }
    } else if (
      $from.parent.type.name === "paragraph" &&
      $from.parent.content.size === 0 &&
      $from.depth === 1
    ) {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: $from.before(), to: $from.after() }, template)
        .run();
      return;
    }
  }

  editor.chain().focus().setRequirement({ key, title: "" }).run();
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
  let typeList: IRequirementTypeList | null = null;
  try {
    const spaceId = await resolveEditorSpaceId(editor);
    const [settings, types] = await Promise.all([
      spaceId ? getRequirementSettings(spaceId) : null,
      spaceId ? listRequirementTypes(spaceId).catch(() => null) : null,
    ]);
    typeList = types;
    if (settings) {
      spaceKeyPrefix = `${settings.keyPrefix}-`;
      defaultPrefix = spaceKeyPrefix;
      defaultNumber = String(settings.nextSeq).padStart(settings.keyPadding, "0");
    }
  } catch {
    // fall back to an empty prefix the user fills in
  }
  const types = typeList?.types ?? [];
  // with locked keys only the types' prefixes (and the space prefix) are allowed
  const allowedPrefixes = typeList?.lockKeys
    ? [...types.map((t) => t.keyPrefix), ...(spaceKeyPrefix ? [spaceKeyPrefix] : [])]
    : null;
  const typeNext = (type: IRequirementType) =>
    String(type.nextSeq).padStart(type.keyPadding, "0");

  const id = modals.open({
    title: i18n.t("Insert the requirement macro"),
    centered: true,
    children: (
      <BulkInsertRequirementsForm
        count={count}
        defaultPrefix={defaultPrefix}
        defaultNumber={defaultNumber}
        allowedPrefixes={allowedPrefixes}
        prefixSuggestions={types.map((t) => ({
          prefix: t.keyPrefix,
          number: typeNext(t),
          label: t.name,
        }))}
        onCancel={() => modals.close(id)}
        onSubmit={(prefix, first) => {
          modals.close(id);
          const upper = prefix.toUpperCase();
          // the next keys of the space or of a type are reserved, so the sequence moves on
          const type = types.find(
            (t) => t.keyPrefix === upper && typeNext(t) === first,
          );
          const reserve: Reserve = type
            ? { typeId: type.id }
            : prefix === spaceKeyPrefix && first === defaultNumber
              ? { space: true }
              : null;
          void runBulkInsert(editor, prefix, first, reserve);
        }}
      />
    ),
  });
}

type Reserve = { space: true } | { typeId: string } | null;

async function runBulkInsert(
  editor: Editor,
  prefix: string,
  first: string,
  reserve: Reserve,
) {
  try {
    // ranges are read again: the document may have changed while the dialog was open
    const targets = bulkTargets(editor);
    if (!targets.length) return;

    let keys: string[];
    if (reserve) {
      const spaceId = await resolveEditorSpaceId(editor);
      if (!spaceId) return;
      keys = await allocateRequirementKeys(
        spaceId,
        targets.length,
        "typeId" in reserve ? reserve.typeId : undefined,
      );
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
