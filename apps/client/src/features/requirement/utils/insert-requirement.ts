import type { Editor, Range } from "@tiptap/core";
import { notifications } from "@mantine/notifications";
import i18n from "@/i18n.ts";
import { allocateRequirementKey } from "../services/requirement-service";
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
