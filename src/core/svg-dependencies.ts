import type { Element as XmlElement } from "@xmldom/xmldom";

import { parseFullSvg, walkElements } from "./validation.js";

export interface SvgReferenceSummary {
  sourceElementId?: string;
  sourceType: string;
  attributeName: string;
  targetId: string;
  referenceKind: "url" | "href";
  rawValue: string;
}

export interface SvgDefinitionSummary {
  id: string;
  type: string;
  referencedBy: string[];
}

export interface SvgDependencySummary {
  definitionCount: number;
  referenceCount: number;
  unresolvedReferenceCount: number;
  definitions: SvgDefinitionSummary[];
  references: SvgReferenceSummary[];
  unresolvedReferences: SvgReferenceSummary[];
}

export function summarizeSvgDependencies(svg: string): SvgDependencySummary {
  const document = parseFullSvg(svg);
  const root = document.documentElement;
  if (!root) {
    return {
      definitionCount: 0,
      referenceCount: 0,
      unresolvedReferenceCount: 0,
      definitions: [],
      references: [],
      unresolvedReferences: [],
    };
  }
  const elements = walkElements(root);
  const ids = new Set<string>();
  const definitions: SvgDefinitionSummary[] = [];
  const references: SvgReferenceSummary[] = [];

  for (const element of elements) {
    const id = element.getAttribute("id");
    if (id) ids.add(id);
    if (id && isInsideDefs(element)) {
      definitions.push({ id, type: element.localName ?? element.nodeName, referencedBy: [] });
    }
  }

  for (const element of elements) {
    references.push(...referencesForElement(element));
  }

  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  for (const reference of references) {
    const definition = definitionById.get(reference.targetId);
    if (definition) {
      definition.referencedBy.push(reference.sourceElementId ?? `<${reference.sourceType}>`);
    }
  }

  const unresolvedReferences = references.filter((reference) => !ids.has(reference.targetId));
  return {
    definitionCount: definitions.length,
    referenceCount: references.length,
    unresolvedReferenceCount: unresolvedReferences.length,
    definitions: definitions.sort((a, b) => a.id.localeCompare(b.id)),
    references: references.sort(referenceSort),
    unresolvedReferences: unresolvedReferences.sort(referenceSort),
  };
}

function referencesForElement(element: XmlElement): SvgReferenceSummary[] {
  const references: SvgReferenceSummary[] = [];
  const sourceElementId = element.getAttribute("id") ?? undefined;
  const sourceType = element.localName ?? element.nodeName;
  for (let index = 0; index < element.attributes.length; index += 1) {
    const attr = element.attributes.item(index);
    if (!attr) continue;
    for (const targetId of urlTargets(attr.value)) {
      references.push({
        sourceElementId,
        sourceType,
        attributeName: attr.name,
        targetId,
        referenceKind: "url",
        rawValue: attr.value,
      });
    }
    if ((attr.name === "href" || attr.name === "xlink:href") && attr.value.startsWith("#")) {
      references.push({
        sourceElementId,
        sourceType,
        attributeName: attr.name,
        targetId: attr.value.slice(1),
        referenceKind: "href",
        rawValue: attr.value,
      });
    }
  }
  return references;
}

function urlTargets(value: string): string[] {
  return [...value.matchAll(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/gi)].map((match) => match[1] as string);
}

function isInsideDefs(element: XmlElement): boolean {
  let parent = element.parentNode;
  while (parent && parent.nodeType === 1) {
    const parentElement = parent as XmlElement;
    if ((parentElement.localName ?? parentElement.nodeName) === "defs") return true;
    parent = parent.parentNode;
  }
  return false;
}

function referenceSort(a: SvgReferenceSummary, b: SvgReferenceSummary): number {
  return `${a.targetId}:${a.sourceElementId ?? ""}:${a.attributeName}`.localeCompare(
    `${b.targetId}:${b.sourceElementId ?? ""}:${b.attributeName}`,
  );
}
