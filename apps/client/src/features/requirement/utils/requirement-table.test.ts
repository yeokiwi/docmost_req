import { describe, expect, it, vi } from "vitest";
import { Editor, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";

vi.mock("@/i18n.ts", () => ({ default: { t: (k: string) => k } }));
vi.mock("@mantine/modals", () => ({ modals: { open: vi.fn(), close: vi.fn(), openConfirmModal: vi.fn() } }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("../services/requirement-service", () => ({}));
vi.mock("./editor-space", () => ({ resolveEditorSpaceId: async () => "s", getEditorPageId: () => "p" }));
vi.mock("./convert-keys", () => ({ convertSelectedKeys: () => false, openTransformDialog: () => false }));
vi.mock("../components/insert-requirement-dialog", () => ({ default: () => null, matchRequirementType: () => null }));
vi.mock("../components/bulk-insert-requirements-form", () => ({ default: () => null, buildBulkKeys: () => [] }));

import { addTableColumn, findTableAround } from "./requirement-table";
import { insertTypedRequirement } from "./insert-requirement";

// the real node is a React node view; this has the same schema
const Requirement = Node.create({
  name: "requirement",
  group: "block",
  content: "block+",
  renderHTML() {
    return ["div", { "data-type": "requirement" }, 0];
  },
  addAttributes() {
    return { key: { default: "" }, title: { default: "" }, properties: { default: {} } };
  },
  addCommands() {
    return {
      setRequirement:
        (attrs: any) =>
        ({ commands }: any) =>
          commands.insertContent({ type: "requirement", attrs, content: [{ type: "paragraph" }] }),
    } as any;
  },
});

const para = (text = "") => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const make = (content: any[]) =>
  new Editor({
    extensions: [Document, Paragraph, Text, Table, TableRow, TableCell, TableHeader, Requirement],
    content: { type: "doc", content },
  });

const TYPE = {
  id: "t",
  spaceId: "s",
  name: "Functional",
  keyPrefix: "FN-",
  nextSeq: 4,
  keyPadding: 3,
  color: "blue",
  properties: [
    { name: "Priority", required: true },
    { name: "Owner", required: false },
  ],
};

const headings = (editor: Editor) => {
  const out: string[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === "tableHeader") out.push(n.textContent);
  });
  return out;
};

describe("insertTypedRequirement", () => {
  it("inserts the type's table template on an empty line", () => {
    const editor = make([para()]);
    editor.commands.setTextSelection(1);
    insertTypedRequirement(editor, "FN-004", TYPE as any);
    expect(headings(editor)).toEqual(["Requirement", "Priority", "Owner"]);
    let key = "";
    editor.state.doc.descendants((n) => {
      if (n.type.name === "requirement") key = n.attrs.key;
    });
    expect(key).toBe("FN-004");
  });

  it("replaces an empty table with the template", () => {
    const cell = { type: "tableCell", content: [para()] };
    const editor = make([{ type: "table", content: [{ type: "tableRow", content: [cell, cell] }] }]);
    editor.commands.setTextSelection(3);
    insertTypedRequirement(editor, "FN-004", TYPE as any);
    expect(headings(editor)).toEqual(["Requirement", "Priority", "Owner"]);
  });

  it("inserts a plain requirement next to text", () => {
    const editor = make([para("some text")]);
    editor.commands.setTextSelection(5);
    insertTypedRequirement(editor, "FN-004", TYPE as any);
    expect(headings(editor)).toEqual([]);
  });
});

describe("addTableColumn (quick fix)", () => {
  it("adds a titled column to a table with a heading row", () => {
    const th = (t: string) => ({ type: "tableHeader", content: [para(t)] });
    const td = (c: any[]) => ({ type: "tableCell", content: c });
    const editor = make([
      {
        type: "table",
        content: [
          { type: "tableRow", content: [th("Requirement"), th("Priority")] },
          {
            type: "tableRow",
            content: [
              td([{ type: "requirement", attrs: { key: "FN-1" }, content: [para()] }]),
              td([para("High")]),
            ],
          },
        ],
      },
    ]);
    let reqPos = -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === "requirement") reqPos = pos;
    });
    expect(findTableAround(editor, reqPos + 1)).not.toBeNull();
    expect(addTableColumn(editor, reqPos + 1, "Owner")).toBe(true);
    expect(headings(editor)).toEqual(["Requirement", "Priority", "Owner"]);
    // every row got a cell
    editor.state.doc.descendants((n) => {
      if (n.type.name === "tableRow") expect(n.childCount).toBe(3);
    });
  });
});
