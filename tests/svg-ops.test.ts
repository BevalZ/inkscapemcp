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
    const result = summarizePathDataValidation("M10 10 H20 v5 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z");

    expect(result).toMatchObject({
      ok: true,
      d: "M10 10 H20 v5 l5 1 c2 3 4 5 6 7 q1 -2 3 0 z",
      requireMoveTo: true,
      segmentCount: 7,
      commandCounts: { M: 1, H: 1, v: 1, l: 1, c: 1, q: 1, z: 1 },
      unsupportedCommandCount: 0,
      relativeCommandCount: 4,
      absoluteCommandCount: 3,
      availablePointCount: 9,
      editablePointSummary: [
        { segmentIndex: 0, cmd: "M", relative: false, availablePoints: ["end"] },
        { segmentIndex: 1, cmd: "H", relative: false, availablePoints: ["end"] },
        { segmentIndex: 2, cmd: "v", relative: true, availablePoints: ["end"] },
        { segmentIndex: 3, cmd: "l", relative: true, availablePoints: ["end"] },
        { segmentIndex: 4, cmd: "c", relative: true, availablePoints: ["c1", "c2", "end"] },
        { segmentIndex: 5, cmd: "q", relative: true, availablePoints: ["c1", "end"] },
        { segmentIndex: 6, cmd: "z", relative: false, availablePoints: [] },
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
    expect(summarizePathDataValidation("M10 10 C20 20 30")).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Path command has an incomplete parameter set.",
        details: {
          command: "C",
          segmentIndex: 1,
          commandIndex: 1,
          expectedParamCount: 6,
          actualParamCount: 3,
          missingParamCount: 3,
          tokenIndex: 7,
          offset: 16,
        },
      },
    });

    expect(summarizePathDataValidation("M10 10 A5 5 0 0 1 20 20")).toMatchObject({
      ok: true,
      segmentCount: 2,
      commandCounts: { M: 1, A: 1 },
      availablePointCount: 1,
      queryPointCount: 2,
      editablePointSummary: [
        { segmentIndex: 0, cmd: "M", queryPoints: ["end"], availablePoints: ["end"] },
        { segmentIndex: 1, cmd: "A", queryPoints: ["end"], availablePoints: [] },
      ],
    });

    expect(summarizePathDataValidation("M10 10 A5 5 0 2 1 20 20")).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Arc path large-arc flag must be 0 or 1.",
        details: {
          command: "A",
          segmentIndex: 1,
          flag: "largeArcFlag",
          value: 2,
        },
      },
    });

    expect(summarizePathDataValidation("M10 10 # L20 20")).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Path data contains invalid characters.",
        details: { offset: 7, invalidText: "#" },
      },
    });

    expect(summarizePathDataValidation("M10 10 L20 20 @")).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Path data contains invalid trailing characters.",
        details: { offset: 14, invalidText: "@" },
      },
    });

    expect(summarizePathDataValidation("")).toMatchObject({
      ok: false,
      d: "",
      error: {
        code: "INVALID_INPUT",
        message: "Path data must not be empty.",
        details: { offset: 0, tokenIndex: 0 },
      },
    });
  });

  it("reports append-style path validation diagnostics with local segment indexes", () => {
    expect(summarizePathDataValidation("L10 10 C12 10", { requireMoveTo: false })).toMatchObject({
      ok: false,
      requireMoveTo: false,
      error: {
        code: "INVALID_INPUT",
        message: "Path command has an incomplete parameter set.",
        details: {
          command: "C",
          segmentIndex: 1,
          commandIndex: 1,
          expectedParamCount: 6,
          actualParamCount: 2,
          missingParamCount: 4,
        },
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

  it("edits representable H/V path endpoints while preserving command case", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "axis-path",
      d: "M10 10 H20 v8 h-5 V12",
      attributes: { fill: "none" },
    }).svg;

    const moved = editPathNodesInSvg(svg, {
      elementId: "axis-path",
      edits: [
        { type: "move_point", segmentIndex: 1, point: "end", dx: 3, dy: 0 },
        { type: "move_point", segmentIndex: 2, point: "end", dx: 0, dy: 2 },
        { type: "set_point_absolute", segmentIndex: 3, point: "end", x: 13, y: 20 },
        { type: "set_point_relative", segmentIndex: 4, point: "end", x: 0, y: -6 },
      ],
    });

    expect(moved.result).toEqual({
      elementId: "axis-path",
      previousD: "M10 10 H20 v8 h-5 V12",
      nextD: "M10 10 H23 v10 h-10 V14",
      editCount: 4,
    });
    expect(moved.svg).toContain('d="M10 10 H23 v10 h-10 V14"');
  });

  it("rejects non-representable H/V endpoint edits without converting commands", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "axis-path",
      d: "M10 10 H20 v8",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      editPathNodesInSvg(svg, {
        elementId: "axis-path",
        edits: [{ type: "move_point", segmentIndex: 1, point: "end", dx: 0, dy: 1 }],
      }),
    ).toThrow("H path endpoints cannot move vertically");

    expect(() =>
      editPathNodesInSvg(svg, {
        elementId: "axis-path",
        edits: [{ type: "set_point_absolute", segmentIndex: 2, point: "end", x: 19, y: 18 }],
      }),
    ).toThrow("V path endpoints cannot change x");
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

  it("transforms representable H/V endpoints while preserving command case", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "axis-path",
      d: "M10 10 H20 v8 h-5 V12",
      attributes: { fill: "none" },
    }).svg;

    const translated = transformPathPointsInSvg(svg, {
      elementId: "axis-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 3, point: "end" },
        ],
      },
      transform: { type: "translate", dx: 3, dy: 0 },
    });
    expect(translated.result).toMatchObject({
      nextD: "M10 10 H23 v8 h-2 V12",
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 3, point: "end" },
      ],
      editedSegments: [1, 3],
    });

    const setAbsolute = transformPathPointsInSvg(svg, {
      elementId: "axis-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "set_absolute",
        points: [
          { x: 24, y: 10 },
          { x: 24, y: 21 },
        ],
      },
    });
    expect(setAbsolute.result.nextD).toBe("M10 10 H24 v11 h-5 V12");

    const selectedByCommand = transformPathPointsInSvg(svg, {
      elementId: "axis-path",
      pointSelector: {
        type: "command",
        commands: ["H", "h"],
      },
      transform: { type: "translate", dx: -2, dy: 0 },
    });
    expect(selectedByCommand.result).toMatchObject({
      nextD: "M10 10 H18 v8 h-7 V12",
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 3, point: "end" },
      ],
    });

    const verticalSelectedByCommand = transformPathPointsInSvg(svg, {
      elementId: "axis-path",
      pointSelector: {
        type: "command",
        commands: ["v", "V"],
      },
      transform: { type: "translate", dx: 0, dy: 2 },
    });
    expect(verticalSelectedByCommand.result).toMatchObject({
      nextD: "M10 10 H20 v10 h-5 V14",
      selectedPoints: [
        { segmentIndex: 2, point: "end" },
        { segmentIndex: 4, point: "end" },
      ],
    });
  });

  it("rejects non-representable H/V point transforms without converting commands", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "axis-path",
      d: "M10 10 H20 v8",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "axis-path",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: { type: "translate", dx: 0, dy: 1 },
      }),
    ).toThrow("H path endpoints cannot move vertically");

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "axis-path",
        pointSelector: { points: [{ segmentIndex: 2, point: "end" }] },
        transform: { type: "set_absolute", points: [{ x: 19, y: 20 }] },
      }),
    ).toThrow("V path endpoints cannot change x");
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

  it("transforms segment-list-selected path points in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 L40 40 z",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "segment_list",
        segmentIndexes: [4, 1, 3],
        pointTypes: ["end", "c1"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0 L40 40 z",
      nextD: "M10 10 l6 -1 c2 3 4 5 6 7 q2 -4 4 -2 L41 38 z",
      selectedPointCount: 4,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 3, point: "c1" },
        { segmentIndex: 3, point: "end" },
        { segmentIndex: 4, point: "end" },
      ],
      editedSegments: [1, 3, 4],
    });
  });

  it("applies set_absolute to segment-list-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 L20 20 L30 30 L40 40",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "segment_list",
        segmentIndexes: [3, 1],
        pointTypes: ["end"],
      },
      transform: {
        type: "set_absolute",
        points: [
          { x: 21, y: 19 },
          { x: 41, y: 39 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 L21 19 L30 30 L41 39",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 3, point: "end" },
      ],
    });
  });

  it("rejects segment list set transforms when resolved target counts differ", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 L3 3",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1, 2],
          pointTypes: ["end"],
        },
        transform: { type: "set_relative", points: [{ x: 1, y: 1 }] },
      }),
    ).toThrow("target point count");
  });

  it("rejects segment list selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 Z",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [2],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("rejects segment list selectors that include out-of-range segment indexes", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1, 3],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("out of range");
  });

  it("transforms command-selected path points in path order with case-sensitive matching", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 3 4 5 6 7 C20 20 21 21 22 22 q1 -2 3 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "command",
        commands: ["C", "q"],
        pointTypes: ["c1", "end"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 c2 3 4 5 6 7 C20 20 21 21 22 22 q1 -2 3 0",
      nextD: "M10 10 c2 3 4 5 6 7 C21 18 21 21 23 20 q2 -4 4 -2",
      selectedPointCount: 4,
      selectedPoints: [
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
        { segmentIndex: 3, point: "c1" },
        { segmentIndex: 3, point: "end" },
      ],
      editedSegments: [2, 3],
    });
  });

  it("applies set_relative to command-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 3 4 5 6 7 Q20 20 21 21",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "command",
        commands: ["c", "Q"],
        pointTypes: ["end"],
      },
      transform: {
        type: "set_relative",
        points: [
          { x: 10, y: 11 },
          { x: 3, y: 4 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c2 3 4 5 10 11 Q20 20 23 25",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
    });
  });

  it("rejects command set transforms when resolved target counts differ", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 C2 2 3 3 4 4",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "command",
          commands: ["C"],
          pointTypes: ["c1", "end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 1 }] },
      }),
    ).toThrow("target point count");
  });

  it("rejects command selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "command",
          commands: ["C"],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("rejects command selectors that only match close-path segments", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2 Z",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "command",
          commands: ["Z"],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("transforms point-type-selected path points in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 3 4 5 6 7 Q20 20 21 21 L30 30",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end", "c1"],
      },
      transform: { type: "translate", dx: 1, dy: -2 },
    });

    expect(result.result).toMatchObject({
      elementId: "editable-path",
      previousD: "M10 10 c2 3 4 5 6 7 Q20 20 21 21 L30 30",
      nextD: "M11 8 c3 1 4 5 7 5 Q21 18 22 19 L31 28",
      selectedPointCount: 6,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "c1" },
        { segmentIndex: 2, point: "end" },
        { segmentIndex: 3, point: "end" },
      ],
      editedSegments: [0, 1, 2, 3],
    });
  });

  it("applies set_relative to point-type-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 3 4 5 6 7 Q20 20 21 21",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "set_relative",
        points: [
          { x: 12, y: 13 },
          { x: 8, y: 9 },
          { x: 3, y: 4 },
        ],
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M12 13 c2 3 4 5 8 9 Q20 20 23 26",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
    });
  });

  it("rejects point-type set transforms when resolved target counts differ", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 C2 2 3 3 4 4",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "point_type",
          pointTypes: ["c1", "end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 1 }] },
      }),
    ).toThrow("target point count");
  });

  it("rejects point-type selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "point_type",
          pointTypes: ["c1"],
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
  });

  it("scales selected path points around an explicit absolute origin", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 4 6 8 10 12 L30 34",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "scale",
        origin: { x: 10, y: 10 },
        sx: 2,
        sy: 0.5,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c4 2 6 8 20 6 L50 22",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "scale",
        origin: { x: 10, y: 10 },
        sx: 2,
        sy: 0.5,
      },
    });
  });

  it("scales point-type-selected endpoints in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 6 q2 4 8 10",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "scale",
        origin: { x: 10, y: 10 },
        sx: 2,
        sy: 2,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l10 12 q2 4 16 20",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [0, 1, 2],
    });
  });

  it("rotates selected path points around an explicit absolute origin", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 0 6 0 10 0 L30 20",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "rotate",
        origin: { x: 10, y: 10 },
        angleDegrees: 90,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c0 2 6 0 0 10 L0 30",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "rotate",
        origin: { x: 10, y: 10 },
        angleDegrees: 90,
      },
    });
  });

  it("rotates point-type-selected endpoints in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 0 q2 0 8 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "rotate",
        origin: { x: 10, y: 10 },
        angleDegrees: 90,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l0 5 q2 0 0 8",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [0, 1, 2],
    });
  });

  it("reflects selected path points across a vertical axis", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 0 6 0 10 0 L30 20",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "reflect",
        axis: "vertical",
        origin: { x: 10, y: 10 },
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c-2 0 6 0 -10 0 L-10 20",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "reflect",
        axis: "vertical",
        origin: { x: 10, y: 10 },
      },
    });
  });

  it("reflects point-type-selected endpoints across a horizontal axis", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 6 q2 4 8 10",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "reflect",
        axis: "horizontal",
        origin: { x: 10, y: 10 },
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l5 -6 q2 4 8 -10",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [0, 1, 2],
    });
  });

  it("reflects selected path points across a zero-degree line", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 0 6 0 10 0 L30 20",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "reflect_line",
        origin: { x: 10, y: 10 },
        angleDegrees: 0,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c2 0 6 0 10 0 L30 0",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "reflect_line",
        origin: { x: 10, y: 10 },
        angleDegrees: 0,
      },
    });
  });

  it("reflects selected path points across a ninety-degree line", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 0 6 0 10 0 L30 20",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "reflect_line",
        origin: { x: 10, y: 10 },
        angleDegrees: 90,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c-2 0 6 0 -10 0 L-10 20",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "reflect_line",
        origin: { x: 10, y: 10 },
        angleDegrees: 90,
      },
    });
  });

  it("reflects point-type-selected endpoints across an oblique line", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l10 0 q2 4 20 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "reflect_line",
        origin: { x: 10, y: 10 },
        angleDegrees: 45,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l0 10 q2 4 0 20",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [0, 1, 2],
    });
  });

  it("skews selected path points along the x axis around an explicit absolute origin", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 c2 4 6 8 10 12 L30 34",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
          { segmentIndex: 2, point: "end" },
        ],
      },
      transform: {
        type: "skew",
        axis: "x",
        origin: { x: 10, y: 10 },
        angleDegrees: 45,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 c6 4 6 8 22 12 L54 34",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      transform: {
        type: "skew",
        axis: "x",
        origin: { x: 10, y: 10 },
        angleDegrees: 45,
      },
    });
  });

  it("skews point-type-selected endpoints along the y axis in path order", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 6 q2 4 8 10",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "point_type",
        pointTypes: ["end"],
      },
      transform: {
        type: "skew",
        axis: "y",
        origin: { x: 10, y: 10 },
        angleDegrees: 45,
      },
    });

    expect(result.result).toMatchObject({
      nextD: "M10 10 l5 11 q2 4 8 18",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [0, 1, 2],
    });
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

  it("transforms radius-selected path points using inclusive absolute distance", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 l5 1 c2 3 4 5 6 7 q1 -2 3 0",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "radius",
        x: 18,
        y: 15,
        radius: 5,
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

  it("applies set_absolute to radius-selected points when target counts match", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 L20 20 L30 30",
      attributes: { fill: "none" },
    }).svg;

    const result = transformPathPointsInSvg(svg, {
      elementId: "editable-path",
      pointSelector: {
        type: "radius",
        x: 25,
        y: 25,
        radius: 8,
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

  it("rejects radius selectors that match no editable points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M1 1 L2 2",
      attributes: { fill: "none" },
    }).svg;

    expect(() =>
      transformPathPointsInSvg(svg, {
        elementId: "editable-path",
        pointSelector: {
          type: "radius",
          x: 20,
          y: 20,
          radius: 2,
        },
        transform: { type: "translate", dx: 1, dy: 0 },
      }),
    ).toThrow("matched no editable points");
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

  it("queries H/V path node segments with raw, absolute, and normalized points", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "axis-path",
      d: "M10 10 H20 v8 h-5 V12",
      attributes: { fill: "none" },
    }).svg;

    const result = queryPathNodesInSvg(svg, { elementId: "axis-path", normalize: "relative" });

    expect(result).toMatchObject({
      elementId: "axis-path",
      d: "M10 10 H20 v8 h-5 V12",
      segmentCount: 5,
      segments: [
        {
          index: 0,
          cmd: "M",
          basePoint: { x: 0, y: 0 },
          points: { end: { x: 10, y: 10 } },
          absolutePoints: { end: { x: 10, y: 10 } },
        },
        {
          index: 1,
          cmd: "H",
          basePoint: { x: 10, y: 10 },
          points: { end: { x: 20, y: 10 } },
          absolutePoints: { end: { x: 20, y: 10 } },
        },
        {
          index: 2,
          cmd: "v",
          basePoint: { x: 20, y: 10 },
          points: { end: { x: 0, y: 8 } },
          absolutePoints: { end: { x: 20, y: 18 } },
        },
        {
          index: 3,
          cmd: "h",
          basePoint: { x: 20, y: 18 },
          points: { end: { x: -5, y: 0 } },
          absolutePoints: { end: { x: 15, y: 18 } },
        },
        {
          index: 4,
          cmd: "V",
          basePoint: { x: 15, y: 18 },
          points: { end: { x: 15, y: 12 } },
          absolutePoints: { end: { x: 15, y: 12 } },
        },
      ],
      normalizedSegments: [
        { index: 0, cmd: "M", points: { end: { x: 10, y: 10 } } },
        { index: 1, cmd: "H", points: { end: { x: 10, y: 0 } } },
        { index: 2, cmd: "v", points: { end: { x: 0, y: 8 } } },
        { index: 3, cmd: "h", points: { end: { x: -5, y: 0 } } },
        { index: 4, cmd: "V", points: { end: { x: 0, y: -6 } } },
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

  it("returns an explicit relative normalized path-node view when requested", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "editable-path",
      d: "M10 10 L15 11 C17 14 19 16 21 18 q1 -2 3 0 z",
      attributes: { fill: "none" },
    }).svg;

    const result = queryPathNodesInSvg(svg, { elementId: "editable-path", normalize: "relative" });

    expect(result).toMatchObject({
      elementId: "editable-path",
      normalize: "relative",
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
          cmd: "L",
          relative: false,
          availablePoints: ["end"],
          points: { end: { x: 5, y: 1 } },
        },
        {
          index: 2,
          cmd: "C",
          relative: false,
          availablePoints: ["c1", "c2", "end"],
          points: {
            c1: { x: 2, y: 3 },
            c2: { x: 4, y: 5 },
            end: { x: 6, y: 7 },
          },
        },
        {
          index: 3,
          cmd: "q",
          relative: true,
          availablePoints: ["c1", "end"],
          points: {
            c1: { x: 1, y: -2 },
            end: { x: 3, y: 0 },
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
      points: { end: { x: 15, y: 11 } },
      absolutePoints: { end: { x: 15, y: 11 } },
    });
  });

  it("queries arc path segments without marking arc endpoints editable", () => {
    const svg = drawPathInSvg(baseSvg, {
      elementId: "arc-path",
      d: "M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2",
      attributes: { fill: "none" },
    }).svg;

    const absolute = queryPathNodesInSvg(svg, { elementId: "arc-path", normalize: "absolute" });
    expect(absolute).toMatchObject({
      elementId: "arc-path",
      segmentCount: 3,
      segments: [
        {
          index: 0,
          cmd: "M",
          queryPoints: ["end"],
          availablePoints: ["end"],
          points: { end: { x: 10, y: 10 } },
          absolutePoints: { end: { x: 10, y: 10 } },
        },
        {
          index: 1,
          cmd: "A",
          queryPoints: ["end"],
          availablePoints: [],
          raw: {
            cmd: "A",
            rx: 5,
            ry: 6,
            xAxisRotation: 45,
            largeArcFlag: 0,
            sweepFlag: 1,
            x: 20,
            y: 25,
          },
          points: { end: { x: 20, y: 25 } },
          absolutePoints: { end: { x: 20, y: 25 } },
        },
        {
          index: 2,
          cmd: "a",
          queryPoints: ["end"],
          availablePoints: [],
          points: { end: { x: 5, y: -2 } },
          absolutePoints: { end: { x: 25, y: 23 } },
        },
      ],
      normalizedSegments: [
        { index: 0, cmd: "M", points: { end: { x: 10, y: 10 } } },
        { index: 1, cmd: "A", points: { end: { x: 20, y: 25 } } },
        { index: 2, cmd: "a", points: { end: { x: 25, y: 23 } } },
      ],
    });

    const relative = queryPathNodesInSvg(svg, { elementId: "arc-path", normalize: "relative" });
    expect(relative.normalizedSegments).toMatchObject([
      { index: 0, cmd: "M", points: { end: { x: 10, y: 10 } } },
      { index: 1, cmd: "A", points: { end: { x: 10, y: 15 } } },
      { index: 2, cmd: "a", points: { end: { x: 5, y: -2 } } },
    ]);
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
    ).toThrow("supports only M, L, H, V, C, Q, and Z");
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
    ).toThrow("supports only M, L, H, V, C, Q, and Z");
  });
});
