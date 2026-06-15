import { describe, expect, it } from "vitest";

import { assertSafeDocId, createElementId } from "../src/core/ids.js";

describe("ids", () => {
  it("accepts safe docIds", () => {
    expect(assertSafeDocId("logo-draft_01")).toBe("logo-draft_01");
  });

  it("rejects unsafe docIds", () => {
    expect(() => assertSafeDocId("../outside")).toThrow("docId");
    expect(() => assertSafeDocId("has space")).toThrow("docId");
  });

  it("generates safe element ids", () => {
    expect(createElementId("rect")).toMatch(/^rect-[a-f0-9-]+$/);
  });
});
