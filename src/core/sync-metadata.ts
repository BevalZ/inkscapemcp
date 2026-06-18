import type { Element as XmlElement } from "@xmldom/xmldom";
import { createHash, randomUUID } from "node:crypto";

import { collectElementIds, getSvgRoot, serializeSvg } from "./svg-document.js";
import { InkMcpError } from "./errors.js";
import { parseFullSvg, walkElements } from "./validation.js";

export const inkMcpMetadataElementId = "inksmcp-sync-metadata";
export const inkMcpMetadataAttribute = "data-inksmcp-connection";

export interface InkMcpSvgMarker {
  connectionId: string;
  docId: string;
  syncMode: "display_only" | "bidirectional";
  documentPath?: string;
  inferredDocId?: string;
  runtimeDocumentId?: string;
  windowId?: string;
  updatedAt: string;
}

export interface ElementIdDiff {
  retained: string[];
  removed: string[];
  added: string[];
}

export function createConnectionId(prefix = "conn"): string {
  return `${prefix}-${randomUUID()}`;
}

export function contentHash(svg: string): string {
  return `sha256:${createHash("sha256").update(svg, "utf8").digest("hex")}`;
}

export function injectInkMcpMarker(svg: string, marker: InkMcpSvgMarker): string {
  const document = parseFullSvg(svg);
  const root = getSvgRoot(document);
  const existing = findMarkerElement(root);
  const markerElement = existing ?? document.createElement("metadata");
  markerElement.setAttribute("id", inkMcpMetadataElementId);
  markerElement.setAttribute(inkMcpMetadataAttribute, JSON.stringify(marker));
  markerElement.textContent = "";
  if (!existing) {
    root.insertBefore(markerElement, root.firstChild);
  }
  return serializeSvg(document);
}

export function readInkMcpMarker(svg: string): InkMcpSvgMarker | undefined {
  const document = parseFullSvg(svg);
  const element = findMarkerElement(getSvgRoot(document));
  if (!element) return undefined;
  const raw = element.getAttribute(inkMcpMetadataAttribute);
  if (!raw) return undefined;
  const parsed = safeJsonParse(raw);
  if (!isInkMcpSvgMarker(parsed)) {
    throw new InkMcpError("INVALID_INPUT", "InkSMCP SVG metadata marker is invalid.");
  }
  return parsed;
}

export function requireInkMcpMarker(svg: string, expected: { connectionId: string; docId: string }): InkMcpSvgMarker {
  const marker = readInkMcpMarker(svg);
  if (!marker) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "Pulled SVG is missing the InkSMCP connection marker.", {
      docId: expected.docId,
      connectionId: expected.connectionId,
    });
  }
  if (marker.connectionId !== expected.connectionId || marker.docId !== expected.docId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "Pulled SVG connection marker does not match the active connection.", {
      expected,
      actual: { connectionId: marker.connectionId, docId: marker.docId },
    });
  }
  return marker;
}

export function stripInkMcpMetadata(svg: string): string {
  const document = parseFullSvg(svg);
  const element = findMarkerElement(getSvgRoot(document));
  if (element?.parentNode) {
    element.parentNode.removeChild(element);
  }
  return serializeSvg(document);
}

export function diffElementIds(beforeSvg: string, afterSvg: string): ElementIdDiff {
  const beforeIds = collectElementIds(parseFullSvg(beforeSvg));
  const afterIds = collectElementIds(parseFullSvg(afterSvg));
  beforeIds.delete(inkMcpMetadataElementId);
  afterIds.delete(inkMcpMetadataElementId);
  const retained = [...beforeIds].filter((id) => afterIds.has(id)).sort();
  const removed = [...beforeIds].filter((id) => !afterIds.has(id)).sort();
  const added = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
  return { retained, removed, added };
}

export function normalizeSvg(svg: string): string {
  return serializeSvg(parseFullSvg(svg));
}

function findMarkerElement(root: XmlElement): XmlElement | undefined {
  return walkElements(root).find((element) => element.getAttribute("id") === inkMcpMetadataElementId);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isInkMcpSvgMarker(value: unknown): value is InkMcpSvgMarker {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.connectionId === "string" &&
    typeof record.docId === "string" &&
    (record.syncMode === "display_only" || record.syncMode === "bidirectional") &&
    typeof record.updatedAt === "string"
  );
}
