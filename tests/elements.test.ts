import { mkdtemp, readFile, rm } from "node:fs/promises";
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

  it("edits representable H/V endpoints with direct active-window attribute sync", async () => {
    await workspace.createDocument(
      "axis-doc",
      "Axis doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="axis" d="M10 10 H20 v8 h-5 V12" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await editPathNodes(
      {
        docId: "axis-doc",
        elementId: "axis",
        edits: [
          { type: "move_point", segmentIndex: 1, point: "end", dx: 3, dy: 0 },
          { type: "set_point_absolute", segmentIndex: 2, point: "end", x: 23, y: 20 },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "axis", attributeName: "d", value: "M10 10 H23 v10 h-5 V12" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "axis",
      editCount: 2,
      changed: { d: { from: "M10 10 H20 v8 h-5 V12", to: "M10 10 H23 v10 h-5 V12" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("axis-doc")).resolves.toContain('d="M10 10 H23 v10 h-5 V12"');
    const history = await workspace.listHistory("axis-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("edit_path_nodes");
  });

  it("edits arc endpoints with snapshots, diagnostics, logs, and direct sync", async () => {
    await workspace.createDocument(
      "arc-edit-doc",
      "Arc edit doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="arc" d="M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await editPathNodes(
      {
        docId: "arc-edit-doc",
        elementId: "arc",
        edits: [
          { type: "move_point", segmentIndex: 1, point: "end", dx: 2, dy: -3 },
          { type: "set_point_absolute", segmentIndex: 2, point: "end", x: 30, y: 24 },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    const expectedD = "M10 10 A5 6 45 0 1 22 22 a3 4 0 1 0 8 2";
    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "arc", attributeName: "d", value: expectedD }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "arc",
      editCount: 2,
      changed: {
        d: {
          from: "M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2",
          to: expectedD,
        },
      },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
      operationDiff: {
        summary: {
          changedElementCount: 1,
        },
      },
    });
    await expect(workspace.readSvg("arc-edit-doc")).resolves.toContain(`d="${expectedD}"`);
    const history = await workspace.listHistory("arc-edit-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("edit_path_nodes");
    const log = await readFile(workspace.documentPaths("arc-edit-doc").operationsLog, "utf8");
    expect(log).toContain("edit_path_nodes");
  });

  it("rejects non-representable H/V exact node sets without writing history", async () => {
    await workspace.createDocument(
      "axis-doc",
      "Axis doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="axis" d="M10 10 H20 v8" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      editPathNodes(
        {
          docId: "axis-doc",
          elementId: "axis",
          edits: [{ type: "set_point_absolute", segmentIndex: 2, point: "end", x: 19, y: 20 }],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("V path endpoints cannot change x");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("axis-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("axis-doc")).resolves.toContain('d="M10 10 H20 v8"');
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

  it("transforms representable H/V endpoints with direct active-window attribute sync", async () => {
    await workspace.createDocument(
      "axis-doc",
      "Axis doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="axis" d="M10 10 H20 v8 h-5 V12" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "axis-doc",
        elementId: "axis",
        pointSelector: {
          type: "command",
          commands: ["H", "h"],
        },
        transform: { type: "translate", dx: -2, dy: 0 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "axis", attributeName: "d", value: "M10 10 H18 v8 h-7 V12" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "axis",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 3, point: "end" },
      ],
      editedSegments: [1, 3],
      changed: { d: { from: "M10 10 H20 v8 h-5 V12", to: "M10 10 H18 v8 h-7 V12" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("axis-doc")).resolves.toContain('d="M10 10 H18 v8 h-7 V12"');
    const history = await workspace.listHistory("axis-doc");
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

  it("transforms nearest-selected path points with direct active-window attribute sync", async () => {
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
          type: "nearest",
          x: 119,
          y: 35,
          pointTypes: ["c1", "end"],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c14 6 31 1 41 -9" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 1,
      selectedPoints: [{ segmentIndex: 1, point: "c1" }],
      editedSegments: [1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c14 6 31 1 41 -9" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c14 6 31 1 41 -9"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("transforms radius-selected path points with direct active-window attribute sync", async () => {
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
          type: "radius",
          x: 119,
          y: 35,
          radius: 14,
          pointTypes: ["c1", "c2"],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c14 6 27 3 41 -9" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "c2" },
      ],
      editedSegments: [1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c14 6 27 3 41 -9" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c14 6 27 3 41 -9"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("transforms segment-list-selected path points with direct active-window attribute sync", async () => {
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
          type: "segment_list",
          segmentIndexes: [1],
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

  it("transforms command-selected path points with direct active-window attribute sync", async () => {
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
          type: "command",
          commands: ["c"],
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

  it("transforms point-type-selected path points with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["c1", "end"],
        },
        transform: { type: "translate", dx: -4, dy: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M96 32 c14 6 31 1 37 -7" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 3,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "c1" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M96 32 c14 6 31 1 37 -7" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M96 32 c14 6 31 1 37 -7"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("scales selected path points with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "scale",
          origin: { x: 100, y: 30 },
          sx: 0.5,
          sy: 2,
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c18 4 31 1 20.5 -18" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c18 4 31 1 20.5 -18" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c18 4 31 1 20.5 -18"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("rotates selected path points with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "rotate",
          origin: { x: 100, y: 30 },
          angleDegrees: 90,
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c18 4 31 1 9 41" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c18 4 31 1 9 41" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c18 4 31 1 9 41"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("reflects selected path points with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "reflect",
          axis: "vertical",
          origin: { x: 100, y: 30 },
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c18 4 31 1 -41 -9" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c18 4 31 1 -41 -9" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c18 4 31 1 -41 -9"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("skews selected path points with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "skew",
          axis: "x",
          origin: { x: 100, y: 30 },
          angleDegrees: 45,
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c18 4 31 1 32 -9" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c18 4 31 1 32 -9" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c18 4 31 1 32 -9"');
    const history = await workspace.listHistory("sync-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("reflects selected path points across an arbitrary line with direct active-window attribute sync", async () => {
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
          type: "point_type",
          pointTypes: ["end"],
        },
        transform: {
          type: "reflect_line",
          origin: { x: 100, y: 30 },
          angleDegrees: 45,
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "mouth", attributeName: "d", value: "M100 30 c18 4 31 1 -9 41" }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "mouth",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 0, point: "end" },
        { segmentIndex: 1, point: "end" },
      ],
      editedSegments: [0, 1],
      transform: {
        type: "reflect_line",
        origin: { x: 100, y: 30 },
        angleDegrees: 45,
      },
      changed: { d: { from: "M100 30c18 4 31 1 41-9", to: "M100 30 c18 4 31 1 -9 41" } },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
    });
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30 c18 4 31 1 -9 41"');
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

  it("transforms arc endpoints through command selectors with direct sync", async () => {
    await workspace.createDocument(
      "arc-transform-doc",
      "Arc transform doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="arc" d="M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await transformPathPoints(
      {
        docId: "arc-transform-doc",
        elementId: "arc",
        pointSelector: { type: "command", commands: ["A", "a"], pointTypes: ["end"] },
        transform: {
          type: "set_relative",
          points: [
            { x: 12, y: 14 },
            { x: 7, y: -4 },
          ],
        },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    const expectedD = "M10 10 A5 6 45 0 1 22 24 a3 4 0 1 0 7 -4";
    expect(sync).toHaveBeenCalledWith({
      updates: [{ elementId: "arc", attributeName: "d", value: expectedD }],
      timeoutMs: undefined,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      elementId: "arc",
      selectedPointCount: 2,
      selectedPoints: [
        { segmentIndex: 1, point: "end" },
        { segmentIndex: 2, point: "end" },
      ],
      editedSegments: [1, 2],
      changed: {
        d: {
          from: "M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2",
          to: expectedD,
        },
      },
      guiRefresh: { method: "active_window_attribute_sync", refreshed: true },
      operationDiff: {
        summary: {
          changedElementCount: 1,
        },
      },
    });
    await expect(workspace.readSvg("arc-transform-doc")).resolves.toContain(`d="${expectedD}"`);
    const history = await workspace.listHistory("arc-transform-doc");
    expect(history).toHaveLength(1);
    expect(history[0].snapshotId).toContain("transform_path_points");
  });

  it("rejects arc control point transforms without writing history", async () => {
    await workspace.createDocument(
      "arc-invalid-doc",
      "Arc invalid doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="arc" d="M10 10 A5 6 45 0 1 20 25" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "arc-invalid-doc",
          elementId: "arc",
          pointSelector: { points: [{ segmentIndex: 1, point: "c1" }] },
          transform: { type: "translate", dx: 1, dy: 0 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("no c1 control point");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("arc-invalid-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("arc-invalid-doc")).resolves.toContain('d="M10 10 A5 6 45 0 1 20 25"');
  });

  it("rejects non-representable H/V node edits without writing history", async () => {
    await workspace.createDocument(
      "axis-doc",
      "Axis doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="axis" d="M10 10 H20 v8" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      editPathNodes(
        {
          docId: "axis-doc",
          elementId: "axis",
          edits: [{ type: "move_point", segmentIndex: 1, point: "end", dx: 0, dy: 1 }],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("H path endpoints cannot move vertically");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("axis-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("axis-doc")).resolves.toContain('d="M10 10 H20 v8"');
  });

  it("rejects non-representable H/V point transforms without writing history", async () => {
    await workspace.createDocument(
      "axis-doc",
      "Axis doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="axis" d="M10 10 H20 v8" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "axis-doc",
          elementId: "axis",
          pointSelector: { points: [{ segmentIndex: 2, point: "end" }] },
          transform: { type: "set_absolute", points: [{ x: 19, y: 20 }] },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("V path endpoints cannot change x");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("axis-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("axis-doc")).resolves.toContain('d="M10 10 H20 v8"');
  });

  it("rejects invalid scale transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
          transform: {
            type: "scale",
            origin: { x: 100, y: 30 },
            sx: 0,
            sy: 1,
          },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("non-zero");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid rotate transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
          transform: {
            type: "rotate",
            origin: { x: 100, y: 30 },
            angleDegrees: 0,
          },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("non-zero");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid reflect transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
          transform: {
            type: "reflect",
            axis: "diagonal",
            origin: { x: 100, y: 30 },
          } as never,
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow();

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid reflect-line transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
          transform: {
            type: "reflect_line",
            origin: { x: 100, y: 30 },
            angleDegrees: Number.NaN,
          },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow();

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects invalid skew transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: { points: [{ segmentIndex: 1, point: "end" }] },
          transform: {
            type: "skew",
            axis: "x",
            origin: { x: 100, y: 30 },
            angleDegrees: 0,
          },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("non-zero");

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

  it("rejects nearest-selected path transforms beyond maxDistance without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "nearest",
            x: 119,
            y: 35,
            maxDistance: 0.5,
          },
          transform: { type: "translate", dx: -4, dy: 2 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("maxDistance");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("sync-doc")).resolves.toContain('d="M100 30c18 4 31 1 41-9"');
  });

  it("rejects empty radius-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "radius",
            x: 1,
            y: 1,
            radius: 2,
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

  it("rejects empty segment-list-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "segment_list",
            segmentIndexes: [0],
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

  it("rejects empty command-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      transformPathPoints(
        {
          docId: "sync-doc",
          elementId: "mouth",
          pointSelector: {
            type: "command",
            commands: ["C"],
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

  it("rejects empty point-type-selected path transforms without writing history", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");
    await workspace.createDocument(
      "line-doc",
      "Line doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="line" d="M1 1 L2 2" fill="none"/>
</svg>`,
    );

    await expect(
      transformPathPoints(
        {
          docId: "line-doc",
          elementId: "line",
          pointSelector: {
            type: "point_type",
            pointTypes: ["c1"],
          },
          transform: { type: "translate", dx: 1, dy: 0 },
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toThrow("matched no editable points");

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.listHistory("line-doc")).resolves.toEqual([]);
    await expect(workspace.readSvg("line-doc")).resolves.toContain('d="M1 1 L2 2"');
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

  it("queries relative-normalized path nodes without writing or refreshing", async () => {
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryPathNodes(
      {
        docId: "sync-doc",
        elementId: "mouth",
        normalize: "relative",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "sync-doc",
      elementId: "mouth",
      normalize: "relative",
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
            c1: { x: 18, y: 4 },
            c2: { x: 31, y: 1 },
            end: { x: 41, y: -9 },
          },
        },
      ],
    });
    await expect(workspace.listHistory("sync-doc")).resolves.toEqual([]);
  });

  it("queries arc path nodes with editable arc endpoints without write side effects", async () => {
    await workspace.createDocument(
      "arc-doc",
      "Arc doc",
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <path id="arc" d="M10 10 A5 6 45 0 1 20 25 a3 4 0 1 0 5 -2" fill="none"/>
</svg>`,
    );
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryPathNodes(
      {
        docId: "arc-doc",
        elementId: "arc",
        normalize: "relative",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "arc-doc",
      elementId: "arc",
      segmentCount: 3,
      segments: [
        expect.objectContaining({
          index: 0,
          cmd: "M",
          queryPoints: ["end"],
          availablePoints: ["end"],
        }),
        expect.objectContaining({
          index: 1,
          cmd: "A",
          queryPoints: ["end"],
          availablePoints: ["end"],
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
          absolutePoints: { end: { x: 20, y: 25 } },
        }),
        expect.objectContaining({
          index: 2,
          cmd: "a",
          queryPoints: ["end"],
          availablePoints: ["end"],
          absolutePoints: { end: { x: 25, y: 23 } },
        }),
      ],
      normalizedSegments: [
        { index: 0, cmd: "M", points: { end: { x: 10, y: 10 } } },
        { index: 1, cmd: "A", points: { end: { x: 10, y: 15 } } },
        { index: 2, cmd: "a", points: { end: { x: 5, y: -2 } } },
      ],
    });
    await expect(workspace.listHistory("arc-doc")).resolves.toEqual([]);
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
      ok: true,
      segmentCount: 2,
      commandCounts: { M: 1, A: 1 },
      availablePointCount: 2,
      queryPointCount: 2,
      editablePointSummary: [
        { segmentIndex: 0, cmd: "M", queryPoints: ["end"], availablePoints: ["end"] },
        { segmentIndex: 1, cmd: "A", queryPoints: ["end"], availablePoints: ["end"] },
      ],
    });

    await expect(validatePathDataTool({ d: "M1 1 A2 2 0 0 3 3 3", requireMoveTo: true })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Arc path sweep flag must be 0 or 1.",
        details: {
          command: "A",
          segmentIndex: 1,
          flag: "sweepFlag",
          value: 3,
        },
      },
    });

    await expect(validatePathDataTool({ d: "M1 1 C2 2 3", requireMoveTo: true })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        details: {
          command: "C",
          segmentIndex: 1,
          commandIndex: 1,
          expectedParamCount: 6,
          actualParamCount: 3,
          missingParamCount: 3,
        },
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
