import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import { timestampId } from "../adapters/workspace.js";
import { InkMcpError } from "../core/errors.js";
import {
  finalizeGeometrySvg,
  prepareGeometrySvg,
  type GeometryOperation,
} from "../core/geometry.js";
import {
  pathDifferenceSchema,
  pathGeometryBaseSchema,
  pathGeometryMultiSchema,
  runActionSchema,
} from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import type { ToolContext } from "./context.js";

type GeometryInput = z.infer<typeof pathGeometryBaseSchema>;
type GeometryMultiInput = z.infer<typeof pathGeometryMultiSchema>;
type DifferenceInput = z.infer<typeof pathDifferenceSchema>;

const geometryActionMap: Record<Exclude<GeometryOperation, "path_difference" | "run_action">, string> = {
  path_union: "path-union",
  path_intersection: "path-intersection",
  path_exclusion: "path-exclusion",
  path_combine: "path-combine",
  path_break_apart: "path-break-apart",
  path_simplify: "path-simplify",
};

const allowedActionMap: Record<z.infer<typeof runActionSchema>["action"], string> = {
  object_to_path: "object-to-path",
  selection_group: "selection-group",
  selection_ungroup: "selection-ungroup",
  path_simplify: "path-simplify",
};

export async function runPathGeometry(
  operation: Exclude<GeometryOperation, "path_difference" | "run_action">,
  input: GeometryInput | GeometryMultiInput,
  ctx: ToolContext,
) {
  const action = geometryActionMap[operation];
  return applyInkscapeGeometry(
    operation,
    input.docId,
    input.elementIds,
    {
      resultId: input.resultId,
      autoConvertToPath: input.autoConvertToPath,
      timeoutMs: input.timeoutMs,
      actions: [...selectActions(input.elementIds), ...(input.autoConvertToPath ? ["object-to-path"] : []), action],
    },
    ctx,
  );
}

export async function runPathDifference(input: DifferenceInput, ctx: ToolContext) {
  const selectedIds = [input.baseId, ...input.cutterIds];
  return applyInkscapeGeometry(
    "path_difference",
    input.docId,
    selectedIds,
    {
      resultId: input.resultId,
      autoConvertToPath: input.autoConvertToPath,
      timeoutMs: input.timeoutMs,
      actions: [...selectActions(selectedIds), ...(input.autoConvertToPath ? ["object-to-path"] : []), "path-difference"],
    },
    ctx,
  );
}

export async function runAllowedAction(input: z.infer<typeof runActionSchema>, ctx: ToolContext) {
  const action = allowedActionMap[input.action];
  if (!action) {
    throw new InkMcpError("INVALID_INPUT", "Action is not allowlisted.", { action: input.action });
  }
  return applyInkscapeGeometry(
    "run_action",
    input.docId,
    input.elementIds,
    {
      resultId: input.resultId,
      autoConvertToPath: input.action === "object_to_path",
      timeoutMs: input.timeoutMs,
      actions: [...selectActions(input.elementIds), action],
    },
    ctx,
  );
}

async function applyInkscapeGeometry(
  operation: GeometryOperation,
  docId: string,
  selectedIds: string[],
  options: {
    actions: string[];
    resultId?: string;
    autoConvertToPath?: boolean;
    timeoutMs?: number;
  },
  ctx: ToolContext,
) {
  const currentSvg = await ctx.workspace.readSvg(docId);
  prepareGeometrySvg(currentSvg, selectedIds, options);

  const write = await ctx.workspace.writeSvgWithSnapshot(docId, operation, async (lockedSvg) => {
    const prepared = prepareGeometrySvg(lockedSvg, selectedIds, options);
    const tempId = timestampId();
    const tempInput = ctx.workspace.tempPath(docId, `${operation}-${tempId}-input.svg`);
    const tempOutput = ctx.workspace.tempPath(docId, `${operation}-${tempId}-output.svg`);
    await mkdir(path.dirname(tempInput), { recursive: true });
    await writeFile(tempInput, lockedSvg, "utf8");

    try {
      const inkscape = await ctx.inkscape.runActionsToSvg(tempInput, {
        actions: options.actions,
        outputPath: tempOutput,
        timeoutMs: options.timeoutMs,
      });
      const exportedSvg = await readFile(tempOutput, "utf8");
      const finalized = finalizeGeometrySvg(exportedSvg, prepared, { resultId: options.resultId });
      return {
        svg: finalized.svg,
        result: {
          operation,
          resultIds: finalized.resultIds,
          warnings: prepared.warnings,
          inkscape: { binaryPath: inkscape.binaryPath, exitCode: inkscape.exitCode },
        },
      };
    } finally {
      await rm(tempInput, { force: true }).catch(() => undefined);
      await rm(tempOutput, { force: true }).catch(() => undefined);
    }
  });

  await appendOperationLog(write.paths, {
    level: "info",
    docId,
    toolName: operation,
    inputSummary: { selectedIds, resultId: options.resultId, actionCount: options.actions.length },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });

  return {
    ok: true,
    docId,
    operation,
    resultIds: write.result.resultIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
    warnings: write.result.warnings,
    inkscape: write.result.inkscape,
  };
}

function selectActions(elementIds: string[]): string[] {
  return ["select-clear", `select-by-id:${elementIds.join(",")}`];
}
