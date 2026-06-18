import { createHash } from "node:crypto";
import type { Element as XmlElement } from "@xmldom/xmldom";

import { getSvgRoot, parseSvgDocument } from "./svg-document.js";
import { elementChildren, walkElements } from "./validation.js";
import { inkMcpMetadataElementId } from "./sync-metadata.js";

export interface ElementSemanticFingerprint {
  elementId?: string;
  type: string;
  parentChain: string[];
  siblingIndex: number;
  attributesHash: string;
  styleHash: string;
  geometryHash?: string;
  textHash?: string;
  bbox?: ApproximateBBox;
}

export interface ApproximateBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ElementMatchCandidate {
  elementId?: string;
  score: number;
  reasons: string[];
  fingerprint: ElementSemanticFingerprint;
}

export function fingerprintSvgElements(svg: string): ElementSemanticFingerprint[] {
  const document = parseSvgDocument(svg);
  const root = getSvgRoot(document);
  return walkElements(root)
    .filter((element) => element !== root && element.getAttribute("id") !== inkMcpMetadataElementId)
    .map((element) => fingerprintElement(element));
}

export function findSemanticElementMatches(
  svg: string,
  target: ElementSemanticFingerprint,
  limit = 5,
): ElementMatchCandidate[] {
  return fingerprintSvgElements(svg)
    .map((fingerprint) => scoreSemanticCandidate(target, fingerprint))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function fingerprintElement(element: XmlElement): ElementSemanticFingerprint {
  const attributes = attributesRecord(element);
  const type = element.localName ?? element.nodeName;
  const geometryValue = geometrySource(type, attributes);
  const text = type === "text" ? (element.textContent ?? "") : undefined;
  return {
    elementId: element.getAttribute("id") ?? undefined,
    type,
    parentChain: parentChain(element),
    siblingIndex: siblingIndex(element),
    attributesHash: stableHash(attributesWithoutVolatileIds(attributes)),
    styleHash: stableHash(styleRecord(attributes.style)),
    ...(geometryValue ? { geometryHash: stableHash({ type, geometryValue }) } : {}),
    ...(text ? { textHash: stableHash(text.trim()) } : {}),
    ...(approximateBBox(type, attributes) ? { bbox: approximateBBox(type, attributes) } : {}),
  };
}

export function scoreSemanticCandidate(
  target: ElementSemanticFingerprint,
  candidate: ElementSemanticFingerprint,
): ElementMatchCandidate {
  let score = 0;
  const reasons: string[] = [];
  if (target.elementId && candidate.elementId && target.elementId === candidate.elementId) {
    score += 50;
    reasons.push("same_id");
  }
  if (target.type === candidate.type) {
    score += 20;
    reasons.push("same_type");
  }
  if (target.geometryHash && target.geometryHash === candidate.geometryHash) {
    score += 20;
    reasons.push("same_geometry");
  }
  if (target.attributesHash === candidate.attributesHash) {
    score += 12;
    reasons.push("same_attributes");
  }
  if (target.styleHash === candidate.styleHash) {
    score += 8;
    reasons.push("same_style");
  }
  if (target.textHash && target.textHash === candidate.textHash) {
    score += 12;
    reasons.push("same_text");
  }
  if (sameParentChain(target.parentChain, candidate.parentChain)) {
    score += 10;
    reasons.push("same_parent_chain");
  }
  if (target.siblingIndex === candidate.siblingIndex) {
    score += 4;
    reasons.push("same_sibling_index");
  }
  const bboxScore = compareBBoxes(target.bbox, candidate.bbox);
  if (bboxScore > 0) {
    score += bboxScore;
    reasons.push("similar_bbox");
  }
  return { elementId: candidate.elementId, score, reasons, fingerprint: candidate };
}

function attributesRecord(element: XmlElement): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes.item(index);
    if (attr) attributes[attr.name] = attr.value;
  }
  return attributes;
}

function attributesWithoutVolatileIds(attributes: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes).sort(([left], [right]) => left.localeCompare(right))) {
    if (name === "id") continue;
    result[name] = value;
  }
  return result;
}

