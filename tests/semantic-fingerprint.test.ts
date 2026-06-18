import { describe, expect, it } from "vitest";

import { findSemanticElementMatches, fingerprintSvgElements } from "../src/core/semantic-fingerprint.js";
import { injectInkMcpMarker } from "../src/core/sync-metadata.js";

describe("semantic SVG fingerprints", () => {
  it("matches a renamed element by geometry, style, and ancestry", () => {
    const before = svgWithElement("body");
    const after = svgWithElement("renamed-body");
    const target = fingerprintSvgElements(before).find((fingerprint) => fingerprint.elementId === "body");
    expect(target).toBeTruthy();

    const matches = findSemanticElementMatches(after, target!, 3);

    expect(matches[0]).toMatchObject({
      elementId: "renamed-body",
      reasons: expect.arrayContaining(["same_type", "same_geometry", "same_attributes", "same_parent_chain"]),
    });
    expect(matches[0]?.score).toBeGreaterThan(50);
  });

  it("omits InkSMCP sync metadata from semantic fingerprints", () => {
    const marked = injectInkMcpMarker(svgWithElement("body"), {
      connectionId: "conn-abcdefgh",
      docId: "fish",
      syncMode: "bidirectional",
      updatedAt: new Date().toISOString(),
    });

    const fingerprints = fingerprintSvgElements(marked);

    expect(fingerprints.map((fingerprint) => fingerprint.elementId)).not.toContain("inksmcp-sync-metadata");
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
