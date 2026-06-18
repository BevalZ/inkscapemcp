import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { applyIdRepairsToSvg, proposeIdRepairsFromSvg } from "../src/core/id-repair.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";
import { applyIdRepairs, createCheckpoint, proposeIdRepairs } from "../src/tools/document.js";
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

  it("applies id repairs to SVG and rewrites internal references", () => {
    const result = applyIdRepairsToSvg({
      currentSvg: renamedReferencedSvg(),
      repairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
    });

    expect(result).toMatchObject({
      appliedRepairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
      repairedElementIds: ["body"],
    });
    expect(result.rewrittenReferenceCount).toBeGreaterThanOrEqual(5);
    expect(result.svg).toContain('id="body"');
    expect(result.svg).not.toContain("renamed-body");
    expect(result.svg).toContain('href="#body"');
    expect(result.svg).toContain('xlink:href="#body"');
    expect(result.svg).toContain("url(#body)");
    expect(result.svg).toContain('aria-labelledby="body label"');
  });

  it("rejects missing apply confirmation before pre-pulling or writing", async () => {
    await connectInkscapeWindow(
      { docId: "repair-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const push = vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension");
    const before = await captureState("repair-doc");

    await expect(
      applyIdRepairs(
        {
          docId: "repair-doc",
          repairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
          confirmApplyRepairs: false,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    expect(push).not.toHaveBeenCalled();
    await expectStateUnchanged("repair-doc", before);
  });

  it("rejects unsafe, duplicate, missing, self, and conflicting id repairs without writing", async () => {
    const cases = [
      {
        name: "metadata id",
        repairs: [{ fromElementId: "inksmcp-sync-metadata", toElementId: "body" }],
        code: "INVALID_INPUT",
      },
      {
        name: "duplicate target",
        repairs: [
          { fromElementId: "restored", toElementId: "body" },
          { fromElementId: "restored", toElementId: "fish" },
        ],
        code: "INVALID_INPUT",
      },
      {
        name: "duplicate current",
        repairs: [
          { fromElementId: "restored-a", toElementId: "body" },
          { fromElementId: "restored-b", toElementId: "body" },
        ],
        code: "INVALID_INPUT",
      },
      {
        name: "self repair",
        repairs: [{ fromElementId: "body", toElementId: "body" }],
        code: "INVALID_INPUT",
      },
      {
        name: "missing current id",
        repairs: [{ fromElementId: "restored", toElementId: "missing-body" }],
        code: "INVALID_INPUT",
      },
      {
        name: "target conflict",
        repairs: [{ fromElementId: "fish", toElementId: "body" }],
        code: "ID_CONFLICT",
      },
    ];

    for (const testCase of cases) {
      const before = await captureState("repair-doc");
      await expect(
        applyIdRepairs(
          {
            docId: "repair-doc",
            repairs: testCase.repairs,
            confirmApplyRepairs: true,
            responseMode: "compact",
          },
          { workspace, inkscape, autoRefresh: { enabled: false } },
        ),
      ).rejects.toMatchObject({ code: testCase.code });
      await expectStateUnchanged("repair-doc", before);
    }
  });

  it("applies confirmed id repairs with snapshot, operation diff, log, and structural refresh", async () => {
    await workspace.createDocument("apply-repair-doc", "Apply Repair", renamedReferencedSvg());
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await applyIdRepairs(
      {
        docId: "apply-repair-doc",
        repairs: [
          {
            fromElementId: "body",
            toElementId: "renamed-body",
            confidence: 120,
            reasons: ["same_type"],
          },
        ],
        confirmApplyRepairs: true,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 1357 } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledWith({
      docId: "apply-repair-doc",
      workspaceRoot: workspace.paths.root,
      timeoutMs: 1357,
    });
    expect(result).toMatchObject({
      ok: true,
      docId: "apply-repair-doc",
      responseMode: "compact",
      applied: true,
      repairCount: 1,
      appliedRepairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
      repairedElementIds: ["body"],
      summary: { addedElementCount: 1, removedElementCount: 1 },
      addedElementIds: ["body"],
      removedElementIds: ["renamed-body"],
      snapshotPath: expect.stringContaining("apply_id_repairs"),
      currentSvgPath: workspace.documentPaths("apply-repair-doc").currentSvg,
      operationDiff: {
        path: expect.stringContaining("operation-diffs"),
        summary: { addedElementCount: 1, removedElementCount: 1 },
      },
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
    expect(result).not.toHaveProperty("diff");
    expect(result.rewrittenReferenceCount).toBeGreaterThanOrEqual(5);
    await expect(workspace.readSvg("apply-repair-doc")).resolves.toContain('id="body"');
    await expect(workspace.readSvg("apply-repair-doc")).resolves.not.toContain("renamed-body");
    await expect(workspace.listHistory("apply-repair-doc")).resolves.toHaveLength(1);
    await expect(readFile(workspace.documentPaths("apply-repair-doc").operationsLog, "utf8")).resolves.toContain(
      '"toolName":"apply_id_repairs"',
    );
    await expect(readFile(result.operationDiff?.path as string, "utf8")).resolves.toContain('"attributeChanges"');
  });

  it("returns full structured diffs when applying id repairs in full mode", async () => {
    await workspace.createDocument("apply-repair-full-doc", "Apply Repair Full", renamedReferencedSvg());

    const result = await applyIdRepairs(
      {
        docId: "apply-repair-full-doc",
        repairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
        confirmApplyRepairs: true,
        responseMode: "full",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      diff: {
        addedElementIds: ["body"],
        removedElementIds: ["renamed-body"],
        attributeChanges: expect.arrayContaining([
          expect.objectContaining({ elementId: "fish", attributeName: "clip-path", after: "url(#body)" }),
          expect.objectContaining({ elementId: "body-copy", attributeName: "href", after: "#body" }),
        ]),
      },
    });
  });

  it("pre-pulls bidirectional GUI state before applying id repairs", async () => {
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

    const result = await applyIdRepairs(
      {
        docId: "repair-doc",
        repairs: [{ fromElementId: "body", toElementId: "gui-body" }],
        confirmApplyRepairs: true,
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      appliedRepairs: [{ fromElementId: "body", toElementId: "gui-body" }],
    });
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe((await workspace.readMetadata("repair-doc")).revision - 1);
    await expect(workspace.readSvg("repair-doc")).resolves.toContain('id="body"');
    await expect(workspace.readSvg("repair-doc")).resolves.not.toContain('id="gui-body"');
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

function renamedReferencedSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100px" height="60px" viewBox="0 0 100 60">
  <defs>
    <clipPath id="clipper"><use id="clip-use" href="#renamed-body"/></clipPath>
  </defs>
  <g id="fish" clip-path="url(#renamed-body)">
    <path id="renamed-body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
    <path id="shadow" d="M20 32 L80 32" style="clip-path:url('#renamed-body')" aria-labelledby="renamed-body label"/>
    <text id="label" x="10" y="55">fish</text>
    <use id="body-copy" href="#renamed-body" xlink:href="#renamed-body"/>
  </g>
</svg>`;
}
