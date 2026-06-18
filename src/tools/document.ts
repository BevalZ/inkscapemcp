import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import { timestampId } from "../adapters/workspace.js";
import { InkMcpError } from "../core/errors.js";
import { createDocId } from "../core/ids.js";
import {
  applyIdRepairsToSvg,
  proposeIdRepairsFromSvg,
  type IdRepairApplyResult,
  type IdRepairProposalResult,
} from "../core/id-repair.js";
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
import { summarizeResolvedStyles } from "../core/svg-style-summary.js";
import { summarizePathNodesForQuery } from "../core/path-node-summary.js";
import { findSemanticElementMatches, fingerprintSvgElements } from "../core/semantic-fingerprint.js";
import { applyOperationsToSvg, type SvgOperation } from "../core/svg-ops.js";
import { parseFullSvg } from "../core/validation.js";
import {
  archiveDocumentSchema,
  applyIdRepairsSchema,
  applyOperationPreviewSchema,
  createCheckpointSchema,
  createDocumentSchema,
  diffDocumentSnapshotsSchema,
  importSvgDocumentSchema,
  listHistorySchema,
  listOperationPreviewsSchema,
  previewSvgOperationsSchema,
  proposeIdRepairsSchema,
  queryDocumentSchema,
  readOperationPreviewSchema,
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
  const pathNodes = input.includePathNodes
    ? summarizePathNodesForQuery(target, input.responseMode, { normalize: input.pathNodeNormalize })
    : undefined;
  const resolvedStyle = input.includeResolvedStyle
    ? summarizeResolvedStyles(svg, {
        targetElementId: input.elementId,
        compact: input.responseMode === "compact",
      })
    : undefined;
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
                  ...(pathNodes.normalize
                    ? { normalizedPathCount: pathNodes.describedPathCount }
                    : {}),
                }
              : {}),
            ...(resolvedStyle
              ? {
                  resolvedStyleElementCount: resolvedStyle.elementCount,
                  styledElementCount: resolvedStyle.styledElementCount,
                  resolvedStylePropertyCount: resolvedStyle.propertyCount,
                  unsupportedStyleFeatureCount: resolvedStyle.unsupportedFeatureCount,
                }
              : {}),
          },
          ...(pathNodes ? { pathNodes } : {}),
          ...(resolvedStyle ? { resolvedStyle } : {}),
        }
      : {
          ok: true,
          responseMode: input.responseMode,
          document: documentSummary,
          tree,
          ...(dependencySummary ? { dependencies: dependencySummary } : {}),
          ...(pathNodes ? { pathNodes } : {}),
          ...(resolvedStyle ? { resolvedStyle } : {}),
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

function verifyApplyPreviewBaseline(
  explicitBaseline: { revision: number; contentHash: string } | undefined,
  artifactBaseline: { revision: number; contentHash: string } | undefined,
  current: { revision: number; contentHash: string },
): { revision: number; contentHash: string } {
  if (explicitBaseline && artifactBaseline && !sameBaseline(explicitBaseline, artifactBaseline)) {
    throw new InkMcpError("INVALID_INPUT", "Explicit baseline does not match the operation preview artifact baseline.", {
      explicitBaseline,
      artifactBaseline,
    });
  }

  const baseline = explicitBaseline ?? artifactBaseline;
  if (!baseline) {
    throw new InkMcpError("INVALID_INPUT", "apply_operation_preview requires a baseline because the preview artifact is unguarded.", {
      required: ["baseline.revision", "baseline.contentHash"],
    });
  }
  if (!sameBaseline(baseline, current)) {
    throw new InkMcpError("SYNC_CONFLICT", "Apply-preview baseline does not match the current document state.", {
      baseline,
      current: {
        revision: current.revision,
        contentHash: current.contentHash,
      },
    });
  }
  return baseline;
}

function sameBaseline(
  left: { revision: number; contentHash: string },
  right: { revision: number; contentHash: string },
): boolean {
  return left.revision === right.revision && left.contentHash === right.contentHash;
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

async function maybeSaveOperationPreview(input: {
  ctx: ToolContext;
  docId: string;
  toolName: "preview_svg_operations" | "replay_operations";
  savePreview?: boolean;
  previewLabel?: string;
  candidateSvg: string;
  diff: SvgOperationDiff;
  operationCount: number;
  responseMode: "compact" | "full";
  previewChangedElementIds: string[];
  baseline?: { revision: number; contentHash: string };
}) {
  if (!input.savePreview) return {};
  return {
    operationPreview: await input.ctx.workspace.writeOperationPreviewArtifact({
      docId: input.docId,
      toolName: input.toolName,
      candidateSvg: input.candidateSvg,
      diff: input.diff,
      operationCount: input.operationCount,
      responseMode: input.responseMode,
      previewChangedElementIds: input.previewChangedElementIds,
      ...(input.previewLabel ? { label: input.previewLabel } : {}),
      ...(input.baseline ? { baseline: input.baseline } : {}),
    }),
  };
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
  const saved = await maybeSaveOperationPreview({
    ctx,
    docId: input.docId,
    toolName: "preview_svg_operations",
    savePreview: input.savePreview,
    previewLabel: input.previewLabel,
    candidateSvg: preview.svg,
    diff,
    operationCount: input.operations.length,
    responseMode: input.responseMode,
    previewChangedElementIds: preview.result.changedElementIds,
  });
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
    ...saved,
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
    const saved = await maybeSaveOperationPreview({
      ctx,
      docId: input.docId,
      toolName: "replay_operations",
      savePreview: input.savePreview,
      previewLabel: input.previewLabel,
      candidateSvg: preview.svg,
      diff,
      operationCount: input.operations.length,
      responseMode: input.responseMode,
      previewChangedElementIds: preview.result.changedElementIds,
      ...(input.baseline ? { baseline: input.baseline } : {}),
    });
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
      ...saved,
      ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
      ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
    };
  }

  if (input.savePreview || input.previewLabel) {
    throw new InkMcpError("INVALID_INPUT", "replay_operations savePreview is only valid with dryRun: true.", {
      dryRunRequired: true,
    });
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

export async function listOperationPreviews(input: z.infer<typeof listOperationPreviewsSchema>, ctx: ToolContext) {
  return {
    ok: true,
    docId: input.docId,
    previews: await ctx.workspace.listOperationPreviews(input.docId),
  };
}

export async function readOperationPreview(input: z.infer<typeof readOperationPreviewSchema>, ctx: ToolContext) {
  const artifact = await ctx.workspace.readOperationPreview(input.docId, input.previewId);
  const metadata = artifact.metadata;
  return {
    ok: true,
    docId: input.docId,
    previewId: input.previewId,
    metadata: {
      previewId: metadata.previewId,
      docId: metadata.docId,
      toolName: metadata.toolName,
      generatedAt: metadata.generatedAt,
      ...(metadata.label ? { label: metadata.label } : {}),
      operationCount: metadata.operationCount,
      responseMode: metadata.responseMode,
      ...(metadata.baseline ? { baseline: metadata.baseline } : {}),
      dryRun: true,
      svgPath: metadata.svgPath,
      metadataPath: metadata.metadataPath,
      summary: metadata.summary,
      addedElementIds: metadata.addedElementIds,
      removedElementIds: metadata.removedElementIds,
      changedElementIds: metadata.changedElementIds,
      previewChangedElementIds: metadata.previewChangedElementIds,
    },
    diff: metadata.diff,
    ...(input.includeSvg ? { svg: artifact.svg } : {}),
  };
}

export async function applyOperationPreview(input: z.infer<typeof applyOperationPreviewSchema>, ctx: ToolContext) {
  if (!input.confirmApplyPreview) {
    throw new InkMcpError("INVALID_INPUT", "apply_operation_preview requires confirmApplyPreview: true.", {
      requiredFlag: "confirmApplyPreview",
    });
  }

  const artifact = await ctx.workspace.readOperationPreview(input.docId, input.previewId);
  if (
    artifact.metadata.dryRun !== true ||
    !["preview_svg_operations", "replay_operations"].includes(artifact.metadata.toolName)
  ) {
    throw new InkMcpError("INVALID_INPUT", "Operation preview artifact is not an applyable dry-run preview.", {
      previewId: input.previewId,
      toolName: artifact.metadata.toolName,
      dryRun: artifact.metadata.dryRun,
    });
  }

  await prePullBeforeCurrentStateWrite(ctx, input.docId, "apply_operation_preview");
  const currentMetadata = await ctx.workspace.readMetadata(input.docId);
  const baseline = verifyApplyPreviewBaseline(input.baseline, artifact.metadata.baseline, currentMetadata);
  const write = await ctx.workspace.writeSvgWithSnapshot(
    input.docId,
    "apply_operation_preview",
    (currentSvg) => {
      const diff = diffSvgDocuments(currentSvg, artifact.svg);
      return { svg: artifact.svg, result: { diff } };
    },
    {
      beforeSnapshot: async () => {
        const metadata = await ctx.workspace.readMetadata(input.docId);
        verifyApplyPreviewBaseline(input.baseline, artifact.metadata.baseline, metadata);
      },
    },
  );
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "apply_operation_preview",
    inputSummary: {
      previewId: artifact.metadata.previewId,
      previewToolName: artifact.metadata.toolName,
      operationCount: artifact.metadata.operationCount,
      baselineRevision: baseline.revision,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  const compact = {
    ok: true,
    docId: input.docId,
    previewId: artifact.metadata.previewId,
    responseMode: "compact" as const,
    applied: true,
    previewToolName: artifact.metadata.toolName,
    operationCount: artifact.metadata.operationCount,
    baseline,
    summary: write.result.diff.summary,
    addedElementIds: write.result.diff.addedElementIds,
    removedElementIds: write.result.diff.removedElementIds,
    changedElementIds: write.result.diff.changedElementIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
  const payload =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          diff: write.result.diff,
        }
      : compact;
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

export async function proposeIdRepairs(input: z.infer<typeof proposeIdRepairsSchema>, ctx: ToolContext) {
  const prePull = await prePullBeforeCurrentStateRead(ctx, input.docId, {
    toolName: "propose_id_repairs",
    skipPrePull: input.skipPrePull,
    allowStaleRead: input.allowStaleRead,
  });
  const baseline = await ctx.workspace.readHistorySnapshot(input.docId, input.baselineSnapshotId);
  const currentSvg = await ctx.workspace.readSvg(input.docId);
  const result = proposeIdRepairsFromSvg({
    baselineSvg: baseline.svg,
    currentSvg,
    minConfidence: input.minConfidence,
  });
  const compact = compactIdRepairProposal(input.docId, baseline, result, input.includeRejected);
  const response =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          proposals: result.proposals,
          ...(input.includeRejected ? { rejected: result.rejected } : {}),
        }
      : compact;

  return {
    ...response,
    ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
    ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
  };
}

export async function applyIdRepairs(input: z.infer<typeof applyIdRepairsSchema>, ctx: ToolContext) {
  if (!input.confirmApplyRepairs) {
    throw new InkMcpError("INVALID_INPUT", "apply_id_repairs requires confirmApplyRepairs: true.", {
      requiredFlag: "confirmApplyRepairs",
    });
  }

  await prePullBeforeCurrentStateWrite(ctx, input.docId, "apply_id_repairs");
  let prepared: IdRepairApplyResult | undefined;
  const write = await ctx.workspace.writeSvgWithSnapshot(
    input.docId,
    "apply_id_repairs",
    (currentSvg) => {
      const applied = prepared ?? applyIdRepairsToSvg({
        currentSvg,
        repairs: input.repairs,
      });
      const diff = diffSvgDocuments(currentSvg, applied.svg);
      return {
        svg: applied.svg,
        result: {
          ...applied,
          diff,
        },
      };
    },
    {
      beforeSnapshot: (currentSvg) => {
        prepared = applyIdRepairsToSvg({
          currentSvg,
          repairs: input.repairs,
        });
      },
    },
  );
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "apply_id_repairs",
    inputSummary: {
      repairCount: input.repairs.length,
      repairedElementIds: write.result.repairedElementIds,
      rewrittenReferenceCount: write.result.rewrittenReferenceCount,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, write.paths);
  const compact = {
    ok: true,
    docId: input.docId,
    responseMode: "compact" as const,
    applied: true,
    repairCount: write.result.appliedRepairs.length,
    appliedRepairs: write.result.appliedRepairs,
    repairedElementIds: write.result.repairedElementIds,
    rewrittenReferenceCount: write.result.rewrittenReferenceCount,
    summary: write.result.diff.summary,
    addedElementIds: write.result.diff.addedElementIds,
    removedElementIds: write.result.diff.removedElementIds,
    changedElementIds: write.result.diff.changedElementIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
  const payload =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          diff: write.result.diff,
        }
      : compact;
  return withGuiRefreshResult(withWriteDiagnostics(payload, write), refresh);
}

function compactIdRepairProposal(
  docId: string,
  baseline: { snapshotId: string; path: string },
  result: IdRepairProposalResult,
  includeRejected: boolean,
) {
  return {
    ok: true,
    docId,
    responseMode: "compact" as const,
    generatedAt: result.generatedAt,
    baselineSnapshot: {
      snapshotId: baseline.snapshotId,
      path: baseline.path,
    },
    minConfidence: result.minConfidence,
    summary: result.summary,
    proposals: result.proposals.map((proposal) => ({
      baselineElementId: proposal.baselineElementId,
      proposedElementId: proposal.proposedElementId,
      confidence: proposal.confidence,
      reasons: proposal.reasons,
      candidateCount: proposal.candidateCount,
    })),
    ...(includeRejected
      ? {
          rejected: result.rejected.map((proposal) => ({
            baselineElementId: proposal.baselineElementId,
            rejectReason: proposal.rejectReason,
            topScore: proposal.topScore,
            candidateCount: proposal.candidateCount,
            candidates: proposal.candidates.map((candidate) => ({
              elementId: candidate.elementId,
              score: candidate.score,
              reasons: candidate.reasons,
            })),
          })),
        }
      : {}),
  };
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
  const resolvedRecovery = await resolveRecoverySnapshot(input, ctx);
  const result = await ctx.workspace.rollback(input.docId, resolvedRecovery.snapshotId, "recover_document");
  await appendOperationLog(result.paths, {
    level: "info",
    docId: input.docId,
    toolName: "recover_document",
    inputSummary: {
      snapshotId: resolvedRecovery.snapshotId,
      ...(resolvedRecovery.strategy ? { strategy: resolvedRecovery.strategy } : {}),
    },
    snapshotPath: result.snapshotPath,
    status: "ok",
  });
  const refresh = await tryAutoRefreshInInkscape(ctx, result.paths);
  return withGuiRefreshResult({
    ok: true,
    docId: input.docId,
    recoveredFromSnapshotId: resolvedRecovery.snapshotId,
    ...(resolvedRecovery.strategy ? { strategy: resolvedRecovery.strategy } : {}),
    preRecoverySnapshotPath: result.snapshotPath,
    restoredPath: result.restoredPath,
    currentSvgPath: result.paths.currentSvg,
  }, refresh);
}

async function resolveRecoverySnapshot(
  input: z.infer<typeof recoverDocumentSchema>,
  ctx: ToolContext,
): Promise<{ snapshotId: string; strategy?: "last_snapshot" | "last_successful_write" }> {
  if (input.snapshotId) {
    return { snapshotId: input.snapshotId };
  }
  if (input.strategy === "last_snapshot") {
    const history = await ctx.workspace.listHistory(input.docId);
    const latest = latestHistorySnapshot(history);
    if (!latest) {
      throw new InkMcpError("DOC_NOT_FOUND", "No history snapshot is available for recovery.", {
        strategy: input.strategy,
      });
    }
    return { snapshotId: latest.snapshotId, strategy: input.strategy };
  }
  if (input.strategy === "last_successful_write") {
    const latest = await ctx.workspace.findLastSuccessfulWriteSnapshot(input.docId);
    if (!latest) {
      throw new InkMcpError("DOC_NOT_FOUND", "No successful write snapshot is available for recovery.", {
        strategy: input.strategy,
      });
    }
    return { snapshotId: latest.snapshotId, strategy: input.strategy };
  }
  throw new InkMcpError("INVALID_INPUT", "Provide either snapshotId or a supported recovery strategy.");
}

function latestHistorySnapshot<T extends { snapshotId: string; createdAt: string }>(history: T[]): T | undefined {
  return history.reduce<T | undefined>((latest, snapshot) => {
    if (!latest) return snapshot;
    const byCreatedAt = snapshot.createdAt.localeCompare(latest.createdAt);
    if (byCreatedAt > 0) return snapshot;
    if (byCreatedAt === 0 && snapshot.snapshotId.localeCompare(latest.snapshotId) > 0) return snapshot;
    return latest;
  }, undefined);
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
