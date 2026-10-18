/**
 * Column model of the traceability tree: built-in fields, properties, and
 * dependencies by direction and relationship (as in Requirement Yogi's
 * "< relates" / "relates >" columns).
 */

export type BuiltinField = "title" | "page" | "status" | "type" | "referencedIn";

export type TraceColumn =
  | { id: string; kind: "builtin"; field: BuiltinField; title?: string }
  | { id: string; kind: "property"; name: string; title?: string }
  | {
      id: string;
      kind: "dependency";
      // parents: requirements this one references; children: those referencing it
      direction: "parents" | "children";
      // null means every relationship
      relation: string | null;
      oneCell: boolean;
      title?: string;
    };

// a column before it gets an id (Omit that keeps each union member apart)
export type NewTraceColumn = TraceColumn extends infer C
  ? C extends TraceColumn
    ? Omit<C, "id">
    : never
  : never;

export type Edge = { key: string; relation: string | null };

export type TraceGraph = {
  parents: Map<string, Edge[]>;
  children: Map<string, Edge[]>;
};

let counter = 0;
export function newColumnId() {
  counter += 1;
  return `c${Date.now().toString(36)}${counter}`;
}

export function defaultColumns(): TraceColumn[] {
  return [
    { id: "refs", kind: "dependency", direction: "parents", relation: null, oneCell: true },
    { id: "pages", kind: "builtin", field: "referencedIn" },
  ];
}

/** cells: [row, col] where row references col; cellRelations names some of them. */
export function buildGraph(
  cells: Array<[string, string]>,
  cellRelations: Array<[string, string, string]> = [],
): TraceGraph {
  const names = new Map(cellRelations.map(([r, c, n]) => [`${r}|${c}`, n]));
  const parents = new Map<string, Edge[]>();
  const children = new Map<string, Edge[]>();
  for (const [row, col] of cells) {
    const relation = names.get(`${row}|${col}`) ?? null;
    parents.set(row, [...(parents.get(row) ?? []), { key: col, relation }]);
    children.set(col, [...(children.get(col) ?? []), { key: row, relation }]);
  }
  return { parents, children };
}

export function dependencyEdges(
  graph: TraceGraph,
  key: string,
  column: Extract<TraceColumn, { kind: "dependency" }>,
): Edge[] {
  const edges =
    (column.direction === "parents" ? graph.parents : graph.children).get(key) ?? [];
  if (!column.relation) return edges;
  const wanted = column.relation.toLowerCase();
  return edges.filter((e) => (e.relation ?? "").toLowerCase() === wanted);
}

export function relationsInUse(graph: TraceGraph): string[] {
  const names = new Set<string>();
  for (const edges of graph.parents.values()) {
    for (const e of edges) if (e.relation) names.add(e.relation);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** "< relates" lists what a requirement references, "relates >" what references it. */
export function dependencyLabel(
  direction: "parents" | "children",
  relation: string | null,
  anyLabel: string,
): string {
  const name = relation ?? anyLabel;
  return direction === "parents" ? `< ${name}` : `${name} >`;
}

/** A plain key prefix becomes a search; text with an operator is already one. */
export function toStartQuery(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/[=~]/.test(value)) return value;
  return `key ~ '${value.replace(/'/g, "''")}%'`;
}
