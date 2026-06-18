import { describe, expect, it } from "vitest";

import { createSvgDocument } from "../src/core/svg-document.js";
import { pathSegmentsToD, summarizePathDataValidation, validatePathData } from "../src/core/path-data.js";
import {
  appendPathSegmentInSvg,
  applyOperationsToSvg,
  drawPathInSvg,
  editPathNodesInSvg,
  insertFragmentIntoSvg,
  queryPathNodesInSvg,
  replaceAttributeValuesInSvg,
  replacePathDataInSvg,
  transformPathPointsInSvg,
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

  it("summarizes valid path data with editable point counts", () => {
    const result = summarizePathDataValidation("M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z");

    expect(result).toMatchObject({
      ok: true,
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z",
      requireMoveTo: true,
      segmentCount: 5,
      commandCounts: { M: 1, l: 1, c: 1, q: 1, z: 1 },
      unsupportedCommandCount: 0,
      relativeCommandCount: 3,
      absoluteCommandCount: 2,
      availablePointCount: 7,
      editablePointSummary: [
        { segmentIndex: 0, cmd: "M", relative: false, availablePoints: ["end"] },
        { segmentIndex: 1, cmd: "l", relative: true, availablePoints: ["end"] },
        { segmentIndex: 2, cmd: "c", relative: true, availablePoints: ["c1", "c2", "end"] },
        { segmentIndex: 3, cmd: "q", relative: true, availablePoints: ["c1", "end"] },
        { segmentIndex: 4, cmd: "z", relative: false, availablePoints: [] },
      ],
    });
  });

  it("summarizes append-style path data when move-to is not required", () => {
    const result = summarizePathDataValidation("L10 10 C12 10 14 10 16 12", { requireMoveTo: false });

    expect(result).toMatchObject({
      ok: true,
      d: "L10 10 C12 10 14 10 16 12",
      requireMoveTo: false,
      segmentCount: 2,
      commandCounts: { L: 1, C: 1 },
      unsupportedCommandCount: 0,
      availablePointCount: 4,
      editablePointSummary: [
        { segmentIndex: 0, cmd: "L", availablePoints: ["end"] },
        { segmentIndex: 1, cmd: "C", availablePoints: ["c1", "c2", "end"] },
      ],
    });
  });

  it("returns typed validation failures for malformed or unsupported path data", () => {
    expect(summarizePathDataValidation("M10 10 A5 5 0 0 1 20 20")).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "edit_path_nodes supports only M, L, C, Q, and Z path commands.",
        details: { command: "A" },
      },
    });

    expect(summarizePathDataValidation("")).toMatchObject({
      ok: false,
      d: "",
      error: {
        code: "INVALID_INPUT",
        message: "Path data must not be empty.",
      },
    });
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

  it("translates explicit path points without replacing the path element", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 C3 3 4 4 5 5",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 2, point: "c1" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: { type: "translate", dx: 10, dy: -1 },
    });

    expect(result.result).toEqual({
      elementId: "editable-path",
      previousD: "M1 1 L2 2 C3 3 4 4 5 5",
      nextD: "M1 1 L2 2 C13 2 4 4 15 4",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [2],
      transform: { type: "translate", dx: 10, dy: -1 },
    });
    expect(result.svg).toContain('id="editable-path"');
    expect(result.svg).toContain('d="M1 1 L2 2 C13 2 4 4 15 4"');
  });

  it("sets explicit path points to absolute coordinates without changing command case", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "c1" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "set_absolute",
        points: [
          { x: 20, y: 25 },
          { x: 24, y: 26 },
          { x: 33, y: 35 },
        ],
      },
    });

    expect(result.result).toEqual({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 c2 3 4 5 6 7",
      nextD: "M10 10 l10 15 c4 1 4 5 13 10",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "set_absolute",
        points: [
          { x: 20, y: 25 },
          { x: 24, y: 26 },
          { x: 33, y: 35 },
        ],
      },
    });
    expect(result.svg).toContain('d="M10 10 l10 15 c4 1 4 5 13 10"');
  });

  it("sets absolute targets correctly even when selections are provided out of path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 2, point: "end" },
          { segmentIndex: 1, point: "end" },
        ],
      },
      transform: {
        type: "set_absolute",
        points: [
          { x: 33, y: 35 },
          { x: 20, y: 25 },
        ],
      },
    });

    expect(result.result.nextD).toBe("M10 10 l10 15 c2 3 4 5 13 10");
  });

  it("sets explicit path points to segment-relative coordinates", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 C20 20 21 21 22 22",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "c1" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "set_relative",
        points: [
          { x: 8, y: 9 },
          { x: 4, y: 5 },
          { x: 11, y: 12 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 C20 20 21 21 22 22",
      nextD: "M10 10 l8 9 C22 24 21 21 29 31",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "set_relative",
        points: [
          { x: 8, y: 9 },
          { x: 4, y: 5 },
          { x: 11, y: 12 },
        ],
      },
    });
    expect(result.svg).toContain('d="M10 10 l8 9 C22 24 21 21 29 31"');
  });

  it("sets relative targets correctly even when selections are provided out of path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 2, point: "end" },
          { segmentIndex: 1, point: "end" },
        ],
      },
      transform: {
        type: "set_relative",
        points: [
          { x: 13, y: 10 },
          { x: 10, y: 15 },
        ],
      },
    });

    expect(result.result.nextD).toBe("M10 10 l10 15 c2 3 4 5 13 10");
  });

  it("transforms bbox-selected path points using absolute point coordinates", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "bbox",
        minX: 15,
        minY: 10,
        maxX: 22,
        maxY: 18,
        pointTypes: ["end", "c1"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0",
      nextD: "M10 10 l6 -1 c3 1 4 5 7 5 q2 -4 3 0",
      selectedPointCount: 4,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
        { segmentIndex: 3, point: "c1" },
      ],
      editedSegments: [1, 2, 3],
    });
  });

  it("applies set_absolute to bbox-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 L20 20 L30 30",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "bbox",
        minX: 19,
        minY: 19,
        maxX: 31,
        maxY: 31,
        pointTypes: ["end"],
      },
      transform: {
        type: "set_absolute",
        points: [
          { x: 21, y: 19 },
          { x: 32, y: 28 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 L21 19 L32 28",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
    });
  });

  it("rejects bbox selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "bbox",
          minX: 50,
          minY: 50,
          maxX: 60,
          maxY: 60,
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("transforms segment-range-selected path points in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "segment_range",
        startSegmentIndex: 1,
        endSegmentIndex: 3,
        pointTypes: ["end", "c1"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z",
      nextD: "M10 10 l6 -1 c3 1 4 5 7 5 q2 -4 4 -2 z",
      selectedPointCount: 5,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
        { segmentIndex: 3, point: "c1" },
        { segmentIndex: 3, point: "end" },
      ],
      editedSegments: [1, 2, 3],
    });
  });

  it("applies set_relative to segment-range-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 C20 20 21 21 22 22",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "segment_range",
        startSegmentIndex: 1,
        endSegmentIndex: 2,
        pointTypes: ["end"],
      },
      transform: {
        type: "set_relative",
        points: [
          { x: 8, y: 9 },
          { x: 11, y: 12 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l8 9 C20 20 21 21 29 31",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
    });
  });

  it("rejects segment range selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 Z",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 2,
          endSegmentIndex: 2,
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("rejects segment range selectors that exceed the path segment count", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 1,
          endSegmentIndex: 3,
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("out of range");
  });

  it("transforms the nearest editable path point by absolute coordinates", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "nearest",
        x: 18,
        y: 15,
        pointTypes: ["end", "c1"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0",
      nextD: "M10 10 l5 1 c3 1 4 5 6 7 q1 -2 3 0",
      selectedPointCount: 1,
      selectedPoints: [{ segmentIndex: 2, point: "c1" }],
      editedSegments: [2],
    });
  });

  it("breaks nearest point ties by path order and available point order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 L20 10 L30 10",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "nearest",
        x: 25,
        y: 10,
        pointTypes: ["end"],
      },
      transform: { type: "translate", dx: 0, dy: 2 },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 L20 12 L30 10",
      selectedPointCount: 1,
      selectedPoints: [{ segmentIndex: 1, point: "end" }],
      editedSegments: [1],
    });
  });

  it("applies set_absolute to the nearest selected point when one target is supplied", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 3 4 5 6 7",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "nearest",
        x: 11,
        y: 12,
        pointTypes: ["c1", "end"],
      },
      transform: { type: "set_absolute", points: [{ x: 20, y: 21 }] },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c10 11 4 5 6 7",
      selectedPointCount: 1,
      selectedPoints: [{ segmentIndex: 1, point: "c1" }],
    });
  });

  it("rejects nearest selectors that have no candidate point types", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "nearest",
          x: 1,
          y: 1,
          pointTypes: ["c2"],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("rejects nearest selectors beyond maxDistance", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "nearest",
          x: 20,
          y: 20,
          maxDistance: 2,
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("maxDistance");
  });

  it("rejects set_absolute when target point count does not match the selection", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "end" },
            { segmentIndex: 0, point: "end" },
          ],
        },
        transform: { type: "set_absolute", points: [{ x: 3, y: 3 }] },
      }),
    ).toThrow("target point count");
  });

  it("rejects set_relative when target point count does not match the selection", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "end" },
            { segmentIndex: 0, point: "end" },
          ],
        },
        transform: { type: "set_relative", points: [{ x: 3, y: 3 }] },
      }),
    ).toThrow("target point count");
  });

  it("rejects duplicate point transforms before editing path data", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "end" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("duplicates");
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

  it("returns an explicit absolute normalized path-node view when requested", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z",
      attributes: { fill: "none" },
    }).svg;

    const result = queryPathNodesInSvg(svg, { elementId: "editable-path", normalize: "absolute" });

    expect(result).toMatchObject({
      elementId: "editable-path",
      normalize: "absolute",
      segmentCount: 5,
      normalizedSegments: [
        {
          index: 0,
          cmd: "M",
          relative: false,
          availablePoints: ["end"],
          points: { end: { x: 10, y: 10 } },
        },
        {
          index: 1,
          cmd: "l",
          relative: true,
          availablePoints: ["end"],
          points: { end: { x: 15, y: 11 } },
        },
        {
          index: 2,
          cmd: "c",
          relative: true,
          availablePoints: ["c1", "c2", "end"],
          points: {
            c1: { x: 17, y: 14 },
            c2: { x: 19, y: 16 },
            end: { x: 21, y: 18 },
          },
        },
        {
          index: 3,
          cmd: "q",
          relative: true,
          availablePoints: ["c1", "end"],
          points: {
            c1: { x: 22, y: 16 },
            end: { x: 24, y: 18 },
          },
        },
        {
          index: 4,
          cmd: "z",
          relative: false,
          availablePoints: [],
          points: {},
        },
      ],
    });
    expect(result.segments[1]).toMatchObject({
      points: { end: { x: 5, y: 1 } },
      absolutePoints: { end: { x: 15, y: 11 } },
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

  it("rejects point transforms for unsupported path commands", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "arc-path",
      d: "M1 1 A5 5 0 0 1 10 10",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "arc-path",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("supports only M, L, C, Q, and Z");
  });
});
