import { describe, expect, it } from "vitest";

import {
  appendPathSegmentSchema,
  drawPathSchema,
  editPathNodesSchema,
  queryPathNodesSchema,
  replacePathDataSchema,
  transformPathPointsSchema,
  validatePathDataSchema,
} from "../src/core/validation.js";

describe("path tool validation", () => {
  it("requires exactly one path source for draw_path", () => {
    expect(() =>
      drawPathSchema.parse({
        docId: "path-doc",
        elementId: "line",
        d: "M1 1 L2 2",
        segments: [{ cmd: "M", x: 1, y: 1 }],
      }),
    ).toThrow("Provide exactly one path source");

    expect(
      drawPathSchema.parse({
        docId: "path-doc",
        elementId: "line",
        d: "M1 1 L2 2",
      }),
    ).toMatchObject({ attributes: {} });
  });

  it("accepts structured segments for replace and append tools", () => {
    expect(
      replacePathDataSchema.parse({
        docId: "path-doc",
        elementId: "line",
        segments: [
          { cmd: "M", x: 1, y: 1 },
          { cmd: "L", x: 2, y: 2 },
        ],
      }),
    ).toMatchObject({ elementId: "line" });

    expect(
      appendPathSegmentSchema.parse({
        docId: "path-doc",
        elementId: "line",
        segments: [{ cmd: "C", x1: 3, y1: 4, x2: 5, y2: 6, x: 7, y: 8 }],
      }),
    ).toMatchObject({ elementId: "line" });
  });

  it("accepts path node edits with finite defaults", () => {
    expect(
      editPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "line",
        edits: [{ type: "move_point", segmentIndex: 1, point: "c1", dx: 2 }],
      }),
    ).toMatchObject({
      edits: [{ type: "move_point", segmentIndex: 1, point: "c1", dx: 2, dy: 0 }],
    });

    expect(() =>
      editPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "line",
        edits: [{ type: "delete_segment", segmentIndex: -1 }],
      }),
    ).toThrow();
  });

  it("accepts path node queries for safe element ids", () => {
    expect(
      queryPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "line",
      }),
    ).toMatchObject({ docId: "path-doc", elementId: "line", normalize: "none" });

    expect(
      queryPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "line",
        normalize: "absolute",
      }),
    ).toMatchObject({ docId: "path-doc", elementId: "line", normalize: "absolute" });

    expect(() =>
      queryPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "../line",
      }),
    ).toThrow();

    expect(() =>
      queryPathNodesSchema.parse({
        docId: "path-doc",
        elementId: "line",
        normalize: "relative",
      }),
    ).toThrow();
  });

  it("accepts translate point transforms and rejects empty, duplicate, or zero transforms", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        points: [
          { segmentIndex: 1, point: "c1" },
          { segmentIndex: 1, point: "end" },
        ],
      },
      transform: { type: "translate", dx: 2, dy: 0 },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [] },
        transform: { type: "translate", dx: 1 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "end" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: { type: "translate", dx: 1 },
      }),
    ).toThrow("duplicates");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: { type: "translate" },
      }),
    ).toThrow("at least one axis");
  });

  it("accepts path data validation input without requiring docId", () => {
    expect(validatePathDataSchema.parse({ d: "M1 1 L2 2" })).toEqual({
      d: "M1 1 L2 2",
      requireMoveTo: true,
    });

    expect(validatePathDataSchema.parse({ d: "L2 2", requireMoveTo: false })).toEqual({
      d: "L2 2",
      requireMoveTo: false,
    });

    expect(validatePathDataSchema.parse({ d: "" })).toEqual({
      d: "",
      requireMoveTo: true,
    });
  });
});
