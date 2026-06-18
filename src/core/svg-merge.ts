import { XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { findElementById, getSvgRoot, parseSvgDocument, serializeSvg } from "./svg-document.js";
import { elementChildren, walkElements } from "./validation.js";
import { inkMcpMetadataElementId } from "./sync-metadata.js";

const rootParentId = "__root__";

export interface SvgMergeConflict {
  elementId: string;
  reason:
    | "overlapping_element_change"
    | "concurrent_add_same_id"
    | "gui_reparent"
    | "missing_gui_parent"
    | "invalid_workspace_parent";
  details?: Record<string, unknown>;
}

export interface SvgMergeResult {
  ok: boolean;
  svg?: string;
  appliedElementIds: string[];
  conflicts: SvgMergeConflict[];
}

interface IndexedElement {
  element: XmlElement;
  serial: string;
  parentId: string;
}

export function mergeNonOverlappingSvgChanges(input: {
  baselineSvg: string;
  workspaceSvg: string;
  guiSvg: string;
}): SvgMergeResult {
  const baseline = indexDocument(parseSvgDocument(input.baselineSvg));
  const workspaceDocument = parseSvgDocument(input.workspaceSvg);
  const workspace = indexDocument(workspaceDocument);
  const gui = indexDocument(parseSvgDocument(input.guiSvg));
  const conflicts: SvgMergeConflict[] = [];
  const appliedElementIds: string[] = [];

  const ids = new Set([...baseline.elements.keys(), ...workspace.elements.keys(), ...gui.elements.keys()]);
  ids.delete(inkMcpMetadataElementId);

  for (const elementId of ids) {
    const baseEntry = baseline.elements.get(elementId);
    const workspaceEntry = workspace.elements.get(elementId);
    const guiEntry = gui.elements.get(elementId);

    if (!baseEntry) {
      mergeAddedElement(elementId, workspaceDocument, workspace, gui, appliedElementIds, conflicts);
      continue;
    }

    const workspaceChanged = !sameIndexedElement(baseEntry, workspaceEntry);
    const guiChanged = !sameIndexedElement(baseEntry, guiEntry);

    if (workspaceChanged && guiChanged) {
      if (sameIndexedElement(workspaceEntry, guiEntry)) continue;
      conflicts.push({
        elementId,
        reason: "overlapping_element_change",
        details: {
          workspacePresent: Boolean(workspaceEntry),
          guiPresent: Boolean(guiEntry),
        },
      });
      continue;
    }

    if (!guiChanged) continue;
    if (!guiEntry) {
      if (workspaceEntry) {
        workspaceEntry.element.parentNode?.removeChild(workspaceEntry.element);
        workspace.elements.delete(elementId);
        appliedElementIds.push(elementId);
      }
      continue;
    }
    if (guiEntry.parentId !== baseEntry.parentId) {
      conflicts.push({
        elementId,
        reason: "gui_reparent",
        details: { baselineParentId: baseEntry.parentId, guiParentId: guiEntry.parentId },
      });
      continue;
    }
    if (!workspaceEntry) {
      conflicts.push({
        elementId,
        reason: "overlapping_element_change",
        details: { workspacePresent: false, guiPresent: true },
      });
      continue;
    }
    replaceWorkspaceElement(workspaceDocument, workspace, elementId, guiEntry.element);
    appliedElementIds.push(elementId);
  }

  if (conflicts.length > 0) {
    return { ok: false, appliedElementIds: [], conflicts };
  }

  return {
    ok: true,
    svg: serializeSvg(workspaceDocument),
    appliedElementIds: [...new Set(appliedElementIds)].sort(),
    conflicts: [],
  };
}

function mergeAddedElement(
  elementId: string,
  workspaceDocument: XmlDocument,
  workspace: ReturnType<typeof indexDocument>,
  gui: ReturnType<typeof indexDocument>,
  appliedElementIds: string[],
  conflicts: SvgMergeConflict[],
): void {
  const workspaceEntry = workspace.elements.get(elementId);
  const guiEntry = gui.elements.get(elementId);
  if (!guiEntry) return;
  if (workspaceEntry) {
    if (sameIndexedElement(workspaceEntry, guiEntry)) return;
    conflicts.push({ elementId, reason: "concurrent_add_same_id" });
    return;
  }

  const parent = resolveWorkspaceParent(workspaceDocument, workspace, guiEntry.parentId);
  if (!parent) {
    conflicts.push({
      elementId,
      reason: guiEntry.parentId === rootParentId ? "invalid_workspace_parent" : "missing_gui_parent",
      details: { guiParentId: guiEntry.parentId },
    });
    return;
  }
  const imported = workspaceDocument.importNode(guiEntry.element, true) as XmlElement;
  parent.appendChild(imported);
  workspace.elements.set(elementId, {
    element: imported,
    serial: serializeElement(imported),
    parentId: guiEntry.parentId,
  });
  appliedElementIds.push(elementId);
}

function replaceWorkspaceElement(
  workspaceDocument: XmlDocument,
  workspace: ReturnType<typeof indexDocument>,
  elementId: string,
  guiElement: XmlElement,
): void {
  const current = workspace.elements.get(elementId);
  if (!current?.element.parentNode) {
    throw new InkMcpError("INVALID_INPUT", "Workspace merge target element is missing a parent.", { elementId });
  }
  const imported = workspaceDocument.importNode(guiElement, true) as XmlElement;
  current.element.parentNode.replaceChild(imported, current.element);
  workspace.elements.set(elementId, {
    element: imported,
    serial: serializeElement(imported),
    parentId: current.parentId,
  });
}

function resolveWorkspaceParent(
  workspaceDocument: XmlDocument,
  workspace: ReturnType<typeof indexDocument>,
  parentId: string,
): XmlElement | undefined {
  if (parentId === rootParentId) return getSvgRoot(workspaceDocument);
  return workspace.elements.get(parentId)?.element;
}

function indexDocument(document: XmlDocument): { document: XmlDocument; elements: Map<string, IndexedElement> } {
  const root = getSvgRoot(document);
  const elements = new Map<string, IndexedElement>();
  for (const element of walkElements(root)) {
    const id = element.getAttribute("id");
    if (!id) continue;
    elements.set(id, {
      element,
      serial: serializeElement(element),
      parentId: parentIdentity(element),
    });
  }
  return { document, elements };
}

function sameIndexedElement(left?: IndexedElement, right?: IndexedElement): boolean {
  if (!left || !right) return left === right;
  return left.serial === right.serial && left.parentId === right.parentId;
}

function parentIdentity(element: XmlElement): string {
  const parent = element.parentNode;
  if (!parent || parent.nodeType !== 1) return rootParentId;
  const parentElement = parent as XmlElement;
  if ((parentElement.localName ?? parentElement.nodeName) === "svg") return rootParentId;
  return parentElement.getAttribute("id") ?? parentPath(parentElement);
}

function parentPath(element: XmlElement): string {
  const parts: string[] = [];
  let current: XmlElement | undefined = element;
  while (current && (current.localName ?? current.nodeName) !== "svg") {
    const parent = current.parentNode as XmlElement | undefined;
    const siblings = parent ? elementChildren(parent).filter((child) => child.nodeName === current?.nodeName) : [];
    const index = siblings.indexOf(current);
    parts.unshift(`${current.nodeName}[${index}]`);
    current = parent;
  }
  return parts.length > 0 ? parts.join("/") : rootParentId;
}

function serializeElement(element: XmlElement): string {
  return new XMLSerializer().serializeToString(element);
}
