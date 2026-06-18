import { InkMcpError } from "./errors.js";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";
import { assertSafeElementId, createElementId, makeUniqueElementId } from "./ids.js";
import {
  applyPathNodeEdits,
  describeEditablePathData,
  pathDataFromInput,
  type EditablePathPoint,
  type EditablePathSegmentInfo,
  type PathNodeEdit,
  type PathSegment,
} from "./path-data.js";
import {
  collectElementIds,
  findElementById,
  getSvgRoot,
  parseSvgDocument,
  serializeSvg,
  SVG_NS,
} from "./svg-document.js";
import { elementChildren, parseSvgFragment, supportedElementTypes, walkElements } from "./validation.js";

export type AttributeValue = string | number | boolean;
export type AttributeMap = Record<string, AttributeValue>;

export type SvgOperation =
  | {
      type: "add";
      elementType: (typeof supportedElementTypes)[number];
      attributes?: AttributeMap;
      text?: string;
      parentId?: string;
    }
  | {
      type: "update";
      elementId: string;
      setAttributes?: AttributeMap;
      removeAttributes?: string[];
      text?: string;
    }
  | {
      type: "delete";
      elementId: string;
    };

export interface OperationResult {
  changedElementIds: string[];
  insertedElementIds?: string[];
  renamedIds?: Record<string, string>;
}

export interface AttributeValueReplacement {
  from: string;
  to: string;
  attributeNames?: string[];
  styleProperties?: string[];
}

export interface AttributeValueReplacementResult {
  changedElementIds: string[];
  changedElementCount: number;
  changedAttributeCount: number;
  replacementCount: number;
  directAttributeUpdates: DirectAttributeUpdate[];
}

export interface DirectAttributeUpdate {
  elementId: string;
  attributeName: string;
  value: string;
}

export interface NudgePathElementResult {
  elementId: string;
  previousD: string;
  nextD: string;
  dx: number;
  dy: number;
  width: number;
}

export interface PathDataEditResult {
  elementId: string;
  previousD?: string;
  nextD: string;
}

export interface PathNodesQueryResult {
  elementId: string;
  d: string;
  segmentCount: number;
  segments: EditablePathSegmentInfo[];
  normalize?: "absolute";
  normalizedSegments?: NormalizedPathSegmentInfo[];
}

export interface NormalizedPathSegmentInfo {
  index: number;
  cmd: EditablePathSegmentInfo["cmd"];
  relative: boolean;
  availablePoints: EditablePathSegmentInfo["availablePoints"];
  points: EditablePathSegmentInfo["absolutePoints"];
}

export interface PathPointSelection {
  segmentIndex: number;
  point: EditablePathPoint;
}

export type PathPointSelector =
  | {
      type?: "points";
      points: PathPointSelection[];
    }
  | {
      type: "bbox";
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      pointTypes?: EditablePathPoint[];
    }
  | {
      type: "segment_range";
      startSegmentIndex: number;
      endSegmentIndex: number;
      pointTypes?: EditablePathPoint[];
    };

export interface TransformPathPointsResult extends PathDataEditResult {
  selectedPointCount: number;
  selectedPoints: PathPointSelection[];
  editedSegments: number[];
  transform: PathPointTransform;
}

export type PathPointTransform =
  | {
      type: "translate";
      dx: number;
      dy: number;
    }
  | {
      type: "set_absolute";
      points: Array<{ x: number; y: number }>;
    }
  | {
      type: "set_relative";
      points: Array<{ x: number; y: number }>;
    };

export function addElementToSvg(
  svg: string,
  input: {
    type: (typeof supportedElementTypes)[number];
    attributes?: AttributeMap;
    text?: string;
    parentId?: string;
  },
): { svg: string; elementId: string } {
  const document = parseSvgDocument(svg);
  const elementId = addElement(document, input);
  return { svg: serializeSvg(document), elementId };
}

export function updateElementInSvg(
  svg: string,
  input: {
    elementId: string;
    setAttributes?: AttributeMap;
    removeAttributes?: string[];
    text?: string;
  },
): { svg: string; elementId: string } {
  const document = parseSvgDocument(svg);
  updateElement(document, input);
  return { svg: serializeSvg(document), elementId: input.elementId };
}

