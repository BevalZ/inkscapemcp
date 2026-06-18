import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { injectInkMcpMarker, stripInkMcpMetadata } from "../src/core/sync-metadata.js";
import { addElement, updateElement } from "../src/tools/elements.js";
import { connectInkscapeWindow, pullGuiState } from "../src/tools/sync.js";
import { exportDocument } from "../src/tools/preview.js";
import { queryDocument, rollbackDocument } from "../src/tools/document.js";

describe("bidirectional GUI sync", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-sync-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("fish", "Fish", baseSvg("#f9a8d4"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("connects a document by injecting a marker and creating connection config", async () => {
    const result = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional", documentPath: workspace.documentPaths("fish").currentSvg },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({ ok: true, docId: "fish" });
    const svg = await workspace.readSvg("fish");
    expect(svg).toContain("inksmcp-sync-metadata");
    const connection = await workspace.readConnection(result.connection.connectionId);
    expect(connection).toMatchObject({
      docId: "fish",
      syncMode: "bidirectional",
      state: "connected",
      baselineRevision: 2,
    });
  });

  it("attempts to push the connection marker into the active window on connect", async () => {
    const refresh = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 1234 } },
    );

    expect(refresh).toHaveBeenCalledWith({
      docId: "fish",
      workspaceRoot: workspace.paths.root,
      timeoutMs: 1234,
    });
    expect(result).toMatchObject({
      ok: true,
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
  });

  it("pulls GUI state, updates revision metadata, and returns id diff without refreshing Inkscape", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#facc15", '<circle id="bubble" cx="80" cy="20" r="4"/>'), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          inferredDocId: options.docId,
          exportedAt: new Date().toISOString(),
          svgPath: workspace.guiPullSvgPath(options.requestId),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });
    const refresh = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "reject",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      wrote: true,
      idDiff: { added: ["bubble"], removed: [], retained: expect.arrayContaining(["body"]) },
    });
    expect(result.idDiff.retained).not.toContain("inksmcp-sync-metadata");
    await expect(workspace.readSvg("fish")).resolves.toContain('fill="#facc15"');
    const metadata = await workspace.readMetadata("fish");
    expect(metadata).toMatchObject({ revision: 3, lastWriter: "gui" });
    expect(metadata.lastGuiPullAt).toBeTruthy();
  });

  it("pre-pulls before writes and leaves workspace unchanged when GUI pull fails", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const before = await workspace.readSvg("fish");
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await expect(
      updateElement(
        {
          docId: "fish",
          elementId: "body",
          setAttributes: { fill: "#22c55e" },
          removeAttributes: [],
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("GUI pull manifest");

    await expect(workspace.readSvg("fish")).resolves.toBe(before);
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.lastPulledAt).toBeUndefined();
  });

  it("rejects a GUI pull manifest with a mismatched request id", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      await writeFile(workspace.guiPullSvgPath(options.requestId), await workspace.readSvg("fish"), "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: "pull-different",
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        {
          docId: "fish",
          connectionId: connected.connection.connectionId,
          conflictPolicy: "reject",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("request id");
  });

  it("rejects GUI pull conflicts by default and supports prefer_gui", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_conflict", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="workspace-change" cx="5" cy="5" r="2"/></svg>'),
      result: {},
    }));
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#a7f3d0"), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        { docId: "fish", connectionId: connected.connection.connectionId, conflictPolicy: "reject" },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("changed since");

    const result = await pullGuiState(
      { docId: "fish", connectionId: connected.connection.connectionId, conflictPolicy: "prefer_gui" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({ ok: true, wrote: true });
    await expect(workspace.readSvg("fish")).resolves.not.toContain("workspace-change");
    await expect(workspace.readSvg("fish")).resolves.toContain("#a7f3d0");
  });

  it("allows stale query reads with a warning when pre-pull fails", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await queryDocument(
      { docId: "fish", allowStaleRead: true, skipPrePull: false },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      warnings: [expect.objectContaining({ code: "GUI_PRE_PULL_FAILED_STALE_READ" })],
    });
  });

  it("rejects rollback with active bidirectional sync unless discard is confirmed", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const snapshots = await workspace.listHistory("fish");
    const snapshotId = snapshots[0]?.snapshotId;
    expect(snapshotId).toBeTruthy();

    await expect(
      rollbackDocument(
        { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: false },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("discard active GUI state");

    const result = await rollbackDocument(
      { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: true },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(result).toMatchObject({ ok: true, restoredPath: expect.stringContaining(`${snapshotId}.svg`) });
  });

  it("strips InkSMCP metadata from SVG export by default", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "display_only" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const exportSpy = vi.spyOn(inkscape, "exportDocument").mockImplementation(async (inputPath, outputPath) => {
      await writeFile(outputPath, await readFile(inputPath, "utf8"), "utf8");
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await exportDocument(
      {
        docId: "fish",
        format: "svg",
        filename: "fish.svg",
        textToPath: false,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(exportSpy).toHaveBeenCalledTimes(1);
    await expect(readFile(result.outputPath, "utf8")).resolves.not.toContain(connected.connection.connectionId);
    expect(stripInkMcpMetadata(await workspace.readSvg("fish"))).not.toContain("inksmcp-sync-metadata");
  });

  it("preserves InkSMCP metadata when export opts in", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "display_only" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "exportDocument").mockImplementation(async (inputPath, outputPath) => {
      await writeFile(outputPath, await readFile(inputPath, "utf8"), "utf8");
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await exportDocument(
      {
        docId: "fish",
        format: "svg",
        filename: "fish-meta.svg",
        textToPath: false,
        includeInkMcpMetadata: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    await expect(readFile(result.outputPath, "utf8")).resolves.toContain(connected.connection.connectionId);
  });

  it("updates the connection baseline after a successful MCP write refresh", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      await writeFile(workspace.guiPullSvgPath(options.requestId), await workspace.readSvg("fish"), "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });
    vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await addElement(
      {
        docId: "fish",
        type: "circle",
        attributes: { id: "eye", cx: 30, cy: 20, r: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({ ok: true, guiRefresh: { refreshed: true } });
    const metadata = await workspace.readMetadata("fish");
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe(metadata.revision);
    expect(connection.baselineContentHash).toBe(metadata.contentHash);
  });
});

function baseSvg(fill: string, extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="${fill}"/>
  <path id="tail" d="M10 30 L1 18 L1 42 Z" fill="${fill}"/>
  ${extra}
</svg>`;
}
