import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { applyOperationsToSvg } from "../src/core/svg-ops.js";

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
});
