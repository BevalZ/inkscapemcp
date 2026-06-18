import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";
import { replayOperations } from "../src/tools/document.js";
import { connectInkscapeWindow } from "../src/tools/sync.js";

describe("replay_operations", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-replay-ops-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("replay-doc", "Replay", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("rejects write-mode replay without a baseline before pre-pulling GUI state", async () => {
    await connectInkscapeWindow(
      { docId: "replay-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const push = vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension");
    const before = await captureState("replay-doc");

    await expect(
      replayOperations(
        {
          docId: "replay-doc",
          operations: [
            { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
          dryRun: false,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(push).not.toHaveBeenCalled();
    await expectStateUnchanged("replay-doc", before);
  });

  it("rejects stale write-mode baselines without writing", async () => {
    const baseline = await currentBaseline("replay-doc");
    await workspace.writeSvgWithSnapshot("replay-doc", "advance", (currentSvg) => ({
      svg: currentSvg.replace('fill="#ef4444"', 'fill="#0ea5e9"'),
      result: {},
    }));
    const before = await captureState("replay-doc");

    await expect(
      replayOperations(
        {
          docId: "replay-doc",
          baseline,
          dryRun: false,
          responseMode: "compact",
          operations: [
            { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({
      code: "SYNC_CONFLICT",
      details: {
        baseline,
        current: expect.objectContaining({ revision: before.metadata.revision }),
      },
    });

    await expectStateUnchanged("replay-doc", before);
  });

  it("replays attribute-only batches with snapshots, operation diffs, logs, and direct attribute sync", async () => {
    const baseline = await currentBaseline("replay-doc");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await replayOperations(
      {
        docId: "replay-doc",
        baseline,
        dryRun: false,
        responseMode: "full",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e", opacity: 0.8 }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 1234 } },
    );

    expect(sync).toHaveBeenCalledWith({
      updates: [
        { elementId: "box", attributeName: "fill", value: "#22c55e" },
        { elementId: "box", attributeName: "opacity", value: "0.8" },
      ],
      timeoutMs: 1234,
    });
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "replay-doc",
      dryRun: false,
      responseMode: "full",
      baseline,
      changedElementIds: ["box"],
      summary: { attributeChangeCount: 2, changedElementCount: 1 },
      diff: {
        attributeChanges: expect.arrayContaining([
          expect.objectContaining({ elementId: "box", attributeName: "fill", before: "#ef4444", after: "#22c55e" }),
          expect.objectContaining({ elementId: "box", attributeName: "opacity", after: "0.8" }),
        ]),
      },
      snapshotPath: expect.stringContaining("replay_operations"),
      currentSvgPath: workspace.documentPaths("replay-doc").currentSvg,
      operationDiff: {
        path: expect.stringContaining("operation-diffs"),
        summary: { attributeChangeCount: 2, changedElementCount: 1 },
      },
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "active_window_attribute_sync",
        changedAttributeCount: 2,
      },
    });
    await expect(workspace.readSvg("replay-doc")).resolves.toContain('fill="#22c55e"');
    await expect(workspace.readSvg("replay-doc")).resolves.toContain('opacity="0.8"');
    await expect(workspace.listHistory("replay-doc")).resolves.toHaveLength(1);
    await expect(readFile(workspace.documentPaths("replay-doc").operationsLog, "utf8")).resolves.toContain(
      '"toolName":"replay_operations"',
    );
    await expect(readFile(result.operationDiff?.path as string, "utf8")).resolves.toContain('"attributeChanges"');
  });

  it("rejects non-deterministic add operations without explicit ids before writing", async () => {
    const baseline = await currentBaseline("replay-doc");
    const before = await captureState("replay-doc");

    await expect(
      replayOperations(
        {
          docId: "replay-doc",
          baseline,
          dryRun: false,
          responseMode: "compact",
          operations: [
            {
              type: "add",
              elementType: "circle",
              attributes: { cx: 60, cy: 60, r: 4, fill: "#facc15" },
            },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      details: { operationIndexes: [0] },
    });

    await expectStateUnchanged("replay-doc", before);
  });

  it("replays structural batches with companion refresh", async () => {
    const baseline = await currentBaseline("replay-doc");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await replayOperations(
      {
        docId: "replay-doc",
        baseline,
        dryRun: false,
        responseMode: "compact",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          {
            type: "add",
            elementType: "circle",
            attributes: { id: "new-dot", cx: 60, cy: 60, r: 4, fill: "#facc15" },
          },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      dryRun: false,
      addedElementIds: ["new-dot"],
      changedElementIds: ["box", "new-dot"],
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
    expect(result).not.toHaveProperty("diff");
    await expect(workspace.readSvg("replay-doc")).resolves.toContain('id="new-dot"');
  });

  it("dry-runs replay without snapshots, logs, operation diffs, or refresh", async () => {
    const baseline = await currentBaseline("replay-doc");
    const before = await captureState("replay-doc");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await replayOperations(
      {
        docId: "replay-doc",
        baseline,
        dryRun: true,
        responseMode: "full",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      responseMode: "full",
      baseline,
      changedElementIds: ["box"],
      diff: {
        attributeChanges: [{ elementId: "box", attributeName: "fill", before: "#ef4444", after: "#22c55e" }],
      },
    });
    await expectStateUnchanged("replay-doc", before);
  });

  it("allows stale dry-run reads with a warning when bidirectional pre-pull fails", async () => {
    await connectInkscapeWindow(
      { docId: "replay-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    const before = await captureState("replay-doc");

    const result = await replayOperations(
      {
        docId: "replay-doc",
        dryRun: true,
        allowStaleRead: true,
        responseMode: "compact",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      warnings: [expect.objectContaining({ code: "GUI_PRE_PULL_FAILED_STALE_READ" })],
    });
    await expectStateUnchanged("replay-doc", before);
  });

  it("pre-pulls before comparing write-mode replay baseline", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "replay-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const baselineBeforeGuiPull = await currentBaseline("replay-doc");
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

    await expect(
      replayOperations(
        {
          docId: "replay-doc",
          baseline: baselineBeforeGuiPull,
          dryRun: false,
          responseMode: "compact",
          operations: [
            { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "SYNC_CONFLICT" });

    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe((await workspace.readMetadata("replay-doc")).revision);
    await expect(workspace.readSvg("replay-doc")).resolves.toContain('fill="#0ea5e9"');
  });

  async function currentBaseline(docId: string) {
    const metadata = await workspace.readMetadata(docId);
    return {
      revision: metadata.revision,
      contentHash: metadata.contentHash,
    };
  }

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
</svg>`;
}
