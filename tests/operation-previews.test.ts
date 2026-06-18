import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import {
  listOperationPreviews,
  previewSvgOperations,
  readOperationPreview,
  replayOperations,
} from "../src/tools/document.js";

describe("operation preview artifacts", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-operation-previews-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("preview-artifacts", "Preview Artifacts", baseSvg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("saves preview_svg_operations artifacts without mutating document state", async () => {
    const before = await captureState("preview-artifacts");
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await previewSvgOperations(
      {
        docId: "preview-artifacts",
        responseMode: "full",
        savePreview: true,
        previewLabel: "Body green",
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
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      operationPreview: {
        docId: "preview-artifacts",
        toolName: "preview_svg_operations",
        label: "Body green",
        operationCount: 2,
        summary: { addedElementCount: 1, attributeChangeCount: 1 },
        addedElementIds: ["new-dot"],
        changedElementIds: ["box", "new-dot"],
        svgPath: expect.stringContaining("operation-previews"),
        metadataPath: expect.stringContaining("operation-previews"),
      },
    });
    expect(result.operationPreview?.previewId).toContain("preview-svg-operations-body-green");

    await expectStateUnchanged("preview-artifacts", before);
    await expect(readFile(result.operationPreview?.svgPath as string, "utf8")).resolves.toContain('id="new-dot"');
    await expect(readFile(result.operationPreview?.metadataPath as string, "utf8")).resolves.toContain('"diff"');
  });

  it("lists and reads saved operation previews with optional SVG content", async () => {
    const result = await previewSvgOperations(
      {
        docId: "preview-artifacts",
        responseMode: "compact",
        savePreview: true,
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const previewId = result.operationPreview?.previewId as string;

    const listed = await listOperationPreviews({ docId: "preview-artifacts" }, { workspace, inkscape, autoRefresh: { enabled: false } });
    expect(listed).toMatchObject({
      ok: true,
      previews: [
        {
          previewId,
          toolName: "preview_svg_operations",
          summary: { attributeChangeCount: 1 },
          changedElementIds: ["box"],
        },
      ],
    });
    expect(listed.previews[0]).not.toHaveProperty("diff");
    expect(listed.previews[0]).not.toHaveProperty("svg");

    const withoutSvg = await readOperationPreview(
      { docId: "preview-artifacts", previewId, includeSvg: false },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(withoutSvg).toMatchObject({
      ok: true,
      previewId,
      metadata: { previewId, summary: { attributeChangeCount: 1 } },
      diff: { attributeChanges: [{ elementId: "box", attributeName: "fill", before: "#ef4444", after: "#22c55e" }] },
    });
    expect(withoutSvg).not.toHaveProperty("svg");

    const withSvg = await readOperationPreview(
      { docId: "preview-artifacts", previewId, includeSvg: true },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(withSvg.svg).toContain('fill="#22c55e"');
  });

  it("saves replay dry-run preview artifacts with baseline metadata", async () => {
    const baseline = await currentBaseline("preview-artifacts");
    const before = await captureState("preview-artifacts");

    const result = await replayOperations(
      {
        docId: "preview-artifacts",
        baseline,
        dryRun: true,
        responseMode: "compact",
        savePreview: true,
        previewLabel: "Replay candidate",
        operations: [
          { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
        ],
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({
      ok: true,
      dryRun: true,
      operationPreview: {
        toolName: "replay_operations",
        label: "Replay candidate",
        baseline,
      },
    });
    await expectStateUnchanged("preview-artifacts", before);
  });

  it("does not create preview artifacts when operation generation fails", async () => {
    const before = await captureState("preview-artifacts");

    await expect(
      previewSvgOperations(
        {
          docId: "preview-artifacts",
          responseMode: "compact",
          savePreview: true,
          operations: [
            { type: "update", elementId: "missing", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expectStateUnchanged("preview-artifacts", before);
    await expect(listOptional(workspace.documentPaths("preview-artifacts").operationPreviewsDir)).resolves.toEqual([]);
  });

  it("does not create preview artifacts when replay dry-run baseline is stale", async () => {
    const baseline = await currentBaseline("preview-artifacts");
    await workspace.writeSvgWithSnapshot("preview-artifacts", "advance", (currentSvg) => ({
      svg: currentSvg.replace('fill="#ef4444"', 'fill="#0ea5e9"'),
      result: {},
    }));
    const before = await captureState("preview-artifacts");

    await expect(
      replayOperations(
        {
          docId: "preview-artifacts",
          baseline,
          dryRun: true,
          responseMode: "compact",
          savePreview: true,
          operations: [
            { type: "update", elementId: "box", setAttributes: { fill: "#22c55e" }, removeAttributes: [] },
          ],
        },
        { workspace, inkscape, autoRefresh: { enabled: true } },
      ),
    ).rejects.toMatchObject({ code: "SYNC_CONFLICT" });

    await expectStateUnchanged("preview-artifacts", before);
    await expect(listOptional(workspace.documentPaths("preview-artifacts").operationPreviewsDir)).resolves.toEqual([]);
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
