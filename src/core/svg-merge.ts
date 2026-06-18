import { XMLSerializer } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { findElementById, getSvgRoot, parseSvgDocument, serializeSvg } from "./svg-document.js";
import { summarizeSvgDependencies } from "./svg-dependencies.js";
import { diffSvgDocuments, type SvgOperationDiff } from "./svg-diff.js";
import { elementChildren, walkElements } from "./validation.js";
import { inkMcpMetadataElementId } from "./sync-metadata.js";

const rootParentId = "__root__";

export type SvgMergeConflictClass =
  | "same_attribute_changed"
  | "different_attributes_changed"
  | "text_changed_both"
  | "text_changed_one_side"
  | "element_deleted_one_side"
  | "concurrent_add_same_id"
  | "parent_changed"
  | "sibling_order_changed"
  | "dependency_sensitive_change"
  | "overlapping_element_change";

export interface SvgMergeConflict {
  elementId: string;
  reason:
    | "overlapping_element_change"
    | "concurrent_add_same_id"
    | "gui_reparent"
    | "gui_reorder"
    | "dependency_sensitive_change"
    | "missing_gui_parent"
    | "invalid_workspace_parent";
  classes: SvgMergeConflictClass[];
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
  siblingIndex: number;
}

interface ElementChange {
  added: boolean;
  removed: boolean;
  attributes: Map<string, { before?: string; after?: string }>;
  textChanged: boolean;
  structure?: { beforeParentId?: string; afterParentId?: string; beforeIndex?: number; afterIndex?: number };
  dependencySensitive: boolean;
}

interface ElementChangePair {
  workspace: ElementChange;
  gui: ElementChange;
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
  const changeIndex = buildThreeWayChangeIndex(input);
  const conflicts: SvgMergeConflict[] = [];
  const appliedElementIds: string[] = [];

  const ids = new Set([...baseline.elements.keys(), ...workspace.elements.keys(), ...gui.elements.keys()]);
  ids.delete(inkMcpMetadataElementId);

