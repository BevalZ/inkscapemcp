import type { Element as XmlElement } from "@xmldom/xmldom";

import { elementChildren, parseFullSvg, walkElements } from "./validation.js";

export interface SvgAttributeChange {
  elementId: string;
  attributeName: string;
  before?: string;
  after?: string;
}

export interface SvgTextChange {
  elementId: string;
  before: string;
  after: string;
}

export interface SvgStructureChange {
  elementId: string;
  beforeParentId?: string;
  afterParentId?: string;
  beforeIndex?: number;
  afterIndex?: number;
}

export interface SvgOperationDiff {
  generatedAt: string;
  summary: {
    beforeElementCount: number;
    afterElementCount: number;
    addedElementCount: number;
    removedElementCount: number;
    changedElementCount: number;
    attributeChangeCount: number;
    textChangeCount: number;
    structureChangeCount: number;
  };
  addedElementIds: string[];
  removedElementIds: string[];
  changedElementIds: string[];
  attributeChanges: SvgAttributeChange[];
  textChanges: SvgTextChange[];
  structureChanges: SvgStructureChange[];
}

interface ElementSnapshot {
  id: string;
  type: string;
  attributes: Record<string, string>;
  text: string;
  parentId?: string;
  siblingIndex: number;
}

export function diffSvgDocuments(beforeSvg: string, afterSvg: string, generatedAt = new Date().toISOString()): SvgOperationDiff {
  const before = collectSnapshots(beforeSvg);
  const after = collectSnapshots(afterSvg);
  const beforeIds = new Set(before.byId.keys());
  const afterIds = new Set(after.byId.keys());
  const addedElementIds = [...afterIds].filter((id) => !beforeIds.has(id)).sort();
  const removedElementIds = [...beforeIds].filter((id) => !afterIds.has(id)).sort();
  const retainedIds = [...beforeIds].filter((id) => afterIds.has(id)).sort();

  const attributeChanges: SvgAttributeChange[] = [];
  const textChanges: SvgTextChange[] = [];
  const structureChanges: SvgStructureChange[] = [];
  const changedIds = new Set<string>();

  for (const elementId of retainedIds) {
    const previous = before.byId.get(elementId) as ElementSnapshot;
    const next = after.byId.get(elementId) as ElementSnapshot;
    for (const change of diffAttributes(previous, next)) {
      attributeChanges.push(change);
      changedIds.add(elementId);
    }
    if (previous.text !== next.text) {
      textChanges.push({ elementId, before: clip(previous.text), after: clip(next.text) });
      changedIds.add(elementId);
    }
    if (previous.parentId !== next.parentId || previous.siblingIndex !== next.siblingIndex) {
      structureChanges.push({
        elementId,
        beforeParentId: previous.parentId,
        afterParentId: next.parentId,
        beforeIndex: previous.siblingIndex,
        afterIndex: next.siblingIndex,
      });
      changedIds.add(elementId);
    }
  }

  for (const elementId of addedElementIds) changedIds.add(elementId);
  for (const elementId of removedElementIds) changedIds.add(elementId);

  return {
    generatedAt,
    summary: {
      beforeElementCount: before.elementCount,
      afterElementCount: after.elementCount,
      addedElementCount: addedElementIds.length,
      removedElementCount: removedElementIds.length,
      changedElementCount: changedIds.size,
      attributeChangeCount: attributeChanges.length,
      textChangeCount: textChanges.length,
      structureChangeCount: structureChanges.length,
    },
    addedElementIds,
    removedElementIds,
    changedElementIds: [...changedIds].sort(),
    attributeChanges,
    textChanges,
    structureChanges,
  };
}

function diffAttributes(previous: ElementSnapshot, next: ElementSnapshot): SvgAttributeChange[] {
  const names = new Set([...Object.keys(previous.attributes), ...Object.keys(next.attributes)]);
  const changes: SvgAttributeChange[] = [];
  for (const attributeName of [...names].sort()) {
    const before = previous.attributes[attributeName];
    const after = next.attributes[attributeName];
    if (before !== after) {
      changes.push({
        elementId: previous.id,
        attributeName,
        before,
        after,
      });
    }
  }
  return changes;
}

function collectSnapshots(svg: string): { byId: Map<string, ElementSnapshot>; elementCount: number } {
  const document = parseFullSvg(svg);
  const root = document.documentElement;
  const byId = new Map<string, ElementSnapshot>();
  if (!root) {
    return { byId, elementCount: 0 };
  }
  const elements = walkElements(root);
  for (const element of elements) {
    const id = element.getAttribute("id");
    if (!id) continue;
    byId.set(id, {
      id,
      type: element.localName ?? element.nodeName,
      attributes: attributeMap(element),
      text: elementChildren(element).length === 0 ? clip(element.textContent ?? "") : "",
      parentId: parentElementId(element),
      siblingIndex: elementSiblingIndex(element),
    });
  }
  return { byId, elementCount: elements.length };
}

function attributeMap(element: XmlElement): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes.item(index);
    if (attr) attributes[attr.name] = attr.value;
  }
  return attributes;
}

function parentElementId(element: XmlElement): string | undefined {
  let parent = element.parentNode;
  while (parent && parent.nodeType === 1) {
    const parentElement = parent as XmlElement;
    const id = parentElement.getAttribute("id");
    if (id) return id;
    parent = parent.parentNode;
  }
  return undefined;
}

function elementSiblingIndex(element: XmlElement): number {
  const parent = element.parentNode;
  if (!parent || parent.nodeType !== 1) return 0;
  return elementChildren(parent as XmlElement).indexOf(element);
}

function clip(value: string): string {
  const normalized = value.trim();
  return normalized.length > 200 ? `${normalized.slice(0, 197)}...` : normalized;
}
