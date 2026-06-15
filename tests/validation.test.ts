import { describe, expect, it } from "vitest";

import { parseFullSvg, parseSvgFragment } from "../src/core/validation.js";

describe("SVG safety filtering", () => {
  it("rejects script tags", () => {
    expect(() => parseSvgFragment('<script>alert("x")</script>')).toThrow("forbidden");
  });

  it("rejects event handler attributes", () => {
    expect(() => parseSvgFragment('<rect id="a" onclick="alert(1)"/>')).toThrow("Event handler");
  });

  it("rejects remote references", () => {
    expect(() => parseSvgFragment('<use href="https://example.com/icon.svg#x"/>')).toThrow("Remote");
  });

  it("requires explicit full document canvas size", () => {
    expect(() => parseFullSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toThrow("requires");
  });
});
