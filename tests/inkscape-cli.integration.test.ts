import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { createSvgDocument } from "../src/core/svg-document.js";

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
});
