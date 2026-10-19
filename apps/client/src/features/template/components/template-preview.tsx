import "@/features/editor/styles/index.css";
import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { mainExtensions } from "@/features/editor/extensions/extensions";

export function TemplatePreview({ content }: { content: any }) {
  const editor = useEditor({
    extensions: mainExtensions,
    editable: false,
    textDirection: "auto",
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.setContent(content ?? "");
  }, [editor, content]);

  return editor ? <EditorContent editor={editor} /> : null;
}
