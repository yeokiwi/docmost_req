import "@/features/editor/styles/index.css";
import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { templateExtensions } from "@/features/editor/extensions/extensions";
import { EditorBubbleMenu } from "@/features/editor/components/bubble-menu/bubble-menu";
import TableMenu from "@/features/editor/components/table/table-menu.tsx";

interface TemplateContentEditorProps {
  content: any;
  editable: boolean;
  onChange: (json: any) => void;
}

// A standalone (non-collaborative) editor for template bodies.
export function TemplateContentEditor({
  content,
  editable,
  onChange,
}: TemplateContentEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: templateExtensions,
    editable,
    content: content ?? "",
    textDirection: "auto",
    immediatelyRender: true,
    onUpdate({ editor }) {
      onChangeRef.current(editor.getJSON());
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <div style={{ position: "relative" }} className="editor-container">
      <EditorContent editor={editor} />
      {editable && (
        <>
          <EditorBubbleMenu editor={editor} />
          <TableMenu editor={editor} />
        </>
      )}
    </div>
  );
}