export function nudgePathElementInSvg(
  svg: string,
  input: {
    elementId: string;
    dx?: number;
    dy?: number;
    dxMode?: "half_width_left" | "half_width_right";
  },
): { svg: string; result: NudgePathElementResult } {
  const document = parseSvgDocument(svg);
  const element = findElementById(document, input.elementId);
  if ((element.localName ?? element.nodeName) !== "path") {
    throw new InkMcpError("INVALID_INPUT", "nudge_path_element requires a path element.", {
      elementId: input.elementId,
    });
  }
  const previousD = element.getAttribute("d");
  if (!previousD) {
    throw new InkMcpError("INVALID_INPUT", "Path element has no d attribute.", { elementId: input.elementId });
  }
  const bounds = pathCoordinateBounds(previousD);
  const modeDx =
    input.dxMode === "half_width_left"
      ? -bounds.width / 2
      : input.dxMode === "half_width_right"
        ? bounds.width / 2
        : 0;
  const dx = (input.dx ?? 0) + modeDx;
  const dy = input.dy ?? 0;
  const nextD = translatePathData(previousD, dx, dy);
  element.setAttribute("d", nextD);
  return {
    svg: serializeSvg(document),
    result: {
      elementId: input.elementId,
      previousD,
      nextD,
      dx,
      dy,
      width: bounds.width,
    },
  };
}

export function drawPathInSvg(
  svg: string,
  input: {
    elementId?: string;
    parentId?: string;
    attributes?: AttributeMap;
    d?: string;
    segments?: PathSegment[];
  },
): { svg: string; result: PathDataEditResult } {
  const nextD = pathDataFromInput(input, { requireMoveTo: true });
  const attributes = input.attributes ?? {};
  if (input.elementId && attributes.id !== undefined && String(attributes.id) !== input.elementId) {
    throw new InkMcpError("INVALID_INPUT", "draw_path elementId must match attributes.id when both are provided.", {
      elementId: input.elementId,
      attributeId: attributes.id,
    });
  }
  if (attributes.d !== undefined) {
    throw new InkMcpError("INVALID_INPUT", "draw_path path data must be provided through d or segments, not attributes.d.");
  }
  const document = parseSvgDocument(svg);
  const elementId = addElement(document, {
    type: "path",
    parentId: input.parentId,
    attributes: {
      ...attributes,
      ...(input.elementId ? { id: input.elementId } : {}),
      d: nextD,
    },
  });
  return { svg: serializeSvg(document), result: { elementId, nextD } };
}

export function replacePathDataInSvg(
  svg: string,
  input: {
    elementId: string;
    d?: string;
    segments?: PathSegment[];
  },
): { svg: string; result: PathDataEditResult } {
  const nextD = pathDataFromInput(input, { requireMoveTo: true });
  const document = parseSvgDocument(svg);
  const element = findPathElement(document, input.elementId);
  const previousD = element.getAttribute("d") ?? "";
  element.setAttribute("d", nextD);
  return { svg: serializeSvg(document), result: { elementId: input.elementId, previousD, nextD } };
}

export function appendPathSegmentInSvg(
  svg: string,
  input: {
    elementId: string;
    d?: string;
    segments?: PathSegment[];
  },
): { svg: string; result: PathDataEditResult } {
  const appendedD = pathDataFromInput(input, { requireMoveTo: false });
  const document = parseSvgDocument(svg);
  const element = findPathElement(document, input.elementId);
  const previousD = element.getAttribute("d");
  if (!previousD) {
    throw new InkMcpError("INVALID_INPUT", "Path element has no d attribute.", { elementId: input.elementId });
  }
  const nextD = `${previousD.trim()} ${appendedD}`.trim();
  element.setAttribute("d", nextD);
  return { svg: serializeSvg(document), result: { elementId: input.elementId, previousD, nextD } };
}

