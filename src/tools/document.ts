import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import { timestampId } from "../adapters/workspace.js";
import { InkMcpError } from "../core/errors.js";
import { createDocId } from "../core/ids.js";
import {
  createSvgDocument,
  getSvgRoot,
  parseSvgDocument,
  serializeSvg,
  summarizeDocument,
  summarizeElement,
  type ElementSummary,
} from "../core/svg-document.js";
import { summarizeSvgDependencies } from "../core/svg-dependencies.js";
import { summarizePathNodesForQuery } from "../core/path-node-summary.js";
import { findSemanticElementMatches, fingerprintSvgElements } from "../core/semantic-fingerprint.js";
import { applyOperationsToSvg, type SvgOperation } from "../core/svg-ops.js";
import { parseFullSvg } from "../core/validation.js";
import {
  archiveDocumentSchema,
  createCheckpointSchema,
  createDocumentSchema,
  diffDocumentSnapshotsSchema,
  importSvgDocumentSchema,
  listHistorySchema,
  previewSvgOperationsSchema,
  queryDocumentSchema,
  recoverDocumentSchema,
  replayOperationsSchema,
  replaceDocumentSvgSchema,
  rollbackDocumentSchema,
} from "../core/validation.js";
import { diffSvgDocuments, type SvgOperationDiff } from "../core/svg-diff.js";
import { appendOperationLog } from "../logging/operation-log.js";
import {
  directAttributeUpdatesForAttributeOnlyOperations,
  prePullBeforeCurrentStateRead,
  prePullBeforeCurrentStateWrite,
  tryAutoRefreshInInkscape,
  tryAutoSyncAttributesInInkscape,
  withGuiRefreshResult,
  withWriteDiagnostics,
  type ToolContext,
} from "./context.js";
import { ensureNoActiveBidirectionalConnectionForRollback } from "./sync.js";

export async function createDocument(input: z.infer<typeof createDocumentSchema>, ctx: ToolContext) {
  const title = input.title ?? "Untitled SVG";
  const docId = input.docId ?? createDocId(title);
  const svg = createSvgDocument({
    title,
    width: input.width,
    height: input.height,
    unit: input.unit,
    background: input.background,
  });
  const paths = await ctx.workspace.createDocument(docId, title, svg);
  await appendOperationLog(paths, {
    level: "info",
    docId,
    toolName: "create_document",
    inputSummary: { width: input.width, height: input.height, unit: input.unit, hasBackground: Boolean(input.background) },
    status: "ok",
  });
  return {
    ok: true,
    document: summarizeDocument(parseSvgDocument(svg), paths.currentSvg, docId, title),
    paths,
  };
}

export async function createCheckpoint(input: z.infer<typeof createCheckpointSchema>, ctx: ToolContext) {
  const checkpoint = await ctx.workspace.createCheckpointSnapshot(input.docId, { label: input.label });
  const document = parseSvgDocument(checkpoint.svg);
  await appendOperationLog(checkpoint.paths, {
    level: "info",
    docId: input.docId,
    toolName: "create_checkpoint",
    inputSummary: {
      label: input.label,
      hasDescription: input.description !== undefined,
    },
    snapshotPath: checkpoint.snapshotPath,
    status: "ok",
  });
  return {
    ok: true,
    docId: input.docId,
    checkpointId: checkpoint.checkpointId,
    snapshotId: checkpoint.snapshotId,
    snapshotPath: checkpoint.snapshotPath,
    ...(input.label ? { label: input.label } : {}),
    ...(input.description ? { description: input.description } : {}),
    document: summarizeDocument(document, checkpoint.paths.currentSvg, input.docId, checkpoint.metadata.title),
  };
}

export async function importSvgDocument(input: z.infer<typeof importSvgDocumentSchema>, ctx: ToolContext) {
  const docId = input.docId ?? createDocId(path.basename(input.sourcePath, path.extname(input.sourcePath)));
  const title = input.title ?? docId;
  const paths = await ctx.workspace.importSvgDocument(input.sourcePath, docId, title);
  const svg = await ctx.workspace.readSvg(docId);
  await appendOperationLog(paths, {
    level: "info",
    docId,
    toolName: "import_svg_document",
    inputSummary: { sourceExtension: path.extname(input.sourcePath).toLowerCase() },
    status: "ok",
  });
  return {
    ok: true,
    docId,
    currentSvgPath: paths.currentSvg,
    document: summarizeDocument(parseSvgDocument(svg), paths.currentSvg, docId, title),
    warnings: [
      {
        code: "WORKSPACE_COPY",
        message: "The SVG was imported into the InkSMCP workspace. Future edits modify the workspace copy, not the original source file.",
      },
    ],
  };
}

