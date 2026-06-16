import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { createToolContext } from "../src/tools/context.js";
import { addElement } from "../src/tools/elements.js";
import { runPathGeometry } from "../src/tools/geometry.js";
import { createDocument } from "../src/tools/document.js";

describe("Inkscape CLI integration", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-inkscape-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("discovers Inkscape or reports a clear unavailable path", async () => {
    const cli = new InkscapeCli();
    const binary = await cli.discover();

    if (!binary) {
      await expect(cli.requireBinary()).rejects.toMatchObject({ code: "INKSCAPE_UNAVAILABLE" });
      return;
    }

    await expect(stat(binary)).resolves.toBeTruthy();
  });

  it("renders a PNG preview when Inkscape is available", async () => {
    const cli = new InkscapeCli();
    const binary = await cli.discover();
    if (!binary) {
      console.warn("Skipping PNG preview integration test: Inkscape binary not found.");
      return;
    }

    const svgPath = path.join(root, "input.svg");
    const pngPath = path.join(root, "preview.png");
    await writeFile(svgPath, createSvgDocument({ title: "Preview", width: 64, height: 64, unit: "px" }), "utf8");

    await cli.renderPng(svgPath, pngPath, { timeoutMs: 30_000 });
    const info = await stat(pngPath);
    expect(info.size).toBeGreaterThan(0);
  });

  it("runs path union through the Phase 2 geometry tool when Inkscape is available", async () => {
    const cli = new InkscapeCli();
    const binary = await cli.discover();
    if (!binary) {
      console.warn("Skipping geometry integration test: Inkscape binary not found.");
      return;
    }

    const previousWorkspace = process.env.INKSMCP_WORKSPACE;
    process.env.INKSMCP_WORKSPACE = root;
    try {
      const ctx = createToolContext();
      await createDocument({ docId: "geom-doc", title: "Geometry", width: 100, height: 100, unit: "px" }, ctx);
      await addElement(
        {
          docId: "geom-doc",
          type: "rect",
          attributes: { id: "a", x: 10, y: 10, width: 40, height: 40, fill: "#ff0000" },
        },
        ctx,
      );
      await addElement(
        {
          docId: "geom-doc",
          type: "rect",
          attributes: { id: "b", x: 30, y: 30, width: 40, height: 40, fill: "#0000ff" },
        },
        ctx,
      );

      const result = await runPathGeometry(
        "path_union",
        { docId: "geom-doc", elementIds: ["a", "b"], resultId: "merged", autoConvertToPath: true },
        ctx,
      );

      expect(result.resultIds).toEqual(["merged"]);
      await expect(stat(ctx.workspace.documentPaths("geom-doc").currentSvg)).resolves.toBeTruthy();
    } finally {
      if (previousWorkspace === undefined) {
        delete process.env.INKSMCP_WORKSPACE;
      } else {
        process.env.INKSMCP_WORKSPACE = previousWorkspace;
      }
    }
  });
});