export function editPathNodesInSvg(
  svg: string,
  input: {
    elementId: string;
    edits: PathNodeEdit[];
  },
): { svg: string; result: PathDataEditResult & { editCount: number } } {
  const document = parseSvgDocument(svg);
  const element = findPathElement(document, input.elementId);
  const previousD = element.getAttribute("d");
  if (!previousD) {
    throw new InkMcpError("INVALID_INPUT", "Path element has no d attribute.", { elementId: input.elementId });
  }
  const nextD = applyPathNodeEdits(previousD, input.edits);
  element.setAttribute("d", nextD);
  return {
    svg: serializeSvg(document),
    result: { elementId: input.elementId, previousD, nextD, editCount: input.edits.length },
  };
}

export function transformPathPointsInSvg(
  svg: string,
  input: {
    elementId: string;
    pointSelector: PathPointSelector;
    transform: PathPointTransform;
  },
): { svg: string; result: TransformPathPointsResult } {
  validateTransformPathPointsInput(input);
  const document = parseSvgDocument(svg);
  const element = findPathElement(document, input.elementId);
  const previousD = element.getAttribute("d");
  if (!previousD) {
    throw new InkMcpError("INVALID_INPUT", "Path element has no d attribute.", { elementId: input.elementId });
  }
  const selectedPoints = resolvePathPointSelector(previousD, input.pointSelector);
  validateResolvedPathPointTransform(selectedPoints, input.transform);
  const edits = pathPointTransformEdits(selectedPoints, input.transform);
  const nextD = applyPathNodeEdits(previousD, edits);
  element.setAttribute("d", nextD);
  return {
    svg: serializeSvg(document),
    result: {
      elementId: input.elementId,
      previousD,
      nextD,
      selectedPointCount: selectedPoints.length,
      selectedPoints,
      editedSegments: [...new Set(selectedPoints.map((point) => point.segmentIndex))],
      transform: input.transform,
    },
  };
}

export function queryPathNodesInSvg(
  svg: string,
  input: {
    elementId: string;
    normalize?: "none" | "absolute";
  },
): PathNodesQueryResult {
  const document = parseSvgDocument(svg);
  const element = findPathElement(document, input.elementId);
  const d = element.getAttribute("d");
  if (!d) {
    throw new InkMcpError("INVALID_INPUT", "Path element has no d attribute.", { elementId: input.elementId });
  }
  const segments = describeEditablePathData(d);
  return {
    elementId: input.elementId,
    d,
    segmentCount: segments.length,
    segments,
    ...(input.normalize === "absolute"
      ? {
          normalize: "absolute" as const,
          normalizedSegments: segments.map((segment) => ({
            index: segment.index,
            cmd: segment.cmd,
            relative: segment.relative,
            availablePoints: segment.availablePoints,
            points: segment.absolutePoints,
          })),
        }
      : {}),
  };
}

export function deleteElementFromSvg(svg: string, elementId: string): { svg: string; elementId: string } {
  const document = parseSvgDocument(svg);
  deleteElement(document, elementId);
  return { svg: serializeSvg(document), elementId };
}

export function applyOperationsToSvg(svg: string, operations: SvgOperation[]): { svg: string; result: OperationResult } {
  const document = parseSvgDocument(svg);
  const changedElementIds: string[] = [];

  for (const operation of operations) {
    if (operation.type === "add") {
      changedElementIds.push(
        addElement(document, {
          type: operation.elementType,
          attributes: operation.attributes,
          text: operation.text,
          parentId: operation.parentId,
        }),
      );
    } else if (operation.type === "update") {
      updateElement(document, operation);
      changedElementIds.push(operation.elementId);
    } else {
      deleteElement(document, operation.elementId);
      changedElementIds.push(operation.elementId);
    }
  }

  return { svg: serializeSvg(document), result: { changedElementIds } };
}