export async function replaceDocumentSvg(input: z.infer<typeof replaceDocumentSvgSchema>, ctx: ToolContext) {
  if (!input.confirmFullDocumentReplacement) {
    throw new InkMcpError(
      "INVALID_INPUT",
      "replace_document_svg replaces the whole SVG object tree. Use object-level tools for normal edits, or set confirmFullDocumentReplacement=true for an intentional redraw.",
      { requiredFlag: "confirmFullDocumentReplacement" },
    );
  }

  await prePullBeforeCurrentStateWrite(ctx, input.docId, "replace_document_svg");
  const parsed = parseFullSvg(input.svg);
  const serialized = serializeSvg(parsed);
  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "replace_document_svg", () => ({
    svg: serialized,
    result: {},
  }));
  const metadata = await ctx.workspace.readMetadata(input.docId);
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "replace_document_svg",
    inputSummary: { bytes: input.svg.length },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  return withGuiRefreshResult(withWriteDiagnostics({
    ok: true,
    snapshotPath: write.snapshotPath,
    document: summarizeDocument(parsed, write.paths.currentSvg, input.docId, metadata.title),
    editMode: "full_document_replacement",
    warnings: [
      {
        code: "FULL_DOCUMENT_REPLACEMENT",
        message:
        "The entire SVG object tree was replaced. Prefer update_element, apply_svg_operations, insert_svg_fragment, or replace_attribute_values for normal edits.",
      },
    ],
  }, write), refresh);
}

export async function queryDocument(input: z.infer<typeof queryDocumentSchema>, ctx: ToolContext) {
  const prePull = await prePullBeforeCurrentStateRead(ctx, input.docId, {
    toolName: "query_document",
    skipPrePull: input.skipPrePull,
    allowStaleRead: input.allowStaleRead,
  });
  const svg = await ctx.workspace.readSvg(input.docId);
  const metadata = await ctx.workspace.readMetadata(input.docId);
  const paths = ctx.workspace.documentPaths(input.docId);
  const document = parseSvgDocument(svg);
  const root = getSvgRoot(document);
  const target = input.elementId
    ? Array.from(root.getElementsByTagName("*")).find((element) => element.getAttribute("id") === input.elementId)
    : root;

  if (!target) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Element id was not found.", details: { elementId: input.elementId } },
    };
  }

  const documentSummary = summarizeDocument(document, paths.currentSvg, input.docId, metadata.title);
  const tree = summarizeElement(target);
  const dependencySummary = input.includeDependencies ? summarizeSvgDependencies(svg) : undefined;
  const pathNodes = input.includePathNodes ? summarizePathNodesForQuery(target, input.responseMode) : undefined;
  const response =
    input.responseMode === "compact"
      ? {
          ok: true,
          responseMode: input.responseMode,
          document: documentSummary,
          target: compactElementSummary(tree),
          counts: {
            elementCount: countElements(tree),
            ...(dependencySummary
              ? {
                  definitionCount: dependencySummary.definitionCount,
                  referenceCount: dependencySummary.referenceCount,
                  unresolvedReferenceCount: dependencySummary.unresolvedReferenceCount,
                }
              : {}),
            ...(pathNodes
              ? {
                  pathCount: pathNodes.totalPathCount,
                  describedPathCount: pathNodes.describedPathCount,
                  unsupportedPathCount: pathNodes.unsupportedPathCount,
                }
              : {}),
          },
          ...(pathNodes ? { pathNodes } : {}),
        }
      : {
          ok: true,
          responseMode: input.responseMode,
          document: documentSummary,
          tree,
          ...(dependencySummary ? { dependencies: dependencySummary } : {}),
          ...(pathNodes ? { pathNodes } : {}),
        };

  return {
    ...response,
    ok: true,
    ...(input.includeFingerprints ? { semanticFingerprints: fingerprintSvgElements(svg) } : {}),
    ...(input.matchElementFingerprint
      ? { semanticMatches: findSemanticElementMatches(svg, input.matchElementFingerprint, input.matchLimit) }
      : {}),
    ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
    ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
  };
}

function compactElementSummary(element: ElementSummary): Record<string, unknown> {
  return {
    id: element.id,
    type: element.type,
    attributeCount: Object.keys(element.attributes).length,
    childCount: element.children.length,
    ...(element.text ? { text: element.text.length > 80 ? `${element.text.slice(0, 77)}...` : element.text } : {}),
  };
}

function countElements(element: ElementSummary): number {
  return 1 + element.children.reduce((sum, child) => sum + countElements(child), 0);
}

