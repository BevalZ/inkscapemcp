import type { Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { parseFullSvg, walkElements } from "./validation.js";

export type SvgStyleSource = "inherited_attribute" | "inherited_style" | "local_attribute" | "local_style";

export interface SvgResolvedStyleProperty {
  value: string;
  source: SvgStyleSource;
  sourceElementId?: string;
}

export interface SvgResolvedStyleElementSummary {
  elementId?: string;
  type: string;
  path: string;
  propertyCount: number;
  properties: Record<string, SvgResolvedStyleProperty>;
}

export interface SvgResolvedStyleSummary {
  elementCount: number;
  styledElementCount: number;
  propertyCount: number;
  unsupportedFeatureCount: number;
  elements: SvgResolvedStyleElementSummary[];
  warnings: Array<{
    code: "UNSUPPORTED_STYLE_FEATURE";
    message: string;
    feature: string;
    elementId?: string;
  }>;
}

interface StyleState {
  properties: Map<string, SvgResolvedStyleProperty>;
}

const supportedProperties = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "fill-opacity",
  "opacity",
  "display",
  "visibility",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "clip-path",
  "mask",
  "filter",
  "marker-start",
  "marker-mid",
  "marker-end",
] as const;

const supportedPropertySet = new Set<string>(supportedProperties);

export function summarizeResolvedStyles(
  svg: string,
  input: { targetElementId?: string; compact?: boolean } = {},
): SvgResolvedStyleSummary {
  const document = parseFullSvg(svg);
  const root = document.documentElement;
  if (!root) {
    throw new InkMcpError("INVALID_INPUT", "Document root must be <svg>.");
  }
  const allSummaries: SvgResolvedStyleElementSummary[] = [];
  const warnings: SvgResolvedStyleSummary["warnings"] = [];

  collectDocumentStyleWarnings(svg, root, warnings);
  walkStyleTree(root, emptyStyleState(), [], allSummaries, warnings);
  const targetSummaries = input.targetElementId
    ? allSummaries.filter((summary) => summary.elementId === input.targetElementId)
    : allSummaries;
  const elements = input.compact ? targetSummaries.map(compactStyleElementSummary) : targetSummaries;

  return {
    elementCount: targetSummaries.length,
    styledElementCount: targetSummaries.filter((summary) => summary.propertyCount > 0).length,
    propertyCount: targetSummaries.reduce((sum, summary) => sum + summary.propertyCount, 0),
    unsupportedFeatureCount: warnings.length,
    elements,
    warnings,
  };
}

function collectDocumentStyleWarnings(
  svg: string,
  root: XmlElement,
  warnings: SvgResolvedStyleSummary["warnings"],
): void {
  if (/<\?xml-stylesheet\b/i.test(svg)) {
    warnings.push({
      code: "UNSUPPORTED_STYLE_FEATURE",
      message: "External or processing-instruction stylesheets are not resolved by this summary.",
      feature: "external_stylesheet",
    });
  }

  for (const element of walkElements(root)) {
    const tag = (element.localName ?? element.nodeName).toLowerCase();
    const elementId = element.getAttribute("id") ?? undefined;
    if (tag === "style") {
      warnings.push({
        code: "UNSUPPORTED_STYLE_FEATURE",
        message: "Embedded <style> stylesheet cascade is not resolved by this summary.",
        feature: "stylesheet",
        ...(elementId ? { elementId } : {}),
      });
    }
    const rel = element.getAttribute("rel")?.toLowerCase();
    if (rel === "stylesheet") {
      warnings.push({
        code: "UNSUPPORTED_STYLE_FEATURE",
        message: "Linked stylesheet cascade is not resolved by this summary.",
        feature: "external_stylesheet",
        ...(elementId ? { elementId } : {}),
      });
    }
  }
}