function styleRecord(style?: string): Record<string, string> {
  if (!style) return {};
  const result: Record<string, string> = {};
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();
    if (property) result[property] = value;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function geometrySource(type: string, attributes: Record<string, string>): Record<string, string> | undefined {
  const keysByType: Record<string, string[]> = {
    circle: ["cx", "cy", "r"],
    ellipse: ["cx", "cy", "rx", "ry"],
    line: ["x1", "y1", "x2", "y2"],
    path: ["d"],
    polygon: ["points"],
    polyline: ["points"],
    rect: ["x", "y", "width", "height", "rx", "ry"],
    text: ["x", "y"],
  };
  const keys = keysByType[type];
  if (!keys) return undefined;
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (attributes[key] !== undefined) result[key] = attributes[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function approximateBBox(type: string, attributes: Record<string, string>): ApproximateBBox | undefined {
  if (type === "rect") {
    const x = numberAttr(attributes, "x") ?? 0;
    const y = numberAttr(attributes, "y") ?? 0;
    const width = numberAttr(attributes, "width");
    const height = numberAttr(attributes, "height");
    if (width === undefined || height === undefined) return undefined;
    return bbox(x, y, x + width, y + height);
  }
  if (type === "circle") {
    const cx = numberAttr(attributes, "cx") ?? 0;
    const cy = numberAttr(attributes, "cy") ?? 0;
    const r = numberAttr(attributes, "r");
    if (r === undefined) return undefined;
    return bbox(cx - r, cy - r, cx + r, cy + r);
  }
  if (type === "ellipse") {
    const cx = numberAttr(attributes, "cx") ?? 0;
    const cy = numberAttr(attributes, "cy") ?? 0;
    const rx = numberAttr(attributes, "rx");
    const ry = numberAttr(attributes, "ry");
    if (rx === undefined || ry === undefined) return undefined;
    return bbox(cx - rx, cy - ry, cx + rx, cy + ry);
  }
  if (type === "line") {
    const x1 = numberAttr(attributes, "x1") ?? 0;
    const y1 = numberAttr(attributes, "y1") ?? 0;
    const x2 = numberAttr(attributes, "x2") ?? 0;
    const y2 = numberAttr(attributes, "y2") ?? 0;
    return bbox(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
  }
  if (type === "path" && attributes.d) {
    const numbers = attributes.d.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)?.map(Number);
    if (!numbers || numbers.length < 2) return undefined;
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    return bbox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  return undefined;
}

function bbox(minX: number, minY: number, maxX: number, maxY: number): ApproximateBBox {
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function compareBBoxes(left?: ApproximateBBox, right?: ApproximateBBox): number {
  if (!left || !right) return 0;
  const centerDistance = Math.hypot((left.minX + left.maxX - right.minX - right.maxX) / 2, (left.minY + left.maxY - right.minY - right.maxY) / 2);
  const sizeDistance = Math.abs(left.width - right.width) + Math.abs(left.height - right.height);
  const tolerance = Math.max(left.width, left.height, right.width, right.height, 1);
  if (centerDistance <= tolerance * 0.02 && sizeDistance <= tolerance * 0.04) return 16;
  if (centerDistance <= tolerance * 0.1 && sizeDistance <= tolerance * 0.2) return 8;
  return 0;
}

function parentChain(element: XmlElement): string[] {
  const chain: string[] = [];
  let current = element.parentNode as XmlElement | null;
  while (current && current.nodeType === 1) {
    const type = current.localName ?? current.nodeName;
    if (type === "svg") break;
    chain.unshift(current.getAttribute("id") ?? type);
    current = current.parentNode as XmlElement | null;
  }
  return chain;
}

function sameParentChain(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function siblingIndex(element: XmlElement): number {
  const parent = element.parentNode as XmlElement | undefined;
  if (!parent) return 0;
  return elementChildren(parent).indexOf(element);
}

function numberAttr(attributes: Record<string, string>, name: string): number | undefined {
  const raw = attributes[name];
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stableHash(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}
