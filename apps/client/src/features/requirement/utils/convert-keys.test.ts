import { beforeEach, describe, expect, it, vi } from "vitest";
import { Editor, Node } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table";
import { TableHeader } from "@tiptap/extension-table";
import { TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";

vi.mock("@/i18n.ts", () => ({ default: { t: (k: string) => k } }));
vi.mock("@mantine/modals", () => ({ modals: { open: vi.fn(), close: vi.fn(), openConfirmModal: vi.fn() } }));
vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("../services/requirement-service", () => ({ linkKeyOccurrences: vi.fn() }));
vi.mock("./editor-space", () => ({
  getEditorPageId: () => "p",
  resolveEditorSpaceId: async () => "s",
}));
vi.mock("../components/transform-key-form", () => ({ default: () => null }));

import {
  applyTransform,
  findKeyOccurrences,
  isKeyLike,
  selectedKey,
  selectedKeyParagraphs,
} from "./convert-keys";

// same shape as the real nodes, without the React node views
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
});
const RequirementRef = Node.create({
  name: "requirementRef",
  group: "inline",
  inline: true,
  atom: true,
  renderHTML() {
    return ["span", { "data-type": "requirement-ref" }];
  },
  addAttributes() {
    return { key: { default: "" }, spaceId: { default: null }, requirementId: { default: null } };
  },
});

const para = (text: string) => ({
  type: "paragraph",
  content: text ? [{ type: "text", text }] : [],
});
const cell = (text: string) => ({ type: "tableCell", content: [para(text)] });
const row = (...cells: any[]) => ({ type: "tableRow", content: cells });

function makeEditor(content: any[]) {
  return new Editor({
    extensions: [Document, Paragraph, Text, Table, TableRow, TableCell, TableHeader, Requirement, RequirementRef],
    content: { type: "doc", content },
  });
}

function selectText(editor: Editor, text: string) {
  let from = -1;
  editor.state.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text!.includes(text)) {
      from = pos + node.text!.indexOf(text);
    }
    return from < 0;
  });
  const tr = editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, from, from + text.length),
  );
  editor.view.dispatch(tr);
}

describe("key helpers", () => {
  it("recognises typed keys and whole-token occurrences", () => {
    expect(isKeyLike("REQ-567")).toBe(true);
    expect(isKeyLike("two words 5")).toBe(false);
    expect(isKeyLike("REQ/5")).toBe(false);
    expect(findKeyOccurrences("REQ-5 REQ-56", "REQ-5")).toEqual([0]);
  });
});

describe("selectedKeyParagraphs", () => {
  it("finds typed keys in selected table cells", () => {
    const editor = makeEditor([
      { type: "table", content: [row(cell("TECH-008"), cell("TECH-009"))] },
    ]);
    const cells: number[] = [];
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === "tableCell") cells.push(pos);
    });
    editor.view.dispatch(
      editor.state.tr.setSelection(
        CellSelection.create(editor.state.doc, cells[0], cells[1]),
      ),
    );
    const { blocks, mixed } = selectedKeyParagraphs(editor);
    expect(mixed).toBe(false);
    expect(blocks.map((b) => b.key)).toEqual(["TECH-008", "TECH-009"]);
  });

  it("reports mixed content as not convertible", () => {
    const editor = makeEditor([para("REQ-1"), para("just some prose")]);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1),
      ),
    );
    expect(selectedKeyParagraphs(editor).mixed).toBe(true);
  });
});

describe("applyTransform", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor([
      { type: "table", content: [row(cell("REQ-567"), cell("REQ-890"), cell("REQ-891"))] },
      para("Both REQ-567 and REQ-0567 are mentioned, plus REQ-567 again."),
    ]);
  });

  const names = () => {
    const out: string[] = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === "requirement") out.push(`def:${n.attrs.key}`);
      if (n.type.name === "requirementRef") out.push(`ref:${n.attrs.key}`);
    });
    return out;
  };

  it("defines the selected cell key and links its other occurrences", () => {
    selectText(editor, "REQ-567");
    const found = selectedKey(editor)!;
    expect(found.whole).not.toBeNull();
    applyTransform(editor, found.key, found.whole, found.selected, { definePattern: false, pattern: "" }, null);
    // REQ-0567 is a different key and stays text
    expect(names()).toEqual(["def:REQ-567", "ref:REQ-567", "ref:REQ-567"]);
  });

  it("defines similar keys on the page when asked", () => {
    selectText(editor, "REQ-567");
    const found = selectedKey(editor)!;
    applyTransform(editor, found.key, found.whole, found.selected, { definePattern: true, pattern: "REQ-[^\\s/\\\\]+" }, null);
    expect(names()).toEqual([
      "def:REQ-567",
      "def:REQ-890",
      "def:REQ-891",
      "ref:REQ-567",
      "ref:REQ-567",
    ]);
  });

  it("links a key typed inside running text instead of defining it", () => {
    selectText(editor, "REQ-0567");
    const found = selectedKey(editor)!;
    expect(found.whole).toBeNull();
    applyTransform(editor, found.key, found.whole, found.selected, { definePattern: false, pattern: "" }, null);
    expect(names()).toEqual(["ref:REQ-0567"]);
  });
});
