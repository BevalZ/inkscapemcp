import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { listArtifactResources, readArtifactResource } from "../src/tools/resources.js";

describe("artifact resources", () => {
  let root: string;
  let workspace: Workspace;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-resources-"));
    workspace = new Workspace(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("lists and reads current SVG and preview PNG resources", async () => {
    await workspace.createDocument(
      "resource-doc",
      "Resource doc",
      createSvgDocument({ title: "Resource doc", width: 20, height: 20, unit: "px" }),
    );
    await writeFile(workspace.previewPath("resource-doc"), Buffer.from([1, 2, 3]));

    const listed = await listArtifactResources(workspace);
    expect(listed.resources.map((resource) => resource.uri)).toContain("inksmcp://documents/resource-doc/current.svg");
    expect(listed.resources.map((resource) => resource.uri)).toContain("inksmcp://documents/resource-doc/preview.png");

    const svg = await readArtifactResource(new URL("inksmcp://documents/resource-doc/current.svg"), workspace);
    const png = await readArtifactResource(new URL("inksmcp://documents/resource-doc/preview.png"), workspace);

    expect(svg.contents[0]).toMatchObject({ mimeType: "image/svg+xml" });
    expect(png.contents[0]).toMatchObject({ mimeType: "image/png" });
  });
});
