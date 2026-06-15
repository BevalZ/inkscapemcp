import * as z from "zod/v4";

import {
  addElementToSvg,
  applyOperationsToSvg,
  deleteElementFromSvg,
  insertFragmentIntoSvg,
  updateElementInSvg,
} from "../core/svg-ops.js";
import {
  addElementSchema,
  applySvgOperationsSchema,
  deleteElementSchema,
  insertSvgFragmentSchema,
  updateElementSchema,
} from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import type { ToolContext } from "./context.js";

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
  return {
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
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
  return {
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
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
  return {
    ok: true,
    docId: input.docId,
    elementId: write.result.elementId,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
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
  return {
    ok: true,
    docId: input.docId,
    changedElementIds: write.result.changedElementIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
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
  return {
    ok: true,
    docId: input.docId,
    insertedElementIds: write.result.insertedElementIds,
    renamedIds: write.result.renamedIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
}
