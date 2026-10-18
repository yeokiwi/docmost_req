import { describe, expect, it } from "vitest";
import {
  buildBulkKeys,
  validateBulkKeyParts,
} from "./bulk-insert-requirements-form";

describe("buildBulkKeys", () => {
  it("counts up from the first number and keeps its width", () => {
    expect(buildBulkKeys("TECH-", "008", 3)).toEqual([
      "TECH-008",
      "TECH-009",
      "TECH-010",
    ]);
  });
});

describe("validateBulkKeyParts", () => {
  it("rejects empty prefixes, slashes and non-numeric starts", () => {
    expect(validateBulkKeyParts("", "1")).toBe("prefix");
    expect(validateBulkKeyParts("A/B-", "1")).toBe("slash");
    expect(validateBulkKeyParts("A\\B-", "1")).toBe("slash");
    expect(validateBulkKeyParts("REQ-", "x")).toBe("number");
    expect(validateBulkKeyParts("REQ-", "007")).toBeNull();
  });
});
