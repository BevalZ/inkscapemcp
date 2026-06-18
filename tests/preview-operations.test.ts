import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";
import { connectInkscapeWindow } from "../src/tools/sync.js";
import { previewSvgOperations } from "../src/tools/document.js";

describe("preview_svg_operations", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-preview-ops-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("preview-doc", "Preview", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("returns compact operation diffs without full change arrays or state mutation", async () => {
    const before = await captureState("preview-doc");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await previewSvgOperations(
      {
        docId: "preview-doc",
        responseMode: "compact",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          {
            type: "add",
            elementType: "circle",
            attributes: { id: "new-dot", cx: 60, cy: 60, r: 4, fill: "#facc15" },
          },
          { type: "delete", elementId: "remove-me" },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "preview-doc",
      responseMode: "compact",
      operationCount: 3,
      summary: {
        addedElementCount: 1,
        removedElementCount: 1,
        changedElementCount: 3,
        attributeChangeCount: 1,
        textChangeCount: 0,
        structureChangeCount: 0,
      },
      addedElementIds: ["new-dot"],
      removedElementIds: ["remove-me"],
      changedElementIds: ["box", "new-dot", "remove-me"],
      previewChangedElementIds: ["box", "new-dot", "remove-me"],
    });
    expect(result).not.toHaveProperty("diff");
    expect(result).not.toHaveProperty("attributeChanges");
    expect(result).not.toHaveProperty("textChanges");
    expect(result).not.toHaveProperty("structureChanges");

    await expectStateUnchanged("preview-doc", before);
  });

  it("returns full structured diffs from the shared diff engine", async () => {
    const before = await captureState("preview-doc");

    const result = await previewSvgOperations(
      {
        docId: "preview-doc",
        responseMode: "full",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          { type: "update", elementId: "label", setAttributes: {}, removeAttributes: [], text: "updated" },
          {
            type: "add",
            elementType: "circle",
            attributes: { id: "new-dot", cx: 60, cy: 60, r: 4, fill: "#facc15" },
          },
          { type: "delete", elementId: "remove-me" },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      summary: {
        addedElementCount: 1,
        removedElementCount: 1,
        changedElementCount: 4,
        attributeChangeCount: 1,
        textChangeCount: 1,
      },
      diff: {
        attributeChanges: [
          {
            elementId: "box",
            attributeName: "fill",
            before: "#ef4444",
            after: "#22c55e",
          },
        ],
        textChanges: [{ elementId: "label", before: "hello", after: "updated" }],
      },
    });
    expect(result.diff?.addedElementIds).toEqual(["new-dot"]);
    expect(result.diff?.removedElementIds).toEqual(["remove-me"]);

    await expectStateUnchanged("preview-doc", before);
  });

  it("rejects invalid operation batches without changing state", async () => {
    const before = await captureState("preview-doc");

    await expect(
      previewSvgOperations(
        {
          docId: "preview-doc",
          responseMode: "compact",
          operations: [
            { type: "update", elementId: "missing", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expectStateUnchanged("preview-doc", before);
  });

  it("allows stale previews with a warning when bidirectional pre-pull fails", async () => {
    await connectInkscapeWindow(
      { docId: "preview-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const before = await captureState("preview-doc");

    const result = await previewSvgOperations(
      {
        docId: "preview-doc",
        responseMode: "compact",
        allowStaleRead: true,
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({
      ok: true,
      warnings: [expect.objectContaining({ code: "GUI_PRE_PULL_FAILED_STALE_READ" })],
      changedElementIds: ["box"],
    });
    await expectStateUnchanged("preview-doc", before);
  });

  it("uses a fresh bidirectional pre-pull before previewing when available", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "preview-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg().replace('fill="#ef4444"', 'fill="#0ea5e9"'), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        windowId: options.windowId,
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
          windowId: options.windowId,
          exportedAt: new Date().toISOString(),
          svgPath: workspace.guiPullSvgPath(options.requestId),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await previewSvgOperations(
      {
        docId: "preview-doc",
        responseMode: "full",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      guiPrePull: { wrote: true },
      diff: {
        attributeChanges: [
          {
            elementId: "box",
            attributeName: "fill",
            before: "#0ea5e9",
            after: "#22c55e",
          },
        ],
      },
    });
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe((await workspace.readMetadata("preview-doc")).revision);
  });

  async function captureState(docId: string) {
    const paths = workspace.documentPaths(docId);
    return {
      svg: await workspace.readSvg(docId),
      metadata: await workspace.readMetadata(docId),
      history: await workspace.listHistory(docId),
      operationLog: await readOptional(paths.operationsLog),
      operationDiffEntries: await listOptional(paths.operationDiffsDir),
    };
  }

  async function expectStateUnchanged(docId: string, before: Awaited<ReturnType<typeof captureState>>) {
    await expect(workspace.readSvg(docId)).resolves.toBe(before.svg);
    await expect(workspace.readMetadata(docId)).resolves.toMatchObject({
      revision: before.metadata.revision,
      contentHash: before.metadata.contentHash,
      lastWriter: before.metadata.lastWriter,
    });
    await expect(workspace.listHistory(docId)).resolves.toEqual(before.history);
    const paths = workspace.documentPaths(docId);
    await expect(readOptional(paths.operationsLog)).resolves.toBe(before.operationLog);
    await expect(listOptional(paths.operationDiffsDir)).resolves.toEqual(before.operationDiffEntries);
  }
});

async function readOptional(filePath: string): Promise<string | undefined> {
  const exists = await stat(filePath).then(() => true, () => false);
  return exists ? readFile(filePath, "utf8") : undefined;
}

async function listOptional(dirPath: string): Promise<string[]> {
  const exists = await stat(dirPath).then((info) => info.isDirectory(), () => false);
  return exists ? readdir(dirPath) : [];
}

function baseSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <rect id="box" x="1" y="1" width="10" height="10" fill="#ef4444"/>
  <text id="label" x="20" y="20">hello</text>
  <circle id="remove-me" cx="40" cy="40" r="4"/>
</svg>`;
}
