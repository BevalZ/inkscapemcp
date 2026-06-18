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

  it("accepts bbox point selectors and rejects invalid bbox bounds", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "bbox",
          minX: 10,
          minY: 11,
          maxX: 20,
          maxY: 21,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "bbox",
        minX: 10,
        minY: 11,
        maxX: 20,
        maxY: 21,
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "bbox",
          minX: 10,
          minY: 11,
          maxX: 20,
          maxY: 21,
          pointTypes: ["end"],
        },
        transform: { type: "set_relative", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "bbox",
        pointTypes: ["end"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "bbox",
          minX: 20,
          minY: 11,
          maxX: 10,
          maxY: 21,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow("minX");
  });

  it("accepts segment range point selectors and rejects invalid range bounds", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 1,
          endSegmentIndex: 3,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "segment_range",
        startSegmentIndex: 1,
        endSegmentIndex: 3,
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 1,
          endSegmentIndex: 2,
          pointTypes: ["end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "segment_range",
        pointTypes: ["end"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 3,
          endSegmentIndex: 1,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow("startSegmentIndex");
  });

  it("accepts segment list point selectors and rejects invalid segment lists", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [3, 1],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "segment_list",
        segmentIndexes: [3, 1],
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1, 3],
          pointTypes: ["end"],
        },
        transform: { type: "set_relative", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "segment_list",
        segmentIndexes: [1, 3],
        pointTypes: ["end"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1, 1],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow("duplicates");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [-1],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1],
          pointTypes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();
  });

  it("defers segment list set-transform count validation until selector resolution", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "segment_list",
          segmentIndexes: [1, 3],
          pointTypes: ["end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "segment_list",
      },
      transform: {
        type: "set_absolute",
        points: [{ x: 1, y: 2 }],
      },
    });
  });

  it("accepts command point selectors and rejects invalid command selectors", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["C", "q"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "command",
        commands: ["C", "q"],
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["c"],
          pointTypes: ["c1"],
        },
        transform: { type: "set_relative", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "command",
        commands: ["c"],
        pointTypes: ["c1"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["C", "C"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow("duplicates");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["A"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["C"],
          pointTypes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();
  });

  it("defers command selector set-transform count validation until selector resolution", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "command",
          commands: ["C"],
          pointTypes: ["c1", "end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "command",
      },
      transform: {
        type: "set_absolute",
        points: [{ x: 1, y: 2 }],
      },
    });
  });

  it("accepts point-type selectors and rejects invalid point-type inputs", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["end", "c1"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "point_type",
        pointTypes: ["end", "c1"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["end", "end"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow("duplicates");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["start"],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();
  });

  it("defers point-type selector set-transform count validation until selector resolution", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["c1", "end"],
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "point_type",
      },
      transform: {
        type: "set_absolute",
        points: [{ x: 1, y: 2 }],
      },
    });
  });

  it("accepts scale point transforms and rejects invalid scale factors", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "scale",
          origin: { x: 10, y: 20 },
          sx: 1.25,
          sy: 0.75,
        },
      }),
    ).toMatchObject({
      transform: {
        type: "scale",
        origin: { x: 10, y: 20 },
        sx: 1.25,
        sy: 0.75,
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "scale",
          origin: { x: 10, y: 20 },
          sx: 0,
          sy: 1,
        },
      }),
    ).toThrow("non-zero");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "scale",
          origin: { x: Number.POSITIVE_INFINITY, y: 20 },
          sx: 1,
          sy: 1,
        },
      }),
    ).toThrow();
  });

  it("accepts rotate point transforms and rejects invalid rotate angles", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "rotate",
          origin: { x: 10, y: 20 },
          angleDegrees: 90,
        },
      }),
    ).toMatchObject({
      transform: {
        type: "rotate",
        origin: { x: 10, y: 20 },
        angleDegrees: 90,
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "rotate",
          origin: { x: 10, y: 20 },
          angleDegrees: 0,
        },
      }),
    ).toThrow("non-zero");

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "rotate",
          origin: { x: 10, y: Number.NaN },
          angleDegrees: 90,
        },
      }),
    ).toThrow();
  });

  it("accepts reflect point transforms and rejects invalid reflect inputs", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "reflect",
          axis: "vertical",
          origin: { x: 10, y: 20 },
        },
      }),
    ).toMatchObject({
      transform: {
        type: "reflect",
        axis: "vertical",
        origin: { x: 10, y: 20 },
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "reflect",
          axis: "diagonal",
          origin: { x: 10, y: 20 },
        },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
        transform: {
          type: "reflect",
          axis: "horizontal",
          origin: { x: 10, y: Number.NaN },
        },
      }),
    ).toThrow();
  });

  it("accepts nearest point selectors and rejects invalid nearest inputs", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "nearest",
          x: 12,
          y: 13,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "nearest",
        x: 12,
        y: 13,
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "nearest",
          x: 12,
          y: 13,
          pointTypes: ["c1"],
          maxDistance: 4,
        },
        transform: { type: "set_absolute", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "nearest",
        pointTypes: ["c1"],
        maxDistance: 4,
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "nearest",
          x: Number.NaN,
          y: 13,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "nearest",
          x: 12,
          y: 13,
          pointTypes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "nearest",
          x: 12,
          y: 13,
          maxDistance: -1,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();
  });

  it("accepts radius point selectors and rejects invalid radius inputs", () => {
    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "radius",
          x: 12,
          y: 13,
          radius: 5,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "radius",
        x: 12,
        y: 13,
        radius: 5,
        pointTypes: ["end", "c1", "c2"],
      },
    });

    expect(
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "radius",
          x: 12,
          y: 13,
          radius: 0,
          pointTypes: ["end"],
        },
        transform: { type: "set_relative", points: [{ x: 1, y: 2 }] },
      }),
    ).toMatchObject({
      pointSelector: {
        type: "radius",
        radius: 0,
        pointTypes: ["end"],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "radius",
          x: Number.NaN,
          y: 13,
          radius: 5,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "radius",
          x: 12,
          y: 13,
          radius: -1,
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          type: "radius",
          x: 12,
          y: 13,
          radius: 5,
          pointTypes: [],
        },
        transform: { type: "translate", dx: 2 },
      }),
    ).toThrow();
  });

  it("accepts set_absolute and set_relative point transforms and rejects mismatched target counts", () => {
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
        transform: {
          type: "set_absolute",
          points: [
            { x: 10, y: 11 },
            { x: 20, y: 21 },
          ],
        },
      }),
    ).toMatchObject({
      transform: {
        type: "set_absolute",
        points: [
          { x: 10, y: 11 },
          { x: 20, y: 21 },
        ],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: {
          type: "set_absolute",
          points: [{ x: 10, y: 11 }],
        },
      }),
    ).toThrow("target point count");

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
        transform: {
          type: "set_relative",
          points: [
            { x: 3, y: 4 },
            { x: 8, y: 9 },
          ],
        },
      }),
    ).toMatchObject({
      transform: {
        type: "set_relative",
        points: [
          { x: 3, y: 4 },
          { x: 8, y: 9 },
        ],
      },
    });

    expect(() =>
      transformPathPointsSchema.parse({
        docId: "path-doc",
        elementId: "line",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: {
          type: "set_relative",
          points: [{ x: 3, y: 4 }],
        },
      }),
    ).toThrow("target point count");
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
