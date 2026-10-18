import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { IRequirementTypeProperty } from "../types/requirement.types";

/** The table (and its position) that contains document position `pos`. */
export function findTableAround(
  editor: Editor,
  pos: number,
): { node: PMNode; pos: number } | null {
  const $pos = editor.state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "table") return { node, pos: $pos.before(d) };
  }
  return null;
}

/** Heading texts of a table whose first row is a heading row (no requirement in it). */
export function tableHeadings(table: PMNode): string[] | null {
  const first = table.firstChild;
  if (!first) return null;
  let hasRequirement = false;
  first.descendants((n) => {
    if (n.type.name === "requirement") hasRequirement = true;
    return !hasRequirement;
  });
  if (hasRequirement) return null;
  const out: string[] = [];
  first.forEach((cell) => out.push(cell.textContent.trim()));
  return out;
}

/**
 * Quick fix: append a column titled `name` to the table around `pos`.
 * Returns false when the table has no heading row to name the column.
 */
export function addTableColumn(editor: Editor, pos: number, name: string): boolean {
  const table = findTableAround(editor, pos);
  if (!table || !tableHeadings(table.node)) return false;
  const { schema } = editor.state;
  const tr = editor.state.tr;
  const rows: { end: number; header: boolean }[] = [];
  table.node.forEach((row, offset, index) => {
    const start = table.pos + 1 + offset;
    rows.push({ end: start + row.nodeSize - 1, header: index === 0 });
  });
  // last row first so earlier positions stay valid
  for (const row of rows.reverse()) {
    const cell = row.header
      ? schema.nodes.tableHeader.create(
          null,
          schema.nodes.paragraph.create(null, schema.text(name)),
        )
      : schema.nodes.tableCell.create(null, schema.nodes.paragraph.create());
    tr.insert(row.end, cell);
  }
  editor.view.dispatch(tr);
  return true;
}

/** A heading row plus one row holding the requirement: the type's template. */
export function requirementTableTemplate(
  key: string,
  properties: IRequirementTypeProperty[],
  headingLabel: string,
) {
  const text = (value: string) =>
    value ? [{ type: "text", text: value }] : [];
  const th = (value: string) => ({
    type: "tableHeader",
    content: [{ type: "paragraph", content: text(value) }],
  });
  const td = (content: any[]) => ({ type: "tableCell", content });
  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [th(headingLabel), ...properties.map((p) => th(p.name))],
      },
      {
        type: "tableRow",
        content: [
          td([
            {
              type: "requirement",
              attrs: { key, title: "", properties: {} },
              content: [{ type: "paragraph" }],
            },
          ]),
          ...properties.map(() => td([{ type: "paragraph" }])),
        ],
      },
    ],
  };
}
