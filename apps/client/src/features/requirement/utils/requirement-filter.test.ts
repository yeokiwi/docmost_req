import { describe, expect, it } from "vitest";
import { propertiesToText, textToProperties } from "./requirement-filter";

describe("textToProperties", () => {
  it("parses comma separated name=value pairs", () => {
    expect(textToProperties("Priority=High, Status = Approved")).toEqual({
      Priority: "High",
      Status: "Approved",
    });
  });

  it("keeps '=' inside values and skips malformed parts", () => {
    expect(textToProperties("Rule=a=b, junk, =x, Empty=")).toEqual({
      Rule: "a=b",
    });
  });

  it("handles empty input", () => {
    expect(textToProperties("")).toEqual({});
  });
});

describe("propertiesToText", () => {
  it("round-trips with textToProperties", () => {
    const props = { Priority: "High", Status: "Approved" };
    expect(textToProperties(propertiesToText(props))).toEqual(props);
  });

  it("handles undefined", () => {
    expect(propertiesToText(undefined)).toBe("");
  });
});
