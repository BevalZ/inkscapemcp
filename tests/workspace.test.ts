import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { applyOperationsToSvg } from "../src/core/svg-ops.js";
import { createCheckpoint, replaceDocumentSvg } from "../src/tools/document.js";

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
});
