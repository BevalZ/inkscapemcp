import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { applyOperationsToSvg } from "../src/core/svg-ops.js";
import { replaceDocumentSvg } from "../src/tools/document.js";

describe("workspace", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-test-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
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
});
