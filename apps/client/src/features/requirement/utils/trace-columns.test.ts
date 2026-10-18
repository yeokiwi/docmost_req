import { describe, expect, it } from "vitest";
import {
  buildGraph,
  dependencyEdges,
  dependencyLabel,
  relationsInUse,
  toStartQuery,
} from "./trace-columns";

const graph = buildGraph(
  [
    ["FN-1", "BR-1"],
    ["FN-2", "BR-1"],
    ["FN-1", "BR-2"],
  ],
  [
    ["FN-1", "BR-1", "relates"],
    ["FN-1", "BR-2", "refines"],
  ],
);

describe("trace columns", () => {
  it("lists parents and children by relationship", () => {
    const col = (direction: "parents" | "children", relation: string | null) => ({
      id: "x",
      kind: "dependency" as const,
      direction,
      relation,
      oneCell: true,
    });
    expect(dependencyEdges(graph, "FN-1", col("parents", null)).map((e) => e.key)).toEqual(["BR-1", "BR-2"]);
    expect(dependencyEdges(graph, "FN-1", col("parents", "Refines")).map((e) => e.key)).toEqual(["BR-2"]);
    expect(dependencyEdges(graph, "BR-1", col("children", null)).map((e) => e.key)).toEqual(["FN-1", "FN-2"]);
    expect(dependencyEdges(graph, "BR-1", col("children", "relates")).map((e) => e.key)).toEqual(["FN-1"]);
  });

  it("collects relationship names and labels directions", () => {
    expect(relationsInUse(graph)).toEqual(["refines", "relates"]);
    expect(dependencyLabel("parents", "relates", "all")).toBe("< relates");
    expect(dependencyLabel("children", null, "all")).toBe("all >");
  });

  it("turns a prefix into a key search and keeps real queries", () => {
    expect(toStartQuery("BR-")).toBe("key ~ 'BR-%'");
    expect(toStartQuery("key ~ 'BR-%'")).toBe("key ~ 'BR-%'");
    expect(toStartQuery("  ")).toBe("");
  });
});