  for (const elementId of ids) {
    const baseEntry = baseline.elements.get(elementId);
    const workspaceEntry = workspace.elements.get(elementId);
    const guiEntry = gui.elements.get(elementId);
    const changes = changeIndex.get(elementId) ?? emptyChangePair();

    if (!baseEntry) {
      mergeAddedElement(elementId, workspaceDocument, workspace, gui, changes, appliedElementIds, conflicts);
      continue;
    }

    const workspaceChanged = !sameIndexedElement(baseEntry, workspaceEntry);
    const guiChanged = !sameIndexedElement(baseEntry, guiEntry);

    if (workspaceChanged && guiChanged) {
      if (sameIndexedElement(workspaceEntry, guiEntry)) continue;
      conflicts.push({
        elementId,
        reason: "overlapping_element_change",
        classes: classifyConflict(changes, "overlapping_element_change"),
        details: {
          workspacePresent: Boolean(workspaceEntry),
          guiPresent: Boolean(guiEntry),
        },
      });
      continue;
    }

    if (!guiChanged) continue;
    if (changes.gui.dependencySensitive) {
      conflicts.push({
        elementId,
        reason: "dependency_sensitive_change",
        classes: classifyConflict(changes, "dependency_sensitive_change"),
        details: { dependencySensitive: true },
      });
      continue;
    }
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
        classes: classifyConflict(changes, "gui_reparent"),
        details: { baselineParentId: baseEntry.parentId, guiParentId: guiEntry.parentId },
      });
      continue;
    }
    if (guiEntry.siblingIndex !== baseEntry.siblingIndex) {
      conflicts.push({
        elementId,
        reason: "gui_reorder",
        classes: classifyConflict(changes, "gui_reorder"),
        details: { baselineIndex: baseEntry.siblingIndex, guiIndex: guiEntry.siblingIndex },
      });
      continue;
    }
    if (!workspaceEntry) {
      conflicts.push({
        elementId,
        reason: "overlapping_element_change",
        classes: classifyConflict(changes, "overlapping_element_change"),
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
  changes: ElementChangePair,
  appliedElementIds: string[],
  conflicts: SvgMergeConflict[],
): void {
  const workspaceEntry = workspace.elements.get(elementId);
  const guiEntry = gui.elements.get(elementId);
  if (!guiEntry) return;
  if (workspaceEntry) {
    if (sameIndexedElement(workspaceEntry, guiEntry)) return;
    conflicts.push({ elementId, reason: "concurrent_add_same_id", classes: classifyConflict(changes, "concurrent_add_same_id") });
    return;
  }
  if (changes.gui.dependencySensitive) {
    conflicts.push({
      elementId,
      reason: "dependency_sensitive_change",
      classes: classifyConflict(changes, "dependency_sensitive_change"),
      details: { dependencySensitive: true },
    });
    return;
  }

  const parent = resolveWorkspaceParent(workspaceDocument, workspace, guiEntry.parentId);
  if (!parent) {
    conflicts.push({
      elementId,
      reason: guiEntry.parentId === rootParentId ? "invalid_workspace_parent" : "missing_gui_parent",
      classes: classifyConflict(changes, "gui_reparent"),
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
    siblingIndex: elementSiblingIndex(imported),
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
    siblingIndex: current.siblingIndex,
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
      siblingIndex: elementSiblingIndex(element),
    });
  }
  return { document, elements };
}

function sameIndexedElement(left?: IndexedElement, right?: IndexedElement): boolean {
  if (!left || !right) return left === right;
  return left.serial === right.serial && left.parentId === right.parentId && left.siblingIndex === right.siblingIndex;
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

function elementSiblingIndex(element: XmlElement): number {
  const parent = element.parentNode;
  if (!parent || parent.nodeType !== 1) return 0;
  return elementChildren(parent as XmlElement).indexOf(element);
}

function buildThreeWayChangeIndex(input: { baselineSvg: string; workspaceSvg: string; guiSvg: string }): Map<string, ElementChangePair> {
  const workspaceDiff = diffSvgDocuments(input.baselineSvg, input.workspaceSvg);
  const guiDiff = diffSvgDocuments(input.baselineSvg, input.guiSvg);
  const dependencySensitiveIds = new Set([
    ...dependencySensitiveElementIds(input.baselineSvg),
    ...dependencySensitiveElementIds(input.workspaceSvg),
    ...dependencySensitiveElementIds(input.guiSvg),
  ]);
  const ids = new Set([
    ...workspaceDiff.changedElementIds,
    ...guiDiff.changedElementIds,
    ...dependencySensitiveIds,
  ]);
  const result = new Map<string, ElementChangePair>();
  for (const elementId of ids) {
    if (elementId === inkMcpMetadataElementId) continue;
    result.set(elementId, {
      workspace: changeForElement(workspaceDiff, elementId, dependencySensitiveIds.has(elementId)),
      gui: changeForElement(guiDiff, elementId, dependencySensitiveIds.has(elementId)),
    });
  }
  return result;
}

function changeForElement(diff: SvgOperationDiff, elementId: string, dependencySensitive: boolean): ElementChange {
  const attributes = new Map<string, { before?: string; after?: string }>();
  for (const change of diff.attributeChanges.filter((entry) => entry.elementId === elementId)) {
    attributes.set(change.attributeName, { before: change.before, after: change.after });
  }
  const structure = diff.structureChanges.find((entry) => entry.elementId === elementId);
  return {
    added: diff.addedElementIds.includes(elementId),
    removed: diff.removedElementIds.includes(elementId),
    attributes,
    textChanged: diff.textChanges.some((entry) => entry.elementId === elementId),
    ...(structure ? { structure } : {}),
    dependencySensitive,
  };
}

function dependencySensitiveElementIds(svg: string): Set<string> {
  const summary = summarizeSvgDependencies(svg);
  const ids = new Set<string>();
  for (const definition of summary.definitions) ids.add(definition.id);
  for (const reference of summary.references) {
    ids.add(reference.targetId);
    if (reference.sourceElementId) ids.add(reference.sourceElementId);
  }
  return ids;
}

function classifyConflict(changes: ElementChangePair, reason: SvgMergeConflict["reason"]): SvgMergeConflictClass[] {
  const classes = new Set<SvgMergeConflictClass>();
  if (reason === "concurrent_add_same_id") classes.add("concurrent_add_same_id");
  if (reason === "gui_reparent" || reason === "missing_gui_parent" || reason === "invalid_workspace_parent") classes.add("parent_changed");
  if (reason === "gui_reorder") classes.add("sibling_order_changed");
  if (reason === "dependency_sensitive_change" || changes.workspace.dependencySensitive || changes.gui.dependencySensitive) {
    classes.add("dependency_sensitive_change");
  }
  if (changes.workspace.removed || changes.gui.removed) classes.add("element_deleted_one_side");

  const workspaceAttributes = changes.workspace.attributes;
  const guiAttributes = changes.gui.attributes;
  const sharedAttributes = [...workspaceAttributes.keys()].filter((name) => guiAttributes.has(name));
  if (sharedAttributes.some((name) => workspaceAttributes.get(name)?.after !== guiAttributes.get(name)?.after)) {
    classes.add("same_attribute_changed");
  } else if (workspaceAttributes.size > 0 && guiAttributes.size > 0) {
    classes.add("different_attributes_changed");
  }

  if (changes.workspace.textChanged && changes.gui.textChanged) {
    classes.add("text_changed_both");
  } else if (changes.workspace.textChanged || changes.gui.textChanged) {
    classes.add("text_changed_one_side");
  }

  const workspaceStructure = changes.workspace.structure;
  const guiStructure = changes.gui.structure;
  if (workspaceStructure || guiStructure) {
    if (
      workspaceStructure?.beforeParentId !== workspaceStructure?.afterParentId ||
      guiStructure?.beforeParentId !== guiStructure?.afterParentId
    ) {
      classes.add("parent_changed");
    }
    if (
      workspaceStructure?.beforeIndex !== workspaceStructure?.afterIndex ||
      guiStructure?.beforeIndex !== guiStructure?.afterIndex
    ) {
      classes.add("sibling_order_changed");
    }
  }

  if (classes.size === 0) classes.add("overlapping_element_change");
  return [...classes].sort();
}

function emptyChangePair(): ElementChangePair {
  return {
    workspace: emptyChange(false),
    gui: emptyChange(false),
  };
}

function emptyChange(dependencySensitive: boolean): ElementChange {
  return {
    added: false,
    removed: false,
    attributes: new Map(),
    textChanged: false,
    dependencySensitive,
  };
}