function compactSnapshotDiff(
  docId: string,
  from: { snapshotId: string; path: string },
  to: { snapshotId: string; path: string },
  diff: SvgOperationDiff,
) {
  return {
    ok: true,
    docId,
    responseMode: "compact" as const,
    generatedAt: diff.generatedAt,
    fromSnapshot: {
      snapshotId: from.snapshotId,
      path: from.path,
    },
    toSnapshot: {
      snapshotId: to.snapshotId,
      path: to.path,
    },
    summary: diff.summary,
    addedElementIds: diff.addedElementIds,
    removedElementIds: diff.removedElementIds,
    changedElementIds: diff.changedElementIds,
  };
}

function compactOperationPreview(
  input: { docId: string; operations: unknown[] },
  diff: SvgOperationDiff,
  previewResult: { changedElementIds: string[] },
) {
  return {
    ok: true,
    docId: input.docId,
    responseMode: "compact" as const,
    operationCount: input.operations.length,
    generatedAt: diff.generatedAt,
    summary: diff.summary,
    addedElementIds: diff.addedElementIds,
    removedElementIds: diff.removedElementIds,
    changedElementIds: diff.changedElementIds,
    previewChangedElementIds: previewResult.changedElementIds,
  };
}

function verifyReplayBaseline(
  baseline: { revision: number; contentHash: string } | undefined,
  current: { revision: number; contentHash: string },
): { revision: number; contentHash: string } {
  if (!baseline) {
    throw new InkMcpError("INVALID_INPUT", "replay_operations write mode requires baseline revision and contentHash.", {
      required: ["baseline.revision", "baseline.contentHash"],
    });
  }
  if (baseline.revision !== current.revision || baseline.contentHash !== current.contentHash) {
    throw new InkMcpError("SYNC_CONFLICT", "Replay baseline does not match the current document state.", {
      baseline,
      current: {
        revision: current.revision,
        contentHash: current.contentHash,
      },
    });
  }
  return baseline;
}

function assertDeterministicReplayOperations(operations: SvgOperation[]): void {
  const generatedIdOperations = operations
    .map((operation, index) => ({ operation, index }))
    .filter(({ operation }) => operation.type === "add" && operation.attributes?.id === undefined);
  if (generatedIdOperations.length > 0) {
    throw new InkMcpError("INVALID_INPUT", "replay_operations requires explicit attributes.id for add operations.", {
      operationIndexes: generatedIdOperations.map(({ index }) => index),
    });
  }
}

export async function listHistory(input: z.infer<typeof listHistorySchema>, ctx: ToolContext) {
  return {
    ok: true,
    docId: input.docId,
    snapshots: await ctx.workspace.listHistory(input.docId),
  };
}

export async function previewSvgOperations(input: z.infer<typeof previewSvgOperationsSchema>, ctx: ToolContext) {
  const prePull = await prePullBeforeCurrentStateRead(ctx, input.docId, {
    toolName: "preview_svg_operations",
    skipPrePull: input.skipPrePull,
    allowStaleRead: input.allowStaleRead,
  });
  const svg = await ctx.workspace.readSvg(input.docId);
  const preview = applyOperationsToSvg(svg, input.operations);
  const diff = diffSvgDocuments(svg, preview.svg);
  const compact = compactOperationPreview(input, diff, preview.result);
  const response =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          diff,
        }
      : compact;

  return {
    ...response,
    ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
    ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
  };
}