function walkStyleTree(
  element: XmlElement,
  inherited: StyleState,
  ancestry: string[],
  summaries: SvgResolvedStyleElementSummary[],
  warnings: SvgResolvedStyleSummary["warnings"],
): void {
  const path = [...ancestry, elementName(element)].join(" > ");
  const state = applyElementStyles(element, inherited, warnings);
  const properties = Object.fromEntries([...state.properties.entries()].sort(([left], [right]) => left.localeCompare(right)));
  summaries.push({
    elementId: element.getAttribute("id") ?? undefined,
    type: element.localName ?? element.nodeName,
    path,
    propertyCount: Object.keys(properties).length,
    properties,
  });

  for (let index = 0; index < element.childNodes.length; index += 1) {
    const child = element.childNodes.item(index);
    if (child?.nodeType === 1) {
      walkStyleTree(child as XmlElement, state, [...ancestry, elementName(element)], summaries, warnings);
    }
  }
}

function applyElementStyles(
  element: XmlElement,
  inherited: StyleState,
  warnings: SvgResolvedStyleSummary["warnings"],
): StyleState {
  const elementId = element.getAttribute("id") ?? undefined;
  const next = inheritStyleState(inherited);

  for (let index = 0; index < element.attributes.length; index += 1) {
    const attribute = element.attributes.item(index);
    if (!attribute || !supportedPropertySet.has(attribute.name)) continue;
    next.properties.set(attribute.name, {
      value: attribute.value,
      source: "local_attribute",
      ...(elementId ? { sourceElementId: elementId } : {}),
    });
  }

  const style = element.getAttribute("style");
  if (style) {
    for (const declaration of parseStyleDeclarations(style, elementId, warnings)) {
      if (!supportedPropertySet.has(declaration.property)) continue;
      next.properties.set(declaration.property, {
        value: declaration.value,
        source: "local_style",
        ...(elementId ? { sourceElementId: elementId } : {}),
      });
    }
  }

  return next;
}

function inheritStyleState(inherited: StyleState): StyleState {
  const properties = new Map<string, SvgResolvedStyleProperty>();
  for (const [property, value] of inherited.properties) {
    properties.set(property, {
      ...value,
      source: value.source === "local_style" || value.source === "inherited_style" ? "inherited_style" : "inherited_attribute",
    });
  }
  return { properties };
}

function parseStyleDeclarations(
  style: string,
  elementId: string | undefined,
  warnings: SvgResolvedStyleSummary["warnings"],
): Array<{ property: string; value: string }> {
  const declarations = [];
  for (const declaration of style.split(";")) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      warnings.push({
        code: "UNSUPPORTED_STYLE_FEATURE",
        message: "Inline style declaration could not be parsed.",
        feature: "invalid_inline_declaration",
        ...(elementId ? { elementId } : {}),
      });
      continue;
    }
    const property = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (value.includes("!important")) {
      warnings.push({
        code: "UNSUPPORTED_STYLE_FEATURE",
        message: "CSS !important precedence is not resolved by this summary.",
        feature: "important",
        ...(elementId ? { elementId } : {}),
      });
    }
    if (value.includes("var(")) {
      warnings.push({
        code: "UNSUPPORTED_STYLE_FEATURE",
        message: "CSS variables are not resolved by this summary.",
        feature: "css_variable",
        ...(elementId ? { elementId } : {}),
      });
    }
    declarations.push({ property, value });
  }
  return declarations;
}

function compactStyleElementSummary(summary: SvgResolvedStyleElementSummary): SvgResolvedStyleElementSummary {
  return {
    elementId: summary.elementId,
    type: summary.type,
    path: summary.path,
    propertyCount: summary.propertyCount,
    properties: Object.fromEntries(
      Object.entries(summary.properties).map(([property, value]) => [
        property,
        {
          value: value.value,
          source: value.source,
          ...(value.sourceElementId ? { sourceElementId: value.sourceElementId } : {}),
        },
      ]),
    ),
  };
}

function emptyStyleState(): StyleState {
  return { properties: new Map() };
}

function elementName(element: XmlElement): string {
  const id = element.getAttribute("id");
  const type = element.localName ?? element.nodeName;
  return id ? `${type}#${id}` : type;
}