export function insertFragmentIntoSvg(
  svg: string,
  input: { parentId?: string; fragment: string; renameConflictingIds?: boolean },
): { svg: string; insertedElementIds: string[]; renamedIds: Record<string, string> } {
  const document = parseSvgDocument(svg);
  const fragmentDocument = parseSvgFragment(input.fragment);
  const existingIds = collectElementIds(document);
  const fragmentIds = collectElementIds(fragmentDocument);
  const renamedIds: Record<string, string> = {};

  for (const id of fragmentIds) {
    assertSafeElementId(id);
    if (existingIds.has(id)) {
      if (!input.renameConflictingIds) {
        throw new InkMcpError("ID_CONFLICT", "SVG fragment contains an id that already exists.", { id });
      }
      renamedIds[id] = makeUniqueElementId(id, existingIds);
    } else {
      existingIds.add(id);
    }
  }

  if (Object.keys(renamedIds).length > 0) {
    const fragmentRoot = fragmentDocument.documentElement;
    if (!fragmentRoot) {
      throw new InkMcpError("INVALID_INPUT", "SVG fragment parsing produced no root element.");
    }
    renameFragmentIds(fragmentRoot, renamedIds);
  }

  const parent = input.parentId ? findElementById(document, input.parentId) : getSvgRoot(document);
  const insertedElementIds: string[] = [];

  const fragmentRoot = fragmentDocument.documentElement;
  if (!fragmentRoot) {
    throw new InkMcpError("INVALID_INPUT", "SVG fragment parsing produced no root element.");
  }
  for (const child of elementChildren(fragmentRoot)) {
    const imported = document.importNode(child, true) as XmlElement;
    const id = imported.getAttribute("id") || createElementId(imported.localName ?? imported.nodeName);
    imported.setAttribute("id", id);
    insertedElementIds.push(id);
    parent.appendChild(imported);
  }

  return { svg: serializeSvg(document), insertedElementIds, renamedIds };
}

export function replaceAttributeValuesInSvg(
  svg: string,
  input: { replacements: AttributeValueReplacement[]; scopeElementIds?: string[] },
): { svg: string; result: AttributeValueReplacementResult } {
  const document = parseSvgDocument(svg);
  const root = getSvgRoot(document);
  const scopedElements = input.scopeElementIds?.map((elementId) => findElementById(document, elementId));
  const elements = scopedElements ? scopedElements.flatMap((element) => walkElements(element)) : walkElements(root);
  const changedElementIds = new Set<string>();
  let changedElementCount = 0;
  let changedAttributeCount = 0;
  let replacementCount = 0;
  const directAttributeUpdates: DirectAttributeUpdate[] = [];

  for (const element of elements) {
    let elementChanged = false;
    for (const replacement of input.replacements) {
      const attributes = replacement.attributeNames ?? defaultReplaceableAttributes;
      for (const attributeName of attributes) {
        if (!element.hasAttribute(attributeName)) continue;
        const currentValue = element.getAttribute(attributeName) ?? "";
        if (currentValue !== replacement.from) continue;
        element.setAttribute(attributeName, replacement.to);
        const elementId = element.getAttribute("id");
        if (elementId) {
          directAttributeUpdates.push({ elementId, attributeName, value: replacement.to });
        }
        changedAttributeCount += 1;
        replacementCount += 1;
        elementChanged = true;
      }

      if (element.hasAttribute("style")) {
        const styleResult = replaceStyleValues(element.getAttribute("style") ?? "", replacement);
        if (styleResult.changed) {
          element.setAttribute("style", styleResult.style);
          changedAttributeCount += 1;
          replacementCount += styleResult.replacementCount;
          elementChanged = true;
        }
      }
    }

    if (elementChanged) {
      changedElementCount += 1;
      const id = element.getAttribute("id");
      if (id) changedElementIds.add(id);
    }
  }

  return {
    svg: serializeSvg(document),
    result: {
      changedElementIds: [...changedElementIds],
      changedElementCount,
      changedAttributeCount,
      replacementCount,
      directAttributeUpdates,
    },
  };
}

function addElement(
  document: XmlDocument,
  input: {
    type: (typeof supportedElementTypes)[number];
    attributes?: AttributeMap;
    text?: string;
    parentId?: string;
  },
): string {
  const existingIds = collectElementIds(document);
  const attributes = input.attributes ?? {};
  const requestedId = attributes.id === undefined ? undefined : String(attributes.id);
  const elementId = requestedId ? assertSafeElementId(requestedId) : createElementId(input.type);

  if (existingIds.has(elementId)) {
    throw new InkMcpError("ID_CONFLICT", "Element id already exists.", { elementId });
  }

  const element = document.createElementNS(SVG_NS, input.type);
  element.setAttribute("id", elementId);
  applyAttributes(element, attributes, { skipId: true });
  if (input.text !== undefined || attributes.textContent !== undefined) {
    element.textContent = input.text ?? String(attributes.textContent);
  }

  const parent = input.parentId ? findElementById(document, input.parentId) : getSvgRoot(document);
  parent.appendChild(element);
  return elementId;
}

