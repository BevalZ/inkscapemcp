import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.restoreAllMocks();
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

  it("returns compact path-node summaries without full segment arrays", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "compact",
        includePathNodes: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      counts: {
        pathCount: 3,
        describedPathCount: 2,
        unsupportedPathCount: 1,
      },
      pathNodes: {
        totalPathCount: 3,
        describedPathCount: 2,
        unsupportedPathCount: 1,
        paths: [
          {
            elementId: "body",
            pathIndex: 0,
            segmentCount: 4,
            commandCounts: { M: 1, C: 1, L: 1, Z: 1 },
            editablePointCount: 5,
          },
          {
            elementId: "relative-fin",
            pathIndex: 1,
            segmentCount: 3,
            commandCounts: { M: 1, l: 2 },
            relativeSegmentCount: 2,
          },
        ],
        warnings: [
          {
            code: "UNSUPPORTED_PATH_DATA",
            elementId: "arc",
            pathIndex: 2,
            details: { command: "A" },
          },
        ],
      },
    });
    expect(result.pathNodes?.paths[0]).not.toHaveProperty("segments");
    expect(result.pathNodes?.paths[0]).not.toHaveProperty("d");
    await expect(workspace.listHistory("paths-doc")).resolves.toEqual([]);
  });

  it("returns standard path-node segment details for supported commands", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "standard",
        includePathNodes: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "standard",
      pathNodes: {
        totalPathCount: 3,
        describedPathCount: 2,
        unsupportedPathCount: 1,
        paths: expect.arrayContaining([
          expect.objectContaining({
            elementId: "body",
            d: "M10 30 C25 5 70 5 90 30 L10 30 Z",
            segments: expect.arrayContaining([
              expect.objectContaining({
                index: 0,
                cmd: "M",
                availablePoints: ["end"],
                absolutePoints: { end: { x: 10, y: 30 } },
              }),
              expect.objectContaining({
                index: 1,
                cmd: "C",
                availablePoints: ["c1", "c2", "end"],
                absolutePoints: {
                  c1: { x: 25, y: 5 },
                  c2: { x: 70, y: 5 },
                  end: { x: 90, y: 30 },
                },
              }),
              expect.objectContaining({
                index: 2,
                cmd: "L",
                availablePoints: ["end"],
                absolutePoints: { end: { x: 10, y: 30 } },
              }),
              expect.objectContaining({
                index: 3,
                cmd: "Z",
                availablePoints: [],
              }),
            ]),
          }),
        ]),
        warnings: [
          {
            code: "UNSUPPORTED_PATH_DATA",
            elementId: "arc",
            message: "edit_path_nodes supports only M, L, C, Q, and Z path commands.",
          },
        ],
      },
    });
    expect(result).toHaveProperty("tree");
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

function svgWithMixedPaths(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <g id="fish">
    <path id="body" d="M10 30 C25 5 70 5 90 30 L10 30 Z" fill="#facc15" stroke="#111827"/>
    <path id="relative-fin" d="M35 32 l12 8 l-18 2" fill="none" stroke="#111827"/>
    <path id="arc" d="M20 20 A5 5 0 0 1 30 30" fill="none" stroke="#111827"/>
  </g>
</svg>`;
}
