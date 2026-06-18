import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { diffDocumentSnapshots } from "../src/tools/document.js";

describe("diff_document_snapshots", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-snapshot-diff-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("diff-doc", "Diff", baseSvg());
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns compact snapshot diffs without full change arrays or state mutation", async () => {
    const before = await writeSnapshot("capture_before_attribute", (svg) => svg);
    await writeSnapshot("attribute", (svg) => svg.replace('fill="#ef4444"', 'fill="#22c55e"'));
    const after = await writeSnapshot("capture_after_attribute", (svg) => svg);
    const metadataBefore = await workspace.readMetadata("diff-doc");
    const currentBefore = await workspace.readSvg("diff-doc");
    const historyBefore = await workspace.listHistory("diff-doc");
    const operationLogBefore = await readOptional(workspace.documentPaths("diff-doc").operationsLog);

    const result = await diffDocumentSnapshots(
      {
        docId: "diff-doc",
        fromSnapshotId: currentSnapshotId(before.snapshotPath),
        toSnapshotId: currentSnapshotId(after.snapshotPath),
        responseMode: "compact",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      summary: {
        attributeChangeCount: 1,
        textChangeCount: 0,
        structureChangeCount: 0,
      },
      changedElementIds: ["box"],
      addedElementIds: [],
      removedElementIds: [],
    });
    expect(result).not.toHaveProperty("diff");
    await expect(workspace.readSvg("diff-doc")).resolves.toBe(currentBefore);
    await expect(workspace.readMetadata("diff-doc")).resolves.toMatchObject({
      revision: metadataBefore.revision,
      contentHash: metadataBefore.contentHash,
      lastWriter: metadataBefore.lastWriter,
    });
    await expect(workspace.listHistory("diff-doc")).resolves.toEqual(historyBefore);
    await expect(readOptional(workspace.documentPaths("diff-doc").operationsLog)).resolves.toBe(operationLogBefore);
  });

  it("returns full attribute, text, structure, add, remove, and id-change diffs", async () => {
    const before = await writeSnapshot("capture_before_complex", (svg) => svg);
    await workspace.writeSvgWithSnapshot("diff-doc", "after_complex", () => ({
      svg: complexSvg(),
      result: {},
    }));
    const after = await writeSnapshot("capture_after_complex", (svg) => svg);

    const result = await diffDocumentSnapshots(
      {
        docId: "diff-doc",
        fromSnapshotId: currentSnapshotId(before.snapshotPath),
        toSnapshotId: currentSnapshotId(after.snapshotPath),
        responseMode: "full",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      summary: {
        addedElementCount: 2,
        removedElementCount: 2,
        changedElementCount: 9,
        attributeChangeCount: 1,
        textChangeCount: 1,
        structureChangeCount: 3,
      },
      addedElementIds: ["new-dot", "renamed-id"],
      removedElementIds: ["id-change", "remove-me"],
      changedElementIds: ["box", "id-change", "label", "move-me", "new-dot", "order-a", "order-b", "remove-me", "renamed-id"],
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
        structureChanges: expect.arrayContaining([
          expect.objectContaining({ elementId: "move-me", beforeParentId: "root-group", afterParentId: undefined }),
          expect.objectContaining({ elementId: "order-a", beforeParentId: "root-group", afterParentId: "root-group" }),
          expect.objectContaining({ elementId: "order-b", beforeParentId: "root-group", afterParentId: "root-group" }),
        ]),
      },
    });
  });

  it("rejects missing and unsafe snapshot ids", async () => {
    await writeSnapshot("one", (svg) => svg.replace('fill="#ef4444"', 'fill="#22c55e"'));
    const [snapshot] = await workspace.listHistory("diff-doc");
    expect(snapshot?.snapshotId).toBeTruthy();

    await expect(
      diffDocumentSnapshots(
        {
          docId: "diff-doc",
          fromSnapshotId: snapshot?.snapshotId as string,
          toSnapshotId: "missing-snapshot",
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });

    await expect(
      diffDocumentSnapshots(
        {
          docId: "diff-doc",
          fromSnapshotId: "../escape",
          toSnapshotId: snapshot?.snapshotId as string,
          responseMode: "compact",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  async function writeSnapshot(toolName: string, edit: (svg: string) => string) {
    return workspace.writeSvgWithSnapshot("diff-doc", toolName, (currentSvg) => ({
      svg: edit(currentSvg),
      result: {},
    }));
  }
});

function currentSnapshotId(snapshotPath: string): string {
  return path.basename(snapshotPath, ".svg");
}

async function readOptional(filePath: string): Promise<string | undefined> {
  const exists = await stat(filePath).then(() => true, () => false);
  return exists ? readFile(filePath, "utf8") : undefined;
}

function baseSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <g id="root-group">
    <rect id="box" x="1" y="1" width="10" height="10" fill="#ef4444"/>
    <text id="label" x="20" y="20">hello</text>
    <circle id="order-a" cx="10" cy="60" r="4"/>
    <circle id="order-b" cx="20" cy="60" r="4"/>
    <circle id="move-me" cx="30" cy="30" r="4"/>
    <circle id="remove-me" cx="40" cy="40" r="4"/>
    <circle id="id-change" cx="50" cy="50" r="4"/>
  </g>
</svg>`;
}

function complexSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="100px" viewBox="0 0 100 100">
  <g id="root-group">
    <rect id="box" x="1" y="1" width="10" height="10" fill="#22c55e"/>
    <text id="label" x="20" y="20">updated</text>
    <circle id="order-b" cx="20" cy="60" r="4"/>
    <circle id="order-a" cx="10" cy="60" r="4"/>
    <circle id="renamed-id" cx="50" cy="50" r="4"/>
    <circle id="new-dot" cx="60" cy="60" r="4"/>
  </g>
  <circle id="move-me" cx="30" cy="30" r="4"/>
</svg>`;
}
