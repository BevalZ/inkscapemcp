import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { proposeIdRepairsFromSvg } from "../src/core/id-repair.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";
import { createCheckpoint, proposeIdRepairs } from "../src/tools/document.js";
import { connectInkscapeWindow } from "../src/tools/sync.js";

describe("id repair proposals", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-id-repair-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("repair-doc", "Repair", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("proposes strong id repairs for renamed elements", () => {
    const result = proposeIdRepairsFromSvg({
      baselineSvg: baseSvg(),
      currentSvg: baseSvg().replace('id="body"', 'id="renamed-body"'),
      minConfidence: 70,
      generatedAt: "2026-06-19T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      generatedAt: "2026-06-19T00:00:00.000Z",
      summary: {
        missingBaselineIdCount: 1,
        newCurrentIdCount: 1,
        acceptedProposalCount: 1,
        rejectedProposalCount: 0,
      },
      proposals: [
        {
          baselineElementId: "body",
          proposedElementId: "renamed-body",
          confidence: expect.any(Number),
          reasons: expect.arrayContaining(["same_type", "same_geometry", "same_attributes", "same_parent_chain"]),
        },
      ],
    });
  });

  it("rejects matches below the configured confidence threshold", () => {
    const result = proposeIdRepairsFromSvg({
      baselineSvg: baseSvg(),
      currentSvg: baseSvg().replace('id="body"', 'id="renamed-body"'),
      minConfidence: 200,
    });

    expect(result).toMatchObject({
      summary: {
        acceptedProposalCount: 0,
        rejectedProposalCount: 1,
        lowConfidenceProposalCount: 1,
      },
      rejected: [
        {
          baselineElementId: "body",
          rejectReason: "low_confidence",
          topScore: expect.any(Number),
        },
      ],
    });
  });

  it("rejects tied top candidates as ambiguous", () => {
    const result = proposeIdRepairsFromSvg({
      baselineSvg: ambiguousBaselineSvg(),
      currentSvg: ambiguousSvg(),
      minConfidence: 70,
    });

    expect(result).toMatchObject({
      summary: {
        acceptedProposalCount: 0,
        rejectedProposalCount: 1,
        ambiguousProposalCount: 1,
      },
      rejected: [
        {
          baselineElementId: "body",
          rejectReason: "ambiguous_top_score",
          candidateCount: 2,
        },
      ],
    });
  });

  it("returns compact proposals without mutating workspace state", async () => {
    const checkpoint = await createCheckpoint(
      { docId: "repair-doc", label: "before rename" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("repair-doc", "rename", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="renamed-body"'),
      result: {},
    }));
    const before = await captureState("repair-doc");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await proposeIdRepairs(
      {
        docId: "repair-doc",
        baselineSnapshotId: checkpoint.snapshotId,
        minConfidence: 70,
        includeRejected: false,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      baselineSnapshot: { snapshotId: checkpoint.snapshotId },
      summary: { acceptedProposalCount: 1, rejectedProposalCount: 0 },
      proposals: [
        {
          baselineElementId: "body",
          proposedElementId: "renamed-body",
          confidence: expect.any(Number),
        },
      ],
    });
    expect(result.proposals?.[0]).not.toHaveProperty("fingerprint");
    expect(result.proposals?.[0]).not.toHaveProperty("candidates");
    expect(result).not.toHaveProperty("rejected");
    await expectStateUnchanged("repair-doc", before);
  });

  it("returns rejected candidates only when requested and full mode includes fingerprints", async () => {
    const checkpoint = await createCheckpoint(
      { docId: "repair-doc", label: "before rename" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("repair-doc", "rename", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="renamed-body"'),
      result: {},
    }));

    const hidden = await proposeIdRepairs(
      {
        docId: "repair-doc",
        baselineSnapshotId: checkpoint.snapshotId,
        minConfidence: 200,
        includeRejected: false,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(hidden).not.toHaveProperty("rejected");

    const full = await proposeIdRepairs(
      {
        docId: "repair-doc",
        baselineSnapshotId: checkpoint.snapshotId,
        minConfidence: 200,
        includeRejected: true,
        responseMode: "full",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(full).toMatchObject({
      ok: true,
      responseMode: "full",
      rejected: [
        {
          baselineElementId: "body",
          rejectReason: "low_confidence",
          baselineFingerprint: { elementId: "body", type: "path" },
          candidates: [
            {
              elementId: "renamed-body",
              fingerprint: { elementId: "renamed-body", type: "path" },
            },
          ],
        },
      ],
    });
  });

  it("rejects unsafe or missing snapshot ids without mutating workspace state", async () => {
    const before = await captureState("repair-doc");

    await expect(
      proposeIdRepairs(
        {
          docId: "repair-doc",
          baselineSnapshotId: "../escape",
          minConfidence: 70,
          includeRejected: false,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expect(
      proposeIdRepairs(
        {
          docId: "repair-doc",
          baselineSnapshotId: "missing",
          minConfidence: 70,
          includeRejected: false,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });

    await expectStateUnchanged("repair-doc", before);
  });

  it("pre-pulls bidirectional GUI state before comparing id repairs", async () => {
    const checkpoint = await createCheckpoint(
      { docId: "repair-doc", label: "before gui rename" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const connected = await connectInkscapeWindow(
      { docId: "repair-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg().replace('id="body"', 'id="gui-body"'), {
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

    const result = await proposeIdRepairs(
      {
        docId: "repair-doc",
        baselineSnapshotId: checkpoint.snapshotId,
        minConfidence: 70,
        includeRejected: false,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      guiPrePull: { wrote: true },
      proposals: [{ baselineElementId: "body", proposedElementId: "gui-body" }],
    });
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe((await workspace.readMetadata("repair-doc")).revision);
    await expect(workspace.readSvg("repair-doc")).resolves.toContain('id="gui-body"');
  });

  async function captureState(docId: string) {
    const paths = workspace.documentPaths(docId);
    return {
      svg: await workspace.readSvg(docId),
      metadata: await workspace.readMetadata(docId),
      history: await workspace.listHistory(docId),
      operationLog: await readOptional(paths.operationsLog),
      operationDiffEntries: await listOptional(paths.operationDiffsDir),
      operationPreviewEntries: await listOptional(paths.operationPreviewsDir),
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
    await expect(listOptional(paths.operationPreviewsDir)).resolves.toEqual(before.operationPreviewEntries);
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
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <g id="fish">
    <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
  </g>
</svg>`;
}

function ambiguousSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <g>
    <path id="renamed-body-a" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
  </g>
  <g>
    <path id="renamed-body-b" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
  </g>
</svg>`;
}

function ambiguousBaselineSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
</svg>`;
}
