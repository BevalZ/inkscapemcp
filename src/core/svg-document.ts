import { XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { elementChildren, parseFullSvg, validateSafeSvgNode, walkElements } from "./validation.js";

export const SVG_NS = "http://www.w3.org/2000/svg";

export interface DocumentMetadata {
  docId: string;
  title: string;
  currentSvgPath: string;
  width?: string;
  height?: string;
  viewBox?: string;
}

export interface ElementSummary {
  id?: string;
  type: string;
  attributes: Record<string, string>;
  text?: string;
  children: ElementSummary[];
}

export function createSvgDocument(input: {
  title: string;
  width: number;
  height: number;
  unit: string;
  background?: string;
}): string {
  const width = `${input.width}${input.unit}`;
  const height = `${input.height}${input.unit}`;
  const title = escapeXml(input.title);
  const background = input.background
    ? `\n  <rect id="background" x="0" y="0" width="100%" height="100%" fill="${escapeXml(input.background)}"/>`
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `  <title>${title}</title>${background}`,
    `</svg>`,
    "",
  ].join("\n");
}

export function parseSvgDocument(svg: string): XmlDocument {
  return parseFullSvg(svg);
}

export function serializeSvg(document: XmlDocument): string {
  const root = document.documentElement;
  if (!root || root.localName !== "svg") {
    throw new InkMcpError("INVALID_INPUT", "Document root must be <svg>.");
  }
  validateSafeSvgNode(root);
  return `${new XMLSerializer().serializeToString(document)}\n`;
}

export function getSvgRoot(document: XmlDocument): XmlElement {
  const root = document.documentElement;
  if (!root || root.localName !== "svg") {
    throw new InkMcpError("INVALID_INPUT", "Document root must be <svg>.");
  }
  return root;
}

export function findElementById(document: XmlDocument, elementId: string): XmlElement {
  for (const element of walkElements(getSvgRoot(document))) {
    if (element.getAttribute("id") === elementId) {
      return element;
    }
  }
  throw new InkMcpError("INVALID_INPUT", "Element id was not found in the document.", { elementId });
}

export function collectElementIds(documentOrElement: XmlDocument | XmlElement): Set<string> {
  const root = "documentElement" in documentOrElement ? getSvgRoot(documentOrElement) : documentOrElement;
  const ids = new Set<string>();
  for (const element of walkElements(root)) {
    const id = element.getAttribute("id");
    if (id) ids.add(id);
  }
  return ids;
}

export function summarizeDocument(
  document: XmlDocument,
  currentSvgPath: string,
  docId: string,
  title: string,
): DocumentMetadata {
  const root = getSvgRoot(document);
  return {
    docId,
    title,
    currentSvgPath,
    width: root.getAttribute("width") ?? undefined,
    height: root.getAttribute("height") ?? undefined,
    viewBox: root.getAttribute("viewBox") ?? undefined,
  };
}

export function summarizeElement(element: XmlElement): ElementSummary {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes.item(index);
    if (attr) attributes[attr.name] = attr.value;
  }

  return {
    id: element.getAttribute("id") ?? undefined,
    type: element.localName ?? element.nodeName,
    attributes,
    text: element.localName === "text" ? (element.textContent ?? "") : undefined,
    children: elementChildren(element).map((child) => summarizeElement(child)),
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
