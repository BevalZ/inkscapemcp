import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";
import { applyOperationPreview, previewSvgOperations, replayOperations } from "../src/tools/document.js";
import { connectInkscapeWindow } from "../src/tools/sync.js";

describe("apply_operation_preview", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-apply-preview-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("apply-preview-doc", "Apply Preview", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("rejects missing confirmation before pre-pulling or writing", async () => {
    const previewId = await savePreview(await currentBaseline("apply-preview-doc"));
    await connectInkscapeWindow(
      { docId: "apply-preview-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const push = vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension");
    const before = await captureState("apply-preview-doc");

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId,
          confirmApplyPreview: false,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(push).not.toHaveBeenCalled();
    await expectStateUnchanged("apply-preview-doc", before);
  });

  it("rejects unsafe preview ids without writing", async () => {
    const before = await captureState("apply-preview-doc");

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId: "../escape",
          confirmApplyPreview: true,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expectStateUnchanged("apply-preview-doc", before);
  });

  it("rejects unguarded preview artifacts without writing", async () => {
    const previewId = await savePreview(undefined);
    const before = await captureState("apply-preview-doc");

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId,
          confirmApplyPreview: true,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      details: { required: ["baseline.revision", "baseline.contentHash"] },
    });

    await expectStateUnchanged("apply-preview-doc", before);
  });

  it("rejects explicit baselines that differ from artifact baselines", async () => {
    const baseline = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(baseline);
    const before = await captureState("apply-preview-doc");

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId,
          baseline: { revision: baseline.revision + 1, contentHash: baseline.contentHash },
          confirmApplyPreview: true,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expectStateUnchanged("apply-preview-doc", before);
  });

  it("rejects stale current metadata before snapshotting or writing", async () => {
    const baseline = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(baseline);
    await workspace.writeSvgWithSnapshot("apply-preview-doc", "advance", (currentSvg) => ({
      svg: currentSvg.replace('fill="#ef4444"', 'fill="#0ea5e9"'),
      result: {},
    }));
    const before = await captureState("apply-preview-doc");

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId,
          confirmApplyPreview: true,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "SYNC_CONFLICT" });

    await expectStateUnchanged("apply-preview-doc", before);
  });

  it("applies a saved preview with snapshot, operation diff, log, and structural refresh", async () => {
    const baseline = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(baseline);
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await applyOperationPreview(
      {
        docId: "apply-preview-doc",
        previewId,
        confirmApplyPreview: true,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 2468 } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledWith({
      docId: "apply-preview-doc",
      workspaceRoot: workspace.paths.root,
      timeoutMs: 2468,
    });
    expect(result).toMatchObject({
      ok: true,
      docId: "apply-preview-doc",
      previewId,
      responseMode: "compact",
      applied: true,
      previewToolName: "replay_operations",
      operationCount: 2,
      baseline,
      summary: { addedElementCount: 1, attributeChangeCount: 1 },
      addedElementIds: ["new-dot"],
      changedElementIds: ["box", "new-dot"],
      snapshotPath: expect.stringContaining("apply_operation_preview"),
      currentSvgPath: workspace.documentPaths("apply-preview-doc").currentSvg,
      operationDiff: {
        path: expect.stringContaining("operation-diffs"),
        summary: { addedElementCount: 1, attributeChangeCount: 1 },
      },
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
    expect(result).not.toHaveProperty("diff");
    await expect(workspace.readSvg("apply-preview-doc")).resolves.toContain('fill="#22c55e"');
    await expect(workspace.readSvg("apply-preview-doc")).resolves.toContain('id="new-dot"');
    await expect(workspace.listHistory("apply-preview-doc")).resolves.toHaveLength(1);
    await expect(readFile(workspace.documentPaths("apply-preview-doc").operationsLog, "utf8")).resolves.toContain(
      '"toolName":"apply_operation_preview"',
    );
    await expect(readFile(result.operationDiff?.path as string, "utf8")).resolves.toContain('"attributeChanges"');
  });

  it("applies an unguarded preview when an explicit current baseline is supplied", async () => {
    const baseline = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(undefined);

    const result = await applyOperationPreview(
      {
        docId: "apply-preview-doc",
        previewId,
        baseline,
        confirmApplyPreview: true,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      previewToolName: "preview_svg_operations",
      baseline,
      changedElementIds: ["box", "new-dot"],
    });
    await expect(workspace.readSvg("apply-preview-doc")).resolves.toContain('id="new-dot"');
  });

  it("returns full structured diffs on request", async () => {
    const baseline = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(baseline);

    const result = await applyOperationPreview(
      {
        docId: "apply-preview-doc",
        previewId,
        confirmApplyPreview: true,
        responseMode: "full",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      diff: {
        addedElementIds: ["new-dot"],
        attributeChanges: [
          {
            elementId: "box",
            attributeName: "fill",
            before: "#ef4444",
            after: "#22c55e",
          },
        ],
      },
    });
  });

  it("pre-pulls bidirectional GUI state before baseline comparison", async () => {
    const baselineBeforeGuiPull = await currentBaseline("apply-preview-doc");
    const previewId = await savePreview(baselineBeforeGuiPull);
    const connected = await connectInkscapeWindow(
      { docId: "apply-preview-doc", syncMode: "bidirectional" },
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

    await expect(
      applyOperationPreview(
        {
          docId: "apply-preview-doc",
          previewId,
          confirmApplyPreview: true,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "SYNC_CONFLICT" });

    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe((await workspace.readMetadata("apply-preview-doc")).revision);
    await expect(workspace.readSvg("apply-preview-doc")).resolves.toContain('fill="#0ea5e9"');
  });

  async function savePreview(baseline: Awaited<ReturnType<typeof currentBaseline>> | undefined) {
    if (baseline) {
      const result = await replayOperations(
        {
          docId: "apply-preview-doc",
          baseline,
          dryRun: true,
          responseMode: "compact",
          savePreview: true,
          operations: [
            { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
            {
              type: "add",
              elementType: "circle",
              attributes: { id: "new-dot", cx: 60, cy: 60, r: 4, fill: "#facc15" },
            },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      );
      return result.operationPreview?.previewId as string;
    }

    const result = await previewSvgOperations(
      {
        docId: "apply-preview-doc",
        responseMode: "compact",
        savePreview: true,
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          {
            type: "add",
            elementType: "circle",
            attributes: { id: "new-dot", cx: 60, cy: 60, r: 4, fill: "#facc15" },
          },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    return result.operationPreview?.previewId as string;
  }

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