function updateElement(
  document: XmlDocument,
  input: {
    elementId: string;
    setAttributes?: AttributeMap;
    removeAttributes?: string[];
    text?: string;
  },
): void {
  const element = findElementById(document, input.elementId);
  for (const attr of input.removeAttributes ?? []) {
    if (attr === "id") {
      throw new InkMcpError("INVALID_INPUT", "update_element cannot remove id.");
    }
    element.removeAttribute(attr);
  }
  applyAttributes(element, input.setAttributes ?? {}, { skipId: false });
  if (input.text !== undefined) {
    element.textContent = input.text;
  }
}

function deleteElement(document: XmlDocument, elementId: string): void {
  const element = findElementById(document, elementId);
  if (element === getSvgRoot(document)) {
    throw new InkMcpError("INVALID_INPUT", "Cannot delete the SVG root element.");
  }
  const parent = element.parentNode;
  if (!parent) {
    throw new InkMcpError("INVALID_INPUT", "Element has no parent.", { elementId });
  }
  parent.removeChild(element);
}

function findPathElement(document: XmlDocument, elementId: string): XmlElement {
  const element = findElementById(document, elementId);
  if ((element.localName ?? element.nodeName) !== "path") {
    throw new InkMcpError("INVALID_INPUT", "Path data edits require a path element.", { elementId });
  }
  return element;
}

function validateTransformPathPointsInput(input: {
  pointSelector: PathPointSelector;
  transform: PathPointTransform;
}): void {
  if (input.pointSelector.type === "bbox") {
    validatePathPointBboxSelector(input.pointSelector);
  } else if (input.pointSelector.type === "segment_range") {
    validatePathPointSegmentRangeSelector(input.pointSelector);
  } else {
    validateExplicitPathPointSelector(input.pointSelector);
  }

  validatePathPointTransform(input.transform);
  if ((input.pointSelector.type === undefined || input.pointSelector.type === "points") && input.transform.type !== "translate") {
    validateResolvedPathPointTransform(input.pointSelector.points, input.transform);
  }
}

function validateExplicitPathPointSelector(selector: Extract<PathPointSelector, { type?: "points" }>): void {
  if (selector.points.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path point selection must not be empty.");
  }
  const selectedPoints = new Set<string>();
  for (const point of selector.points) {
    const key = `${point.segmentIndex}:${point.point}`;
    if (selectedPoints.has(key)) {
      throw new InkMcpError("INVALID_INPUT", "Path point selection must not contain duplicates.", {
        segmentIndex: point.segmentIndex,
        point: point.point,
      });
    }
    selectedPoints.add(key);
  }
}

function validatePathPointTransform(transform: PathPointTransform): void {
  if (transform.type === "translate") {
    if (!Number.isFinite(transform.dx) || !Number.isFinite(transform.dy)) {
      throw new InkMcpError("INVALID_INPUT", "Translate transform deltas must be finite.", {
        dx: transform.dx,
        dy: transform.dy,
      });
    }
    if (transform.dx === 0 && transform.dy === 0) {
      throw new InkMcpError("INVALID_INPUT", "Translate transform must move at least one axis.");
    }
    return;
  }

  for (const point of transform.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new InkMcpError("INVALID_INPUT", `${transform.type} target coordinates must be finite.`, point);
    }
  }
}

function validateResolvedPathPointTransform(points: PathPointSelection[], transform: PathPointTransform): void {
  if (transform.type === "translate") return;
  if (transform.points.length !== points.length) {
    throw new InkMcpError("INVALID_INPUT", `${transform.type} target point count must match selected point count.`, {
      selectedPointCount: points.length,
      targetPointCount: transform.points.length,
    });
  }
}

