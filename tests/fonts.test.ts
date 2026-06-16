import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Workspace } from "../src/adapters/workspace.js";

describe("font import", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-font-"));
    workspace = new Workspace(path.join(root, "workspace"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("copies a local font file into workspace/fonts", async () => {
    const source = path.join(root, "Demo.ttf");
    await writeFile(source, "fake font bytes", "utf8");

    const result = await workspace.importFont(source);

    expect(result.fontPath).toContain(`${path.sep}fonts${path.sep}`);
    await expect(stat(result.fontPath)).resolves.toBeTruthy();
  });

  it("rejects remote font sources", async () => {
    await expect(workspace.importFont("https://example.com/font.ttf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(workspace.importFont("file:///C:/font.ttf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(workspace.importFont("\\\\server\\share\\font.ttf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
