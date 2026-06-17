import { describe, expect, it } from "vitest";

import { createSvgDocument } from "../src/core/svg-document.js";
import { pathSegmentsToD, validatePathData } from "../src/core/path-data.js";
import {
  appendPathSegmentInSvg,
  applyOperationsToSvg,
  drawPathInSvg,
  editPathNodesInSvg,
  insertFragmentIntoSvg,
  queryPathNodesInSvg,
  replaceAttributeValuesInSvg,
  replacePathDataInSvg,
} from "../src/core/svg-ops.js";

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

  it("replaces attribute and style values in-place without changing geometry or ids", () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <title>Colors</title>
  <defs>
    <linearGradient id="skin">
      <stop id="skin-start" offset="0%" stop-color="#ffd5df"/>
    </linearGradient>
  </defs>
  <circle id="head" cx="50" cy="50" r="20" fill="#ffd5df" stroke="#9f6b1f"/>
  <path id="smile" d="M40 60c6 5 14 5 20 0" style="stroke: #8e3f55; fill: none"/>
</svg>`;

    const result = replaceAttributeValuesInSvg(svg, {
      replacements: [
        { from: "#ffd5df", to: "#fff4a8" },
        { from: "#8e3f55", to: "#7b4f22", styleProperties: ["stroke"] },
      ],
    });

    expect(result.result).toMatchObject({
      changedElementCount: 3,
      changedAttributeCount: 3,
      replacementCount: 3,
    });
    expect(result.result.changedElementIds).toEqual(["skin-start", "head", "smile"]);
    expect(result.result.directAttributeUpdates).toEqual([
      { elementId: "skin-start", attributeName: "stop-color", value: "#fff4a8" },
      { elementId: "head", attributeName: "fill", value: "#fff4a8" },
    ]);
    expect(result.svg).toContain('id="head"');
    expect(result.svg).toContain('cx="50"');
    expect(result.svg).toContain('r="20"');
    expect(result.svg).toContain('fill="#fff4a8"');
    expect(result.svg).toContain("stroke: #7b4f22");
    expect(result.svg).not.toContain("#ffd5df");
    expect(result.svg).not.toContain("#8e3f55");
  });

  it("serializes structured path segments compactly", () => {
    expect(
      pathSegmentsToD([
        { cmd: "M", x: 10, y: 10 },
        { cmd: "C", x1: 20, y1: 5, x2: 30, y2: 5, x: 40, y: 10 },
        { cmd: "Q", x1: 45.5, y1: 15, x: 50, y: 10 },
        { cmd: "Z" },
      ]),
    ).toBe("M10 10 C20 5 30 5 40 10 Q45.5 15 50 10 Z");
  });

  it("validates raw SVG path data", () => {
    expect(() => validatePathData("M10 10 C20 5 30 5 40 10")).not.toThrow();
    expect(() => validatePathData("M10 10 C20 5 30")).toThrow("incomplete");
    expect(() => validatePathData("M10 10 X20 20")).toThrow("invalid");
  });

  it("draws a new path from raw path data with a stable id", () => {
    const result = drawPathInSvg(baseSvg, {
      elementId: "detail-line",
      d: "M10 10 C20 5 30 5 40 10",
      attributes: { fill: "none", stroke: "#166534", "stroke-width": 2 },
    });

    expect(result.result).toEqual({
      elementId: "detail-line",
      nextD: "M10 10 C20 5 30 5 40 10",
    });
    expect(result.svg).toContain('id="detail-line"');
    expect(result.svg).toContain('d="M10 10 C20 5 30 5 40 10"');
    expect(result.svg).toContain('stroke="#166534"');
  });

  it("draws a new path from structured segments", () => {
    const result = drawPathInSvg(baseSvg, {
      elementId: "structured-line",
      segments: [
        { cmd: "M", x: 5, y: 5 },
        { cmd: "L", x: 20, y: 10 },
      ],
      attributes: { fill: "none", stroke: "#0f172a" },
    });

    expect(result.result.nextD).toBe("M5 5 L20 10");
    expect(result.svg).toContain('d="M5 5 L20 10"');
  });

  it("replaces and appends path data on existing paths", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    const replaced = replacePathDataInSvg(svg, {
      elementId: "editable-path",
      segments: [
        { cmd: "M", x: 10, y: 10 },
        { cmd: "L", x: 20, y: 20 },
      ],
    });
    expect(replaced.result).toEqual({
      elementId: "editable-path",
      previousD: "M1 1 L2 2",
      nextD: "M10 10 L20 20",
    });

    const appended = appendPathSegmentInSvg(replaced.svg, {
      elementId: "editable-path",
      segments: [{ cmd: "C", x1: 25, y1: 15, x2: 35, y2: 15, x: 40, y: 20 }],
    });
    expect(appended.result).toEqual({
      elementId: "editable-path",
      previousD: "M10 10 L20 20",
      nextD: "M10 10 L20 20 C25 15 35 15 40 20",
    });
  });

  it("edits path nodes without replacing the path element", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 C3 3 4 4 5 5 Q6 6 7 7",
      attributes: { fill: "none" },
    }).svg;

    const result = editPathNodesInSvg(svg, {
      elementId: "editable-path",
      edits: [
        { type: "move_point", segmentIndex: 2, point: "c1", dx: 10, dy: -1 },
        { type: "move_point", segmentIndex: 2, point: "end", dx: -2, dy: 3 },
        { type: "insert_segment", index: 2, segment: { cmd: "L", x: 9.5, y: 8 } },
        { type: "delete_segment", segmentIndex: 4 },
      ],
    });

    expect(result.result).toEqual({
      elementId: "editable-path",
      previousD: "M1 1 L2 2 C3 3 4 4 5 5 Q6 6 7 7",
      nextD: "M1 1 L2 2 L9.5 8 C13 2 4 4 3 8",
      editCount: 4,
    });
    expect(result.svg).toContain('id="editable-path"');
    expect(result.svg).toContain('d="M1 1 L2 2 L9.5 8 C13 2 4 4 3 8"');
  });

  it("queries path node segments with raw and absolute points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c5 1 8 2 12 4 q3 -2 6 0 Z",
      attributes: { fill: "none" },
    }).svg;

    const result = queryPathNodesInSvg(svg, { elementId: "editable-path" });

    expect(result).toMatchObject({
      elementId: "editable-path",
      d: "M10 10 c5 1 8 2 12 4 q3 -2 6 0 Z",
      segmentCount: 4,
      segments: [
        {
          index: 0,
          cmd: "M",
          relative: false,
          availablePoints: ["end"],
          points: { end: { x: 10, y: 10 } },
          absolutePoints: { end: { x: 10, y: 10 } },
        },
        {
          index: 1,
          cmd: "c",
          relative: true,
          availablePoints: ["c1", "c2", "end"],
          points: {
            c1: { x: 5, y: 1 },
            c2: { x: 8, y: 2 },
            end: { x: 12, y: 4 },
          },
          absolutePoints: {
            c1: { x: 15, y: 11 },
            c2: { x: 18, y: 12 },
            end: { x: 22, y: 14 },
          },
        },
        {
          index: 2,
          cmd: "q",
          relative: true,
          availablePoints: ["c1", "end"],
          absolutePoints: {
            c1: { x: 25, y: 12 },
            end: { x: 28, y: 14 },
          },
        },
        {
          index: 3,
          cmd: "Z",
          relative: false,
          availablePoints: [],
        },
      ],
    });
  });

  it("rejects node editing for unsupported path commands", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "arc-path",
      d: "M1 1 A5 5 0 0 1 10 10",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      editPathNodesInSvg(svg, {
        elementId: "arc-path",
        edits: [{ type: "move_point", segmentIndex: 1, point: "end", dx: 1, dy: 0 }],
      }),
    ).toThrow("supports only M, L, C, Q, and Z");
  });
});
