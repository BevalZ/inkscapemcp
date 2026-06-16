import { describe, expect, it } from "vitest";

import { finalizeGeometrySvg, prepareGeometrySvg } from "../src/core/geometry.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { insertFragmentIntoSvg } from "../src/core/svg-ops.js";

describe("geometry helpers", () => {
  const baseSvg = insertFragmentIntoSvg(
    createSvgDocument({ title: "Geometry", width: 100, height: 100, unit: "px" }),
    {
      fragment: `
        <rect id="a" x="0" y="0" width="40" height="40"/>
        <rect id="b" x="20" y="20" width="40" height="40"/>
        <circle id="untouched" cx="80" cy="80" r="5"/>
      `,
    },
  ).svg;

  it("rejects missing selected ids", () => {
    expect(() => prepareGeometrySvg(baseSvg, ["missing"], {})).toThrow("not found");
  });

  it("rejects resultId conflicts outside selected ids", () => {
    expect(() => prepareGeometrySvg(baseSvg, ["a", "b"], { resultId: "untouched" })).toThrow("already exists");
  });

  it("repairs a single geometry result id and ignores Inkscape metadata nodes", () => {
    const prepared = prepareGeometrySvg(baseSvg, ["a", "b"], { resultId: "merged" });
    const inkscapeSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" id="svg1">
        <defs id="defs1"/>
        <sodipodi:namedview xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" id="namedview1"/>
        <path id="a" d="M 0 0 L 10 0"/>
        <circle id="untouched" cx="80" cy="80" r="5"/>
      </svg>
    `;

    const finalized = finalizeGeometrySvg(inkscapeSvg, prepared, { resultId: "merged" });

    expect(finalized.resultIds).toEqual(["merged"]);
    expect(finalized.svg).toContain('id="merged"');
    expect(finalized.svg).toContain('id="untouched"');
  });
});