export async function replayOperations(input: z.infer<typeof replayOperationsSchema>, ctx: ToolContext) {
  if (input.dryRun) {
    const prePull = await prePullBeforeCurrentStateRead(ctx, input.docId, {
      toolName: "replay_operations",
      skipPrePull: input.skipPrePull,
      allowStaleRead: input.allowStaleRead,
    });
    const svg = await ctx.workspace.readSvg(input.docId);
    const metadata = await ctx.workspace.readMetadata(input.docId);
    if (input.baseline) {
      verifyReplayBaseline(input.baseline, metadata);
    }
    const preview = applyOperationsToSvg(svg, input.operations);
    const diff = diffSvgDocuments(svg, preview.svg);
    const compact = compactOperationPreview(input, diff, preview.result);
    const response =
      input.responseMode === "full"
        ? {
            ...compact,
            responseMode: "full" as const,
            dryRun: true,
            baseline: input.baseline,
            diff,
          }
        : {
            ...compact,
            dryRun: true,
            baseline: input.baseline,
          };

    return {
      ...response,
      ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
      ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
    };
  }

  if (!input.baseline) {
    throw new InkMcpError("INVALID_INPUT", "replay_operations write mode requires baseline revision and contentHash.", {
      required: ["baseline.revision", "baseline.contentHash"],
    });
  }
  if (input.skipPrePull || input.allowStaleRead) {
    throw new InkMcpError("INVALID_INPUT", "replay_operations write mode does not support skipPrePull or allowStaleRead.", {
      dryRunRequired: true,
    });
  }

  await prePullBeforeCurrentStateWrite(ctx, input.docId, "replay_operations");
  assertDeterministicReplayOperations(input.operations);
  const baseline = input.baseline;
  const write = await ctx.workspace.writeSvgWithSnapshot(
    input.docId,
    "replay_operations",
    (currentSvg) => {
      const result = applyOperationsToSvg(currentSvg, input.operations);
      const diff = diffSvgDocuments(currentSvg, result.svg);
      return { svg: result.svg, result: { ...result.result, diff } };
    },
    {
      beforeSnapshot: async () => {
        const metadata = await ctx.workspace.readMetadata(input.docId);
        verifyReplayBaseline(baseline, metadata);
      },
    },
  );
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "replay_operations",
    inputSummary: {
      operationCount: input.operations.length,
      baselineRevision: baseline.revision,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const directUpdates = directAttributeUpdatesForAttributeOnlyOperations(input.operations);
  const refresh = directUpdates
    ? await tryAutoSyncAttributesInInkscape(ctx, directUpdates, input.docId)
    : await tryAutoRefreshInInkscape(ctx, write.paths);
  const compact = compactOperationPreview(input, write.result.diff, write.result);
  const payload =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          dryRun: false,
          baseline,
          diff: write.result.diff,
          snapshotPath: write.snapshotPath,
          currentSvgPath: write.paths.currentSvg,
        }
      : {
          ...compact,
          dryRun: false,
          baseline,
          snapshotPath: write.snapshotPath,
          currentSvgPath: write.paths.currentSvg,
        };
  return withGuiRefreshResult(withWriteDiagnostics(payload, write), refresh);
}

export async function diffDocumentSnapshots(input: z.infer<typeof diffDocumentSnapshotsSchema>, ctx: ToolContext) {
  const from = await ctx.workspace.readHistorySnapshot(input.docId, input.fromSnapshotId);
  const to = await ctx.workspace.readHistorySnapshot(input.docId, input.toSnapshotId);
  const diff = diffSvgDocuments(from.svg, to.svg);
  const compact = compactSnapshotDiff(input.docId, from, to, diff);
  if (input.responseMode === "full") {
    return {
      ...compact,
      responseMode: "full" as const,
      diff,
    };
  }
  return compact;
}

export async function rollbackDocument(input: z.infer<typeof rollbackDocumentSchema>, ctx: ToolContext) {
  if (!input.confirmDiscardGuiState) {
    await ensureNoActiveBidirectionalConnectionForRollback(ctx, input.docId);
  }
  const result = await ctx.workspace.rollback(input.docId, input.snapshotId);
  await appendOperationLog(result.paths, {
    level: "info",
    docId: input.docId,
    toolName: "rollback_document",
    inputSummary: { snapshotId: input.snapshotId },
    snapshotPath: result.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, result.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    snapshotPath: result.snapshotPath,
    restoredPath: result.restoredPath,
    currentSvgPath: result.paths.currentSvg,
  }, refresh);
}

export async function recoverDocument(input: z.infer<typeof recoverDocumentSchema>, ctx: ToolContext) {
  if (!input.confirmDiscardGuiState) {
    await ensureNoActiveBidirectionalConnectionForRollback(ctx, input.docId);
  }
  const result = await ctx.workspace.rollback(input.docId, input.snapshotId, "recover_document");
  await appendOperationLog(result.paths, {
    level: "info",
    docId: input.docId,
    toolName: "recover_document",
    inputSummary: { snapshotId: input.snapshotId },
    snapshotPath: result.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, result.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    recoveredFromSnapshotId: input.snapshotId,
    preRecoverySnapshotPath: result.snapshotPath,
    restoredPath: result.restoredPath,
    currentSvgPath: result.paths.currentSvg,
  }, refresh);
}

export async function archiveDocument(input: z.infer<typeof archiveDocumentSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName: "archive_document",
    inputSummary: {},
    status: "ok",
  });
  const result = await ctx.workspace.archiveDocument(input.docId);
  return {
    ok: true,
    docId: input.docId,
    archivedPath: result.archivePath,
  };
}

export async function readPngContent(filePath: string) {
  const png = await readFile(filePath);
  return {
    type: "image" as const,
    data: png.toString("base64"),
    mimeType: "image/png",
  };
}

export function defaultExportFilename(docId: string, format: "svg" | "png" | "pdf") {
  return `${docId}-${timestampId()}.${format}`;
}

export function normalizeExportFilename(filename: string | undefined, docId: string, format: "svg" | "png" | "pdf") {
  const chosen = filename ?? defaultExportFilename(docId, format);
  return path.extname(chosen).toLowerCase() === `.${format}` ? chosen : `${chosen}.${format}`;
}
