import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import {
  appendPathSegment,
  applySvgOperations,
  drawPath,
  editPathNodes,
  nudgePathElement,
  queryPathNodes,
  replacePathData,
  transformPathPoints,
  updateElement,
  validatePathDataTool,
} from "../src/tools/elements.js";

describe("element tools", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-elements-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("sync-doc", "Sync doc", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("syncs update_element attribute edits directly into the active Inkscape window", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await updateElement(
      {
        docId: "sync-doc",
        elementId: "box",
        setAttributes: { fill: "#facc15", x: 4, opacity: 0.75 },
        removeAttributes: [],
      },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 1234 } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [
        { elementId: "box", attributeName: "fill", value: "#facc15" },
        { elementId: "box", attributeName: "x", value: "4" },
        { elementId: "box", attributeName: "opacity", value: "0.75" },
      ],
      timeoutMs: 1234,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "active_window_attribute_sync",
        changedAttributeCount: 3,
      },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('fill="#facc15"');
  });

  it("syncs attribute-only apply_svg_operations batches directly into the active Inkscape window", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await applySvgOperations(
      {
        docId: "sync-doc",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          { type: "update", elementId: "dot", setAttributes: { stroke: "#15803d", r: 7 }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [
        { elementId: "box", attributeName: "fill", value: "#22c55e" },
        { elementId: "dot", attributeName: "stroke", value: "#15803d" },
        { elementId: "dot", attributeName: "r", value: "7" },
      ],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "active_window_attribute_sync",
        changedAttributeCount: 3,
      },
    });
  });

  it("nudges a path left by half its width with compact output and direct sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await nudgePathElement(
      {
        docId: "sync-doc",
        elementId: "mouth",
        dxMode: "half_width_left",
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M79.5 30c18 4 31 1 41-9" }],
      timeoutMs: undefined,
    });
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      changed: {
        d: { from: "M100 30c18 4 31 1 41-9", to: "M79.5 30c18 4 31 1 41-9" },
        dx: -20.5,
        dy: 0,
      },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    expect(result).not.toHaveProperty("snapshotPath");
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M79.5 30c18 4 31 1 41-9"');
  });

  it("attempts companion refresh for apply_svg_operations batches with structural edits", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await applySvgOperations(
      {
        docId: "sync-doc",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#ef4444" }, removeAttributes: [] },
          {
            type: "add",
            elementType: "rect",
            attributes: { id: "new-box", x: 20, y: 20, width: 5, height: 5 },
          },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "companion_extension",
      },
    });
  });

  it("draws a path and attempts companion refresh for the structural edit", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await drawPath(
      {
        docId: "sync-doc",
        elementId: "fin-line",
        d: "M10 10 C20 5 30 5 40 10",
        attributes: { fill: "none", stroke: "#166534" },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      docId: "sync-doc",
      elementId: "fin-line",
      d: "M10 10 C20 5 30 5 40 10",
      guiRefresh: { method: "companion_extension", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('id="fin-line"');
  });

  it("replaces path data with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await replacePathData(
      {
        docId: "sync-doc",
        elementId: "mouth",
        segments: [
          { cmd: "M", x: 90, y: 30 },
          { cmd: "C", x1: 110, y1: 34, x2: 125, y2: 31, x: 140, y: 21 },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M90 30 C110 34 125 31 140 21" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M90 30 C110 34 125 31 140 21" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
  });

  it("appends path segments with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await appendPathSegment(
      {
        docId: "sync-doc",
        elementId: "mouth",
        d: "L150 24",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30c18 4 31 1 41-9 L150 24" }],
      timeoutMs: undefined,
    });
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30c18 4 31 1 41-9 L150 24" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
  });

  it("edits path nodes with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await editPathNodes(
      {
        docId: "sync-doc",
        elementId: "mouth",
        edits: [
          { type: "move_point", segmentIndex: 0, point: "end", dx: -10, dy: 2 },
          { type: "move_point", segmentIndex: 1, point: "end", dx: -5, dy: 1 },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M90 32 c18 4 31 1 36 -8" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      editCount: 2,
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M90 32 c18 4 31 1 36 -8" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
  });

  it("transforms path points with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "sync-doc",
        elementId: "mouth",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c14 6 31 1 37 -7" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      editedSegments: [1],
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
      ],
      transform: { type: "translate", dx: -4, dy: 2 },
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c14 6 31 1 37 -7" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c14 6 31 1 37 -7"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("sets path points to absolute coordinates with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "sync-doc",
        elementId: "mouth",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: {
          type: "set_absolute",
          points: [
            { x: 116, y: 36 },
            { x: 138, y: 24 },
          ],
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c16 6 31 1 38 -6" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      editedSegments: [1],
      transform: {
        type: "set_absolute",
        points: [
          { x: 116, y: 36 },
          { x: 138, y: 24 },
        ],
      },
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c16 6 31 1 38 -6" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c16 6 31 1 38 -6"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("sets path points to relative coordinates with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "sync-doc",
        elementId: "mouth",
        pointSelector: {
          points: [
            { segmentIndex: 1, point: "c1" },
            { segmentIndex: 1, point: "end" },
          ],
        },
        transform: {
          type: "set_relative",
          points: [
            { x: 16, y: 6 },
            { x: 38, y: -6 },
          ],
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c16 6 31 1 38 -6" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      editedSegments: [1],
      transform: {
        type: "set_relative",
        points: [
          { x: 16, y: 6 },
          { x: 38, y: -6 },
        ],
      },
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c16 6 31 1 38 -6" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c16 6 31 1 38 -6"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("transforms bbox-selected path points with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "sync-doc",
        elementId: "mouth",
        pointSelector: {
          type: "bbox",
          minX: 118,
          minY: 21,
          maxX: 141,
          maxY: 34,
          pointTypes: ["end", "c1"],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c14 6 31 1 37 -7" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c14 6 31 1 37 -7" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c14 6 31 1 37 -7"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("transforms segment-range-selected path points with direct active-window attribute sync", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "sync-doc",
        elementId: "mouth",
        pointSelector: {
          type: "segment_range",
          startSegmentIndex: 1,
          endSegmentIndex: 1,
          pointTypes: ["c1", "end"],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c14 6 31 1 37 -7" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c14 6 31 1 37 -7" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c14 6 31 1 37 -7"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("rejects invalid point transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 12, point: "end" }] },
          transform: { type: "translate", dx: -4, dy: 2 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("out of range");

    expect(sync).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid set_absolute transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 0, point: "c2" }] },
          transform: { type: "set_absolute", points: [{ x: 110, y: 32 }] },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("c2");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid set_relative transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 0, point: "c2" }] },
          transform: { type: "set_relative", points: [{ x: 10, y: 2 }] },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("c2");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects empty bbox-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "bbox",
            minX: 1,
            minY: 1,
            maxX: 2,
            maxY: 2,
          },
          transform: { type: "translate", dx: 1, dy: 0 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("matched no editable points");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects empty segment-range-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "segment_range",
            startSegmentIndex: 0,
            endSegmentIndex: 0,
            pointTypes: ["c1"],
          },
          transform: { type: "translate", dx: 1, dy: 0 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("matched no editable points");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("queries path nodes without writing or refreshing the Inkscape window", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryPathNodes(
      {
        docId: "sync-doc",
        elementId: "mouth",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "sync-doc",
      elementId: "mouth",
      d: "M100 30c18 4 31 1 41-9",
      segmentCount: 2,
      segments: [
        {
          index: 0,
          cmd: "M",
          availablePoints: ["end"],
          absolutePoints: { end: { x: 100, y: 30 } },
        },
        {
          index: 1,
          cmd: "c",
          availablePoints: ["c1", "c2", "end"],
          absolutePoints: {
            c1: { x: 118, y: 34 },
            c2: { x: 131, y: 31 },
            end: { x: 141, y: 21 },
          },
        },
      ],
    });
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
  });

  it("queries absolute-normalized path nodes without writing or refreshing", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryPathNodes(
      {
        docId: "sync-doc",
        elementId: "mouth",
        normalize: "absolute",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "sync-doc",
      elementId: "mouth",
      normalize: "absolute",
      normalizedSegments: [
        {
          index: 0,
          cmd: "M",
          points: { end: { x: 100, y: 30 } },
        },
        {
          index: 1,
          cmd: "c",
          points: {
            c1: { x: 118, y: 34 },
            c2: { x: 131, y: 31 },
            end: { x: 141, y: 21 },
          },
        },
      ],
    });
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
  });

  it("validates path data without workspace or Inkscape side effects", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");
    const beforeSvg = await workspace.readSvg("sync-doc");

    await expect(validatePathDataTool({ d: "M1 1 L2 2" })).resolves.toMatchObject({
      toolName: "validate_path_data",
      ok: true,
      requireMoveTo: true,
      segmentCount: 2,
      commandCounts: { M: 1, L: 1 },
      unsupportedCommandCount: 0,
      availablePointCount: 2,
    });

    await expect(validatePathDataTool({ d: "L2 2", requireMoveTo: false })).resolves.toMatchObject({
      ok: true,
      requireMoveTo: false,
      segmentCount: 1,
      commandCounts: { L: 1 },
      unsupportedCommandCount: 0,
    });

    await expect(validatePathDataTool({ d: "M1 1 A2 2 0 0 1 3 3", requireMoveTo: true })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        details: { command: "A" },
      },
    });

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.readSvg("sync-doc")).resolves.toBe(beforeSvg);
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
  });
});

function baseSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <rect id="box" x="1" y="1" width="10" height="10" fill="#ef4444"/>
  <circle id="dot" cx="20" cy="20" r="5" fill="#ffffff" stroke="#111827"/>
  <path id="mouth" d="M100 30c18 4 31 1 41-9" fill="none"/>
</svg>`;
}
