import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { exportDocumentExternal } from "../src/tools/preview.js";
import { importSvgDocument } from "../src/tools/document.js";

describe("controlled SVG import and external export", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-import-export-"));
    workspace = new Workspace(path.join(root, "workspace"));
    inkscape = new InkscapeCli();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("imports a local SVG as a workspace copy", async () => {
    const source = path.join(root, "source.svg");
    await writeFile(source, svg("#facc15"), "utf8");

    const result = await importSvgDocument(
      { sourcePath: source, docId: "imported-fish", title: "Imported fish" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      docId: "imported-fish",
      warnings: [expect.objectContaining({ code: "WORKSPACE_COPY" })],
    });
    await expect(readFile(result.currentSvgPath, "utf8")).resolves.toContain("#facc15");
    expect(result.currentSvgPath).not.toBe(source);
  });

  it("rejects remote or non-SVG imports", async () => {
    await expect(workspace.importSvgDocument("https://example.com/file.svg", "remote", "Remote")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const textFile = path.join(root, "file.txt");
    await writeFile(textFile, "not svg", "utf8");
    await expect(workspace.importSvgDocument(textFile, "text", "Text")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("exports to an explicit local output directory", async () => {
    await workspace.createDocument("fish", "Fish", svg("#22c55e"));
    const outputDir = path.join(root, "external-output");
    vi.spyOn(inkscape, "exportDocument").mockImplementation(async (inputPath, outputPath) => {
      await writeFile(outputPath, await readFile(inputPath, "utf8"), "utf8");
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await exportDocumentExternal(
      {
        docId: "fish",
        format: "svg",
        filename: "fish exported.svg",
        outputDirectory: outputDir,
        textToPath: false,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({ ok: true, exportMode: "external" });
    expect(result.outputPath).toBe(path.join(outputDir, "fish-exported.svg"));
    await expect(stat(result.outputPath)).resolves.toMatchObject({ size: expect.any(Number) });
  });
});

function svg(fill: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="${fill}"/>
</svg>`;
}
