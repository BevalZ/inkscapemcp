import * as z from "zod/v4";

import {
  addElementToSvg,
  appendPathSegmentInSvg,
  applyOperationsToSvg,
  deleteElementFromSvg,
  drawPathInSvg,
  editPathNodesInSvg,
  insertFragmentIntoSvg,
  nudgePathElementInSvg,
  queryPathNodesInSvg,
  replacePathDataInSvg,
  replaceAttributeValuesInSvg,
  updateElementInSvg,
} from "../core/svg-ops.js";
import {
  addElementSchema,
  appendPathSegmentSchema,
  applySvgOperationsSchema,
  deleteElementSchema,
  drawPathSchema,
  editPathNodesSchema,
  insertSvgFragmentSchema,
  nudgePathElementSchema,
  queryPathNodesSchema,
  replaceAttributeValuesSchema,
  replacePathDataSchema,
  updateElementSchema,
} from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import {
  directAttributeUpdatesForAttributeOnlyOperations,
  directAttributeUpdatesForSetAttributes,
  tryAutoRefreshInInkscape,
  tryAutoSyncAttributesInInkscape,
  withGuiRefreshResult,
  type ToolContext,
} from "./context.js";

export async function addElement(input: z.infer<typeof addElementSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "add_element", (currentSvg) => {
    const result = addElementToSvg(currentSvg, input);
    return { svg: result.svg, result: { elementId: result.elementId } };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "add_element",
    inputSummary: { type: input.type, parentId: input.parentId, attributeCount: Object.keys(input.attributes).length },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function updateElement(input: z.infer<typeof updateElementSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "update_element", (currentSvg) => {
    const result = updateElementInSvg(currentSvg, input);
    return { svg: result.svg, result: { elementId: result.elementId } };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "update_element",
    inputSummary: {
      elementId: input.elementId,
      setCount: Object.keys(input.setAttributes).length,
      removeCount: input.removeAttributes.length,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const directUpdates =
    input.text === undefined && input.removeAttributes.length === 0
      ? directAttributeUpdatesForSetAttributes(input.elementId, input.setAttributes)
      : undefined;
  const refresh = directUpdates
    ? await tryAutoSyncAttributesInInkscape(ctx, directUpdates)
    : await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function nudgePathElement(input: z.infer<typeof nudgePathElementSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "nudge_path_element", (currentSvg) => {
    const result = nudgePathElementInSvg(currentSvg, input);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "nudge_path_element",
    inputSummary: {
      elementId: input.elementId,
      dx: write.result.dx,
      dy: write.result.dy,
      dxMode: input.dxMode,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoSyncAttributesInInkscape(ctx, [
    { elementId: input.elementId, attributeName: "d", value: write.result.nextD },
  ]);
  const compact = {
    ok: true,
    docId: input.docId,
    elementId: input.elementId,
    changed: { d: { from: write.result.previousD, to: write.result.nextD }, dx: write.result.dx, dy: write.result.dy },
  };
  return withGuiRefreshResult(
    input.responseMode === "full"
      ? {
          ...compact,
          width: write.result.width,
          snapshotPath: write.snapshotPath,
          currentSvgPath: write.paths.currentSvg,
        }
      : compact,
    refresh,
  );
}

export async function drawPath(input: z.infer<typeof drawPathSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "draw_path", (currentSvg) => {
    const result = drawPathInSvg(currentSvg, input);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "draw_path",
    inputSummary: {
      parentId: input.parentId,
      elementId: write.result.elementId,
      attributeCount: Object.keys(input.attributes ?? {}).length,
      inputMode: input.d !== undefined ? "d" : "segments",
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    d: write.result.nextD,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function replacePathData(input: z.infer<typeof replacePathDataSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "replace_path_data", (currentSvg) => {
    const result = replacePathDataInSvg(currentSvg, input);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "replace_path_data",
    inputSummary: { elementId: input.elementId, inputMode: input.d !== undefined ? "d" : "segments" },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoSyncAttributesInInkscape(ctx, [
    { elementId: input.elementId, attributeName: "d", value: write.result.nextD },
  ]);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: input.elementId,
    changed: { d: { from: write.result.previousD, to: write.result.nextD } },
  }, refresh);
}

export async function appendPathSegment(input: z.infer<typeof appendPathSegmentSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "append_path_segment", (currentSvg) => {
    const result = appendPathSegmentInSvg(currentSvg, input);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "append_path_segment",
    inputSummary: { elementId: input.elementId, inputMode: input.d !== undefined ? "d" : "segments" },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoSyncAttributesInInkscape(ctx, [
    { elementId: input.elementId, attributeName: "d", value: write.result.nextD },
  ]);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: input.elementId,
    changed: { d: { from: write.result.previousD, to: write.result.nextD } },
  }, refresh);
}

export async function editPathNodes(input: z.infer<typeof editPathNodesSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "edit_path_nodes", (currentSvg) => {
    const result = editPathNodesInSvg(currentSvg, input);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "edit_path_nodes",
    inputSummary: { elementId: input.elementId, editCount: input.edits.length },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoSyncAttributesInInkscape(ctx, [
    { elementId: input.elementId, attributeName: "d", value: write.result.nextD },
  ]);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: input.elementId,
    editCount: write.result.editCount,
    changed: { d: { from: write.result.previousD, to: write.result.nextD } },
  }, refresh);
}

export async function queryPathNodes(input: z.infer<typeof queryPathNodesSchema>, ctx: ToolContext) {
  const svg = await ctx.workspace.readSvg(input.docId);
  const result = queryPathNodesInSvg(svg, input);
  return {
    ok: true,
    docId: input.docId,
    ...result,
  };
}

export async function deleteElement(input: z.infer<typeof deleteElementSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "delete_element", (currentSvg) => {
    const result = deleteElementFromSvg(currentSvg, input.elementId);
    return { svg: result.svg, result: { elementId: result.elementId } };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "delete_element",
    inputSummary: { elementId: input.elementId },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function applySvgOperations(input: z.infer<typeof applySvgOperationsSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "apply_svg_operations", (currentSvg) => {
    const result = applyOperationsToSvg(currentSvg, input.operations);
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "apply_svg_operations",
    inputSummary: { operationCount: input.operations.length },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const directUpdates = directAttributeUpdatesForAttributeOnlyOperations(input.operations);
  const refresh = directUpdates
    ? await tryAutoSyncAttributesInInkscape(ctx, directUpdates)
    : await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    changedElementIds: write.result.changedElementIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function insertSvgFragment(input: z.infer<typeof insertSvgFragmentSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "insert_svg_fragment", (currentSvg) => {
    const result = insertFragmentIntoSvg(currentSvg, input);
    return { svg: result.svg, result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "insert_svg_fragment",
    inputSummary: {
      parentId: input.parentId,
      fragmentBytes: input.fragment.length,
      renameConflictingIds: input.renameConflictingIds,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    insertedElementIds: write.result.insertedElementIds,
    renamedIds: write.result.renamedIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  }, refresh);
}

export async function replaceAttributeValues(input: z.infer<typeof replaceAttributeValuesSchema>, ctx: ToolContext) {
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "replace_attribute_values", (currentSvg) => {
    const result = replaceAttributeValuesInSvg(currentSvg, {
      replacements: input.replacements,
      scopeElementIds: input.scopeElementIds,
    });
    return { svg: result.svg, result: result.result };
  });
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "replace_attribute_values",
    inputSummary: {
      replacementRules: input.replacements.length,
      scopeElementCount: input.scopeElementIds?.length,
      changedElementCount: write.result.changedElementCount,
      replacementCount: write.result.replacementCount,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoSyncAttributesInInkscape(ctx, write.result.directAttributeUpdates);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    changedElementIds: write.result.changedElementIds,
    changedElementCount: write.result.changedElementCount,
    changedAttributeCount: write.result.changedAttributeCount,
    replacementCount: write.result.replacementCount,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
    editMode: "in_place",
  }, refresh);
}
