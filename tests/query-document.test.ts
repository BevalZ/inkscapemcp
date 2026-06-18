import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { fingerprintSvgElements } from "../src/core/semantic-fingerprint.js";
import { queryDocument } from "../src/tools/document.js";

describe("query_document semantic helpers", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-query-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("fish", "Fish", svgWithElement("body"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns semantic fingerprints and candidate matches", async () => {
    const target = fingerprintSvgElements(svgWithElement("body")).find((fingerprint) => fingerprint.elementId === "body");
    expect(target).toBeTruthy();
    await workspace.writeSvgWithSnapshot("fish", "rename", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="renamed-body"'),
      result: {},
    }));

    const result = await queryDocument(
      {
        docId: "fish",
        includeFingerprints: true,
        matchElementFingerprint: target,
        matchLimit: 3,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      semanticFingerprints: expect.arrayContaining([expect.objectContaining({ elementId: "renamed-body" })]),
    });
    expect(result.semanticMatches?.[0]).toMatchObject({ elementId: "renamed-body" });
  });

  it("returns compact query output and dependency summaries without full tree payload", async () => {
    await workspace.createDocument("defs-doc", "Defs", svgWithDefs());

    const result = await queryDocument(
      {
        docId: "defs-doc",
        responseMode: "compact",
        includeDependencies: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      target: { type: "svg", childCount: 2 },
      counts: {
        definitionCount: 1,
        referenceCount: 1,
        unresolvedReferenceCount: 0,
      },
    });
    expect(result).not.toHaveProperty("tree");
  });
});

function svgWithElement(elementId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <g id="fish">
    <path id="${elementId}" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" stroke="#111827"/>
  </g>
</svg>`;
}

function svgWithDefs(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <defs>
    <linearGradient id="paint"><stop offset="0%" stop-color="#fff"/></linearGradient>
  </defs>
  <rect id="box" x="1" y="1" width="10" height="10" fill="url(#paint)"/>
</svg>`;
}
