import { InkMcpError } from "./errors.js";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";
import { assertSafeElementId, createElementId, makeUniqueElementId } from "./ids.js";
import {
  collectElementIds,
  findElementById,
  getSvgRoot,
  parseSvgDocument,
  serializeSvg,
  SVG_NS,
} from "./svg-document.js";
import { elementChildren, parseSvgFragment, supportedElementTypes } from "./validation.js";

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
