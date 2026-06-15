import { describe, expect, it } from "vitest";

import { createSvgDocument } from "../src/core/svg-document.js";
import { applyOperationsToSvg, insertFragmentIntoSvg } from "../src/core/svg-ops.js";

describe("SVG operations", () => {
  const baseSvg = createSvgDocument({ title: "Test", width: 100, height: 100, unit: "px" });

  it("rejects fragment id conflicts by default", () => {
    const withElement = insertFragmentIntoSvg(baseSvg, {
      fragment: '<rect id="box" x="0" y="0" width="10" height="10"/>',
    }).svg;

    expect(() =>
      insertFragmentIntoSvg(withElement, {
        fragment: '<circle id="box" cx="5" cy="5" r="4"/>',
      }),
    ).toThrow("already exists");
  });

  it("renames fragment id conflicts when requested", () => {
    const withElement = insertFragmentIntoSvg(baseSvg, {
      fragment: '<rect id="box" x="0" y="0" width="10" height="10"/>',
    }).svg;

    const result = insertFragmentIntoSvg(withElement, {
      fragment: '<circle id="box" cx="5" cy="5" r="4"/>',
      renameConflictingIds: true,
    });

    expect(result.renamedIds.box).toMatch(/^box-/);
    expect(result.svg).toContain(`id="${result.renamedIds.box}"`);
  });

  it("does not return a partially applied batch when one operation fails", () => {
    expect(() =>
      applyOperationsToSvg(baseSvg, [
        {
          type: "add",
          elementType: "rect",
          attributes: { id: "first", x: 0, y: 0, width: 10, height: 10 },
        },
        {
          type: "update",
          elementId: "missing",
          setAttributes: { fill: "#ff0000" },
        },
      ]),
    ).toThrow("not found");
  });
});
