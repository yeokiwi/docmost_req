import type { Editor } from "@tiptap/core";
import { ITemplate } from "@/features/template/types.ts";

/**
 * Fills an empty page with a template's content (and its title when the
 * page has none). Returns false when the page already has content.
 */
export function applyTemplateToPage(
  editor: Editor,
  titleEditor: Editor | null,
  template: Pick<ITemplate, "title" | "content">,
): boolean {
  if (!editor.isEmpty) return false;

  if (template.content) {
    editor.commands.setContent(template.content, { emitUpdate: true });
  }

  if (titleEditor && !titleEditor.isDestroyed && template.title) {
    if (titleEditor.getText().trim() === "") {
      titleEditor.commands.setContent(template.title, { emitUpdate: true });
    }
  }
  return true;
}
