import { describe, expect, it } from "vitest";
import { wordDiff } from "./word-diff";

describe("wordDiff", () => {
  it("marks changed words", () => {
    const parts = wordDiff("rate of 2 Hz", "rate of 5 Hz");
    expect(parts.filter((p) => p.kind === "removed").map((p) => p.text)).toEqual(["2"]);
    expect(parts.filter((p) => p.kind === "added").map((p) => p.text)).toEqual(["5"]);
  });
  it("returns a single same part for equal text", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ text: "a b", kind: "same" }]);
  });
});
