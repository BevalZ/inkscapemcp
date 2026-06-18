import { deflateSync } from "node:zlib";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { VectorizerCli } from "../src/adapters/vectorizer.js";
import { Workspace } from "../src/adapters/workspace.js";
import { vectorizeBitmap } from "../src/tools/vectorize.js";

describe("vectorize_bitmap", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;
  let vectorizer: VectorizerCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-vectorize-"));
    workspace = new Workspace(path.join(root, "workspace"));
    inkscape = new InkscapeCli();
    vectorizer = new VectorizerCli();
    await workspace.createDocument("fish", "Fish", svg());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("writes a vectorized artifact and reports PNG quality metrics", async () => {
    const sourcePath = path.join(root, "source.png");
    const png = makePng(1, 1, [255, 0, 0, 255]);
    await writeFile(sourcePath, png);
    vi.spyOn(vectorizer, "vectorize").mockImplementation(async (options) => {
      await writeFile(options.outputPath, svg(), "utf8");
      return { binaryPath: "vtracer", engine: options.engine, stdout: "", stderr: "", exitCode: 0 };
    });
    vi.spyOn(inkscape, "renderPng").mockImplementation(async (_input, outputPath) => {
      await writeFile(outputPath, png);
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await vectorizeBitmap(
      { docId: "fish", sourcePath, engine: "vtracer", filename: "fish-vector.svg", runQualityCheck: true },
      { workspace, inkscape, vectorizer, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      outputPath: expect.stringContaining("fish-vector.svg"),
      quality: {
        checked: true,
        metrics: {
          comparable: true,
          meanAbsoluteError: 0,
          exactPixelMatchRatio: 1,
        },
      },
    });
    await expect(readFile(result.outputPath, "utf8")).resolves.toContain("<svg");
  });

  it("rejects unsupported bitmap source paths", async () => {
    await expect(
      vectorizeBitmap(
        { docId: "fish", sourcePath: "https://example.com/source.png", engine: "vtracer" },
        { workspace, inkscape, vectorizer, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

function svg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="10px" height="10px" viewBox="0 0 10 10">
  <rect id="box" width="10" height="10" fill="#ff0000"/>
</svg>`;
}

function makePng(width: number, height: number, rgba: number[]): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.from([0, ...rgba]);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, data, Buffer.alloc(4)]);
}