function validatePathPointBboxSelector(selector: Extract<PathPointSelector, { type: "bbox" }>): void {
  if (
    !Number.isFinite(selector.minX) ||
    !Number.isFinite(selector.minY) ||
    !Number.isFinite(selector.maxX) ||
    !Number.isFinite(selector.maxY)
  ) {
    throw new InkMcpError("INVALID_INPUT", "Path point bbox selector coordinates must be finite.", selector);
  }
  if (selector.minX > selector.maxX || selector.minY > selector.maxY) {
    throw new InkMcpError("INVALID_INPUT", "Path point bbox selector bounds are invalid.", {
      minX: selector.minX,
      minY: selector.minY,
      maxX: selector.maxX,
      maxY: selector.maxY,
    });
  }
}

function validatePathPointSegmentRangeSelector(
  selector: Extract<PathPointSelector, { type: "segment_range" }>,
): void {
  if (
    !Number.isInteger(selector.startSegmentIndex) ||
    !Number.isInteger(selector.endSegmentIndex) ||
    selector.startSegmentIndex < 0 ||
    selector.endSegmentIndex < 0
  ) {
    throw new InkMcpError("INVALID_INPUT", "Path point segment range selector indexes must be non-negative integers.", {
      startSegmentIndex: selector.startSegmentIndex,
      endSegmentIndex: selector.endSegmentIndex,
    });
  }
  if (selector.startSegmentIndex > selector.endSegmentIndex) {
    throw new InkMcpError("INVALID_INPUT", "Path point segment range selector bounds are invalid.", {
      startSegmentIndex: selector.startSegmentIndex,
      endSegmentIndex: selector.endSegmentIndex,
    });
  }
}

function resolvePathPointSelector(pathData: string, selector: PathPointSelector): PathPointSelection[] {
  const selected: PathPointSelection[] = [];
  const segments = describeEditablePathData(pathData);

  if (selector.type === "bbox") {
    const allowedPointTypes = new Set(selector.pointTypes ?? ["end", "c1", "c2"]);
    for (const segment of segments) {
      for (const point of segment.availablePoints) {
        if (!allowedPointTypes.has(point)) continue;
        const absolutePoint = segment.absolutePoints[point];
        if (!absolutePoint) continue;
        if (
          absolutePoint.x >= selector.minX &&
          absolutePoint.x <= selector.maxX &&
          absolutePoint.y >= selector.minY &&
          absolutePoint.y <= selector.maxY
        ) {
          selected.push({ segmentIndex: segment.index, point });
        }
      }
    }
    if (selected.length === 0) {
      throw new InkMcpError("INVALID_INPUT", "Path point bbox selector matched no editable points.", {
        minX: selector.minX,
        minY: selector.minY,
        maxX: selector.maxX,
        maxY: selector.maxY,
        pointTypes: [...allowedPointTypes],
      });
    }
    return selected;
  }

  if (selector.type === "segment_range") {
    const allowedPointTypes = new Set(selector.pointTypes ?? ["end", "c1", "c2"]);
    if (selector.endSegmentIndex >= segments.length) {
      throw new InkMcpError("INVALID_INPUT", "Path point segment range selector is out of range.", {
        startSegmentIndex: selector.startSegmentIndex,
        endSegmentIndex: selector.endSegmentIndex,
        segmentCount: segments.length,
      });
    }
    for (const segment of segments) {
      if (segment.index < selector.startSegmentIndex || segment.index > selector.endSegmentIndex) continue;
      for (const point of segment.availablePoints) {
        if (allowedPointTypes.has(point)) selected.push({ segmentIndex: segment.index, point });
      }
    }
    if (selected.length === 0) {
      throw new InkMcpError("INVALID_INPUT", "Path point segment range selector matched no editable points.", {
        startSegmentIndex: selector.startSegmentIndex,
        endSegmentIndex: selector.endSegmentIndex,
        pointTypes: [...allowedPointTypes],
      });
    }
    return selected;
  }

  return selector.points;
}

