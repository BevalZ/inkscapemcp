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

  it("returns compact absolute-normalized path-node summaries without full segment arrays", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "compact",
        includePathNodes: true,
        pathNodeNormalize: "absolute",
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
        normalizedPathCount: 2,
        unsupportedPathCount: 1,
      },
      pathNodes: {
        normalize: "absolute",
        paths: [
          expect.objectContaining({
            elementId: "body",
            normalize: "absolute",
            normalizedPointCount: 5,
            normalizedCommandPoints: { M: ["end"], C: ["c1", "c2", "end"], L: ["end"], Z: [] },
          }),
          expect.objectContaining({
            elementId: "relative-fin",
            normalize: "absolute",
            normalizedPointCount: 3,
            normalizedCommandPoints: { M: ["end"], l: ["end"] },
          }),
        ],
      },
    });
    expect(result.pathNodes?.paths[0]).not.toHaveProperty("segments");
    expect(result.pathNodes?.paths[0]).not.toHaveProperty("normalizedSegments");
    await expect(workspace.listHistory("paths-doc")).resolves.toEqual([]);
  });

  it("returns compact relative-normalized path-node summaries without full segment arrays", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "compact",
        includePathNodes: true,
        pathNodeNormalize: "relative",
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
        normalizedPathCount: 2,
        unsupportedPathCount: 1,
      },
      pathNodes: {
        normalize: "relative",
        paths: [
          expect.objectContaining({
            elementId: "body",
            normalize: "relative",
            normalizedPointCount: 5,
            normalizedCommandPoints: { M: ["end"], C: ["c1", "c2", "end"], L: ["end"], Z: [] },
          }),
          expect.objectContaining({
            elementId: "relative-fin",
            normalize: "relative",
            normalizedPointCount: 3,
            normalizedCommandPoints: { M: ["end"], l: ["end"] },
          }),
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
    expect(result.pathNodes?.paths[0]).not.toHaveProperty("normalizedSegments");
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

  it("returns standard absolute-normalized path-node segment details", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "standard",
        includePathNodes: true,
        pathNodeNormalize: "absolute",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "standard",
      pathNodes: {
        normalize: "absolute",
        paths: expect.arrayContaining([
          expect.objectContaining({
            elementId: "relative-fin",
            d: "M35 32 l12 8 l-18 2",
            normalizedSegments: [
              {
                index: 0,
                cmd: "M",
                relative: false,
                availablePoints: ["end"],
                points: { end: { x: 35, y: 32 } },
              },
              {
                index: 1,
                cmd: "l",
                relative: true,
                availablePoints: ["end"],
                points: { end: { x: 47, y: 40 } },
              },
              {
                index: 2,
                cmd: "l",
                relative: true,
                availablePoints: ["end"],
                points: { end: { x: 29, y: 42 } },
              },
            ],
          }),
        ]),
        warnings: [
          {
            code: "UNSUPPORTED_PATH_DATA",
            elementId: "arc",
            details: { command: "A" },
          },
        ],
      },
    });
    expect(result.pathNodes?.paths.find((path) => path.elementId === "relative-fin")).toHaveProperty("segments");
    expect(result).toHaveProperty("tree");
  });

  it("returns standard relative-normalized path-node segment details", async () => {
    await workspace.createDocument("paths-doc", "Paths", svgWithMixedPaths());

    const result = await queryDocument(
      {
        docId: "paths-doc",
        responseMode: "standard",
        includePathNodes: true,
        pathNodeNormalize: "relative",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "standard",
      pathNodes: {
        normalize: "relative",
        warnings: [
          {
            code: "UNSUPPORTED_PATH_DATA",
            elementId: "arc",
            details: { command: "A" },
          },
        ],
      },
    });
    const bodyPath = result.pathNodes?.paths.find((path) => path.elementId === "body");
    const finPath = result.pathNodes?.paths.find((path) => path.elementId === "relative-fin");
    expect(bodyPath).toMatchObject({
      d: "M10 30 C25 5 70 5 90 30 L10 30 Z",
      normalizedSegments: [
        {
          index: 0,
          cmd: "M",
          relative: false,
          availablePoints: ["end"],
          points: { end: { x: 10, y: 30 } },
        },
        {
          index: 1,
          cmd: "C",
          relative: false,
          availablePoints: ["c1", "c2", "end"],
          points: {
            c1: { x: 15, y: -25 },
            c2: { x: 60, y: -25 },
            end: { x: 80, y: 0 },
          },
        },
        {
          index: 2,
          cmd: "L",
          relative: false,
          availablePoints: ["end"],
          points: { end: { x: -80, y: 0 } },
        },
        {
          index: 3,
          cmd: "Z",
          relative: false,
          availablePoints: [],
          points: {},
        },
      ],
    });
    expect(finPath).toMatchObject({
      normalizedSegments: [
        {
          index: 0,
          cmd: "M",
          points: { end: { x: 35, y: 32 } },
        },
        {
          index: 1,
          cmd: "l",
          points: { end: { x: 12, y: 8 } },
        },
        {
          index: 2,
          cmd: "l",
          points: { end: { x: -18, y: 2 } },
        },
      ],
    });
    expect(bodyPath).toHaveProperty("segments");
    expect(result).toHaveProperty("tree");
  });

  it("returns compact resolved-style summaries with inheritance and local overrides", async () => {
    await workspace.createDocument("style-doc", "Style", svgWithStyles());
    const sync = vi.spyOn(inkscape, "syncActiveWindowAttributes");
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await queryDocument(
      {
        docId: "style-doc",
        elementId: "label",
        responseMode: "compact",
        includeResolvedStyle: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(sync).not.toHaveBeenCalled();
    expect(companion).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      responseMode: "compact",
      counts: {
        resolvedStyleElementCount: 1,
        styledElementCount: 1,
        unsupportedStyleFeatureCount: 4,
      },
      resolvedStyle: {
        elementCount: 1,
        styledElementCount: 1,
        elements: [
          {
            elementId: "label",
            type: "text",
            properties: {
              fill: { value: "#22c55e", source: "local_style", sourceElementId: "label" },
              stroke: { value: "var(--label-stroke)", source: "local_style", sourceElementId: "label" },
              "font-family": { value: "Inter", source: "inherited_style", sourceElementId: "fish" },
              "font-size": { value: "14px", source: "local_attribute", sourceElementId: "label" },
              opacity: { value: "0.8", source: "inherited_style", sourceElementId: "fish" },
            },
          },
        ],
        warnings: expect.arrayContaining([
          expect.objectContaining({ feature: "external_stylesheet" }),
          expect.objectContaining({ feature: "stylesheet" }),
          expect.objectContaining({ feature: "important", elementId: "label" }),
          expect.objectContaining({ feature: "css_variable", elementId: "label" }),
        ]),
      },
    });
    expect(result).not.toHaveProperty("tree");
    await expect(workspace.listHistory("style-doc")).resolves.toEqual([]);
  });

  it("returns full resolved-style details for the document", async () => {
    await workspace.createDocument("style-doc", "Style", svgWithStyles());

    const result = await queryDocument(
      {
        docId: "style-doc",
        responseMode: "full",
        includeResolvedStyle: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      responseMode: "full",
      tree: { type: "svg" },
      resolvedStyle: {
        elementCount: 5,
        styledElementCount: 3,
        elements: expect.arrayContaining([
          expect.objectContaining({
            elementId: "body",
            properties: expect.objectContaining({
              fill: { value: "#facc15", source: "local_attribute", sourceElementId: "body" },
              stroke: { value: "#0f172a", source: "local_style", sourceElementId: "body" },
              opacity: { value: "0.8", source: "inherited_style", sourceElementId: "fish" },
            }),
          }),
        ]),
      },
    });
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

function svgWithStyles(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="#theme" type="text/css"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <style id="theme">#body { fill: #ef4444; }</style>
  <g id="fish" stroke="#111827" style="font-family: Inter; opacity: 0.8">
    <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#facc15" style="stroke: #0f172a"/>
    <text id="label" x="10" y="55" font-size="14px" style="fill: #22c55e; stroke: var(--label-stroke); font-weight: 700 !important">fish</text>
  </g>
</svg>`;
}
