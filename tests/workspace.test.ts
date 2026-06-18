import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { applyOperationsToSvg } from "../src/core/svg-ops.js";
import { createCheckpoint, recoverDocument, replaceDocumentSvg } from "../src/tools/document.js";

describe("workspace", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-test-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("rejects paths outside the workspace", () => {
    expect(() => workspace.resolveWithinWorkspace("..", "outside.svg")).toThrow("escapes");
  });

  it("keeps current.svg unchanged when an atomic batch fails", async () => {
    const svg = createSvgDocument({ title: "Atomic", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("atomic-doc", "Atomic", svg);
    const before = await workspace.readSvg("atomic-doc");

    await expect(
      workspace.writeSvgWithSnapshot("atomic-doc", "apply_svg_operations", (currentSvg) => {
        const result = applyOperationsToSvg(currentSvg, [
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
        ]);
        return { svg: result.svg, result: result.result };
      }),
    ).rejects.toThrow("not found");

    await expect(readFile(workspace.documentPaths("atomic-doc").currentSvg, "utf8")).resolves.toBe(before);
  });

  it("requires explicit confirmation before full document replacement", async () => {
    const svg = createSvgDocument({ title: "Confirm", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("confirm-doc", "Confirm", svg);
    const before = await workspace.readSvg("confirm-doc");

    await expect(
      replaceDocumentSvg(
        {
          docId: "confirm-doc",
          svg: createSvgDocument({ title: "Replacement", width: 200, height: 200, unit: "px" }),
          confirmFullDocumentReplacement: false,
        },
        { workspace, inkscape: new InkscapeCli() },
      ),
    ).rejects.toThrow("replaces the whole SVG object tree");

    await expect(readFile(workspace.documentPaths("confirm-doc").currentSvg, "utf8")).resolves.toBe(before);
  });

  it("marks confirmed full document replacement as a full redraw", async () => {
    const svg = createSvgDocument({ title: "Confirm", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("confirmed-replace-doc", "Confirm", svg);

    const result = await replaceDocumentSvg(
      {
        docId: "confirmed-replace-doc",
        svg: createSvgDocument({ title: "Replacement", width: 200, height: 200, unit: "px" }),
        confirmFullDocumentReplacement: true,
      },
      { workspace, inkscape: new InkscapeCli() },
    );

    expect(result).toMatchObject({
      ok: true,
      editMode: "full_document_replacement",
      document: { width: "200px", height: "200px" },
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "FULL_DOCUMENT_REPLACEMENT",
      }),
    );
  });

  it("creates an explicit checkpoint without changing current SVG or refreshing Inkscape", async () => {
    const svg = createSvgDocument({ title: "Checkpoint", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("checkpoint-doc", "Checkpoint", svg);
    const beforeSvg = await workspace.readSvg("checkpoint-doc");
    const beforeMetadata = await workspace.readMetadata("checkpoint-doc");
    const inkscape = new InkscapeCli();
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await createCheckpoint(
      {
        docId: "checkpoint-doc",
        label: "Before risky edit",
        description: "Known-good state before path surgery",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      docId: "checkpoint-doc",
      label: "Before risky edit",
      description: "Known-good state before path surgery",
      snapshotPath: expect.stringContaining("create_checkpoint-before-risky-edit"),
      document: { docId: "checkpoint-doc", title: "Checkpoint", width: "100px", height: "100px" },
    });
    expect(result.checkpointId).toBe(result.snapshotId);

    await expect(workspace.readSvg("checkpoint-doc")).resolves.toBe(beforeSvg);
    await expect(workspace.readMetadata("checkpoint-doc")).resolves.toMatchObject({
      revision: beforeMetadata.revision,
      contentHash: beforeMetadata.contentHash,
      lastWriter: beforeMetadata.lastWriter,
    });

    const history = await workspace.listHistory("checkpoint-doc");
    expect(history).toEqual([
      expect.objectContaining({
        snapshotId: result.snapshotId,
        path: result.snapshotPath,
      }),
    ]);
    await expect(readFile(result.snapshotPath, "utf8")).resolves.toBe(beforeSvg);

    const log = await readFile(workspace.documentPaths("checkpoint-doc").operationsLog, "utf8");
    expect(log).toContain('"toolName":"create_checkpoint"');
    expect(log).toContain('"label":"Before risky edit"');
    expect(log).toContain('"hasDescription":true');
    expect(log).not.toContain(beforeSvg);
  });

  it("recovers from an explicit snapshot after snapshotting current state and refreshing the GUI", async () => {
    const svg = createSvgDocument({ title: "Recover", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("recover-doc", "Recover", svg);
    const checkpoint = await createCheckpoint(
      { docId: "recover-doc", label: "Known good" },
      { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("recover-doc", "break_doc", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<rect id="bad-edit" x="1" y="1" width="3" height="3"/></svg>'),
      result: {},
    }));
    const brokenSvg = await workspace.readSvg("recover-doc");
    expect(brokenSvg).toContain("bad-edit");
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await recoverDocument(
      { docId: "recover-doc", snapshotId: checkpoint.snapshotId, confirmDiscardGuiState: false },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 4321 } },
    );

    expect(companion).toHaveBeenCalledWith({
      docId: "recover-doc",
      workspaceRoot: workspace.paths.root,
      timeoutMs: 4321,
    });
    expect(result).toMatchObject({
      ok: true,
      docId: "recover-doc",
      recoveredFromSnapshotId: checkpoint.snapshotId,
      preRecoverySnapshotPath: expect.stringContaining("recover_document"),
      restoredPath: checkpoint.snapshotPath,
      currentSvgPath: workspace.documentPaths("recover-doc").currentSvg,
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
    await expect(workspace.readSvg("recover-doc")).resolves.not.toContain("bad-edit");
    await expect(readFile(result.preRecoverySnapshotPath, "utf8")).resolves.toBe(brokenSvg);

    const history = await workspace.listHistory("recover-doc");
    expect(history.map((snapshot) => snapshot.snapshotId)).toContain(checkpoint.snapshotId);
    expect(history.some((snapshot) => snapshot.path === result.preRecoverySnapshotPath)).toBe(true);

    const log = await readFile(workspace.documentPaths("recover-doc").operationsLog, "utf8");
    expect(log).toContain('"toolName":"recover_document"');
    expect(log).toContain(`"snapshotId":"${checkpoint.snapshotId}"`);
    expect(log).not.toContain(brokenSvg);
  });

  it("recovers from the latest history snapshot by strategy", async () => {
    const svg = createSvgDocument({ title: "Recover latest", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("recover-latest-doc", "Recover latest", svg);
    await createCheckpoint(
      { docId: "recover-latest-doc", label: "First good" },
      { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
    const secondSvg = svg.replace("</svg>", '<rect id="latest-good" x="2" y="2" width="5" height="5"/></svg>');
    await replaceDocumentSvg(
      { docId: "recover-latest-doc", svg: secondSvg, confirmFullDocumentReplacement: true },
      { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
    );
    await createCheckpoint(
      { docId: "recover-latest-doc", label: "Latest good" },
      { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("recover-latest-doc", "break_doc", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="bad-latest-edit" cx="5" cy="5" r="3"/></svg>'),
      result: {},
    }));
    const brokenSvg = await workspace.readSvg("recover-latest-doc");
    expect(brokenSvg).toContain("latest-good");
    expect(brokenSvg).toContain("bad-latest-edit");
    const historyBeforeRecovery = await workspace.listHistory("recover-latest-doc");
    const latestSnapshotBeforeRecovery = historyBeforeRecovery.reduce((latest, snapshot) => {
      const byCreatedAt = snapshot.createdAt.localeCompare(latest.createdAt);
      if (byCreatedAt > 0) return snapshot;
      if (byCreatedAt === 0 && snapshot.snapshotId.localeCompare(latest.snapshotId) > 0) return snapshot;
      return latest;
    });
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await recoverDocument(
      { docId: "recover-latest-doc", strategy: "last_snapshot", confirmDiscardGuiState: false },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(companion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      docId: "recover-latest-doc",
      strategy: "last_snapshot",
      recoveredFromSnapshotId: latestSnapshotBeforeRecovery.snapshotId,
      preRecoverySnapshotPath: expect.stringContaining("recover_document"),
      restoredPath: latestSnapshotBeforeRecovery.path,
    });
    await expect(workspace.readSvg("recover-latest-doc")).resolves.toContain("latest-good");
    await expect(workspace.readSvg("recover-latest-doc")).resolves.not.toContain("bad-latest-edit");
    await expect(readFile(result.preRecoverySnapshotPath, "utf8")).resolves.toBe(brokenSvg);

    const log = await readFile(workspace.documentPaths("recover-latest-doc").operationsLog, "utf8");
    expect(log).toContain('"toolName":"recover_document"');
    expect(log).toContain('"strategy":"last_snapshot"');
    expect(log).toContain(`"snapshotId":"${latestSnapshotBeforeRecovery.snapshotId}"`);
  });

  it("rejects last-snapshot recovery when history is empty without side effects", async () => {
    const svg = createSvgDocument({ title: "Recover empty", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("recover-empty-doc", "Recover empty", svg);
    const before = await workspace.readSvg("recover-empty-doc");
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    await expect(
      recoverDocument(
        { docId: "recover-empty-doc", strategy: "last_snapshot", confirmDiscardGuiState: false },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });

    expect(companion).not.toHaveBeenCalled();
    await expect(workspace.readSvg("recover-empty-doc")).resolves.toBe(before);
    await expect(workspace.listHistory("recover-empty-doc")).resolves.toEqual([]);
    await expect(readFile(workspace.documentPaths("recover-empty-doc").operationsLog, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects missing and unsafe recovery snapshots without changing current SVG", async () => {
    const svg = createSvgDocument({ title: "Recover rejects", width: 100, height: 100, unit: "px" });
    await workspace.createDocument("recover-reject-doc", "Recover rejects", svg);
    const before = await workspace.readSvg("recover-reject-doc");

    await expect(
      recoverDocument(
        { docId: "recover-reject-doc", snapshotId: "../escape", confirmDiscardGuiState: false },
        { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(workspace.readSvg("recover-reject-doc")).resolves.toBe(before);

    await expect(
      recoverDocument(
        { docId: "recover-reject-doc", snapshotId: "missing-snapshot", confirmDiscardGuiState: false },
        { workspace, inkscape: new InkscapeCli(), autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });
    await expect(workspace.readSvg("recover-reject-doc")).resolves.toBe(before);
  });
});