function pathPointTransformEdits(points: PathPointSelection[], transform: PathPointTransform): PathNodeEdit[] {
  if (transform.type === "translate") {
    return points.map((point) => ({
      type: "move_point",
      segmentIndex: point.segmentIndex,
      point: point.point,
      dx: transform.dx,
      dy: transform.dy,
    }));
  }

  return points
    .map((point, index) => ({
      type: transform.type === "set_absolute" ? "set_point_absolute" as const : "set_point_relative" as const,
      segmentIndex: point.segmentIndex,
      point: point.point,
      x: transform.points[index].x,
      y: transform.points[index].y,
    }))
    .sort((left, right) => left.segmentIndex - right.segmentIndex);
}

function applyAttributes(element: XmlElement, attributes: AttributeMap, options: { skipId: boolean }): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "textContent") continue;
    if (key === "id") {
      if (options.skipId) continue;
      throw new InkMcpError("INVALID_INPUT", "Element id changes are not supported by update_element.");
    }
    element.setAttribute(key, String(value));
  }
}

const defaultReplaceableAttributes = [
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
  "color",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stop-opacity",
  "stroke-width",
  "transform",
  "d",
  "x",
  "y",
  "cx",
  "cy",
  "rx",
  "ry",
  "r",
  "width",
  "height",
] as const;

const defaultReplaceableStyleProperties = new Set<string>(defaultReplaceableAttributes);

function replaceStyleValues(style: string, replacement: AttributeValueReplacement) {
  const allowedProperties = new Set(replacement.styleProperties ?? [...defaultReplaceableStyleProperties]);
  const declarations = style.split(";");
  let changed = false;
  let replacementCount = 0;

  const updatedDeclarations = declarations.map((declaration) => {
    const colonIndex = declaration.indexOf(":");
    if (colonIndex === -1) return declaration;

    const property = declaration.slice(0, colonIndex).trim();
    const value = declaration.slice(colonIndex + 1).trim();
    if (!allowedProperties.has(property) || value !== replacement.from) {
      return declaration;
    }

    changed = true;
    replacementCount += 1;
    const prefix = declaration.slice(0, colonIndex + 1);
    const leadingWhitespace = (declaration.slice(colonIndex + 1).match(/^\s*/) ?? [""])[0];
    return `${prefix}${leadingWhitespace}${replacement.to}`;
  });

  return { changed, replacementCount, style: updatedDeclarations.join(";") };
}

function pathCoordinateBounds(pathData: string): { minX: number; maxX: number; width: number } {
  const move = /^M\s*([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)\s+[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?c/.exec(pathData);
  if (!move) {
    throw new InkMcpError("INVALID_INPUT", "Only simple M...c path data is supported by nudge_path_element.");
  }
  const numbersAfterCurve = pathData
    .slice(move[0].length)
    .match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)
    ?.map(Number);
  if (!numbersAfterCurve || numbersAfterCurve.length < 6) {
    throw new InkMcpError("INVALID_INPUT", "Only simple M...c path data is supported by nudge_path_element.");
  }
  const startX = Number(move[1]);
  const endDx = numbersAfterCurve[4];
  return { minX: Math.min(startX, startX + endDx), maxX: Math.max(startX, startX + endDx), width: Math.abs(endDx) };
}

function translatePathData(pathData: string, dx: number, dy: number): string {
  return pathData.replace(
    /^M\s*([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)\s+([-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)/,
    (_raw, x: string, y: string) => `M${formatPathNumber(Number(x) + dx)} ${formatPathNumber(Number(y) + dy)}`,
  );
}

function formatPathNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function renameFragmentIds(root: XmlElement, renamedIds: Record<string, string>): void {
  for (const element of [root, ...elementChildren(root)]) {
    const id = element.getAttribute("id");
    if (id && renamedIds[id]) {
      element.setAttribute("id", renamedIds[id]);
    }

    for (let index = 0; index < element.attributes.length; index += 1) {
      const attr = element.attributes.item(index);
      if (!attr) continue;
      let value = attr.value;
      for (const [oldId, newId] of Object.entries(renamedIds)) {
        value = value.replaceAll(`url(#${oldId})`, `url(#${newId})`);
        if (value === `#${oldId}`) value = `#${newId}`;
      }
      if (value !== attr.value) {
        element.setAttribute(attr.name, value);
      }
    }

    for (const child of elementChildren(element)) {
      renameFragmentIds(child, renamedIds);
    }
  }
}
