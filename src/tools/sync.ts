import * as z from "zod/v4";
import { randomUUID } from "node:crypto";

import type {
  ConnectionCapabilitySummary,
  ConnectionConfig,
  ConnectionIdentitySummary,
  DocumentPaths,
  GuiPullManifest,
  StoredMetadata,
} from "../adapters/workspace.js";
import { appendOperationLog } from "../logging/operation-log.js";
import {
  applyMergePreviewSchema,
  connectInkscapeWindowSchema,
  disconnectInkscapeWindowSchema,
  getGuiSyncStatusSchema,
  listMergePreviewsSchema,
  pullGuiStateSchema,
  readMergePreviewSchema,
  startGuiSyncPollingSchema,
  stopGuiSyncPollingSchema,
} from "../core/validation.js";
import { InkMcpError, toErrorPayload } from "../core/errors.js";
import { diffSvgDocuments } from "../core/svg-diff.js";
import {
  contentHash,
  createConnectionId,
  diffElementIds,
  injectInkMcpMarker,
  normalizeSvg,
  readInkMcpMarker,
  requireInkMcpMarker,
  type ElementIdDiff,
  type InkMcpSvgMarker,
} from "../core/sync-metadata.js";
import { mergeNonOverlappingSvgChanges, type SvgMergeResult } from "../core/svg-merge.js";
import type { ToolContext } from "./context.js";

const defaultConnectionTtlMs = 10 * 60 * 1000;
const defaultPollingIntervalMs = 1_000;
type WriteConflictPolicy = "reject" | "prefer_gui" | "prefer_workspace" | "merge_non_overlapping";

export interface GuiSyncPollStatus {
  pollingId: string;
  generation: number;
  docId: string;
  connectionId: string;
  state: "running" | "stopped";
  intervalMs: number;
  timeoutMs?: number;
  startedAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastSkippedAt?: string;
  lastConflictAt?: string;
  lastErrorAt?: string;
  inFlight: boolean;
  pullCount: number;
  skippedPullCount: number;
  conflictCount: number;
  errorCount: number;
  consecutiveErrorCount: number;
  backoffUntil?: string;
  persistent: boolean;
  lastPull?: Record<string, unknown>;
  lastSkip?: Record<string, unknown>;
  lastConflict?: Record<string, unknown>;
  lastError?: Record<string, unknown>;
  identitySummary?: ConnectionIdentitySummary;
  capabilitySummary?: ConnectionCapabilitySummary;
}

interface GuiSyncPollEntry {
  status: GuiSyncPollStatus;
  timer: NodeJS.Timeout;
}

export interface GuiSyncPollRegistry {
  entries: Map<string, GuiSyncPollEntry>;
  persistedLoaded: boolean;
  nextGeneration: number;
}

export function createGuiSyncPollRegistry(): GuiSyncPollRegistry {
  return { entries: new Map(), persistedLoaded: false, nextGeneration: 1 };
}

export async function connectInkscapeWindow(input: z.infer<typeof connectInkscapeWindowSchema>, ctx: ToolContext) {
  const syncMode = input.syncMode ?? "display_only";
  const metadata = await ctx.workspace.readMetadata(input.docId);
  const existingConnections = await ctx.workspace.findConnectionsForDoc(input.docId);
  const activeBidirectional = existingConnections.filter((connection) => isConnectionActive(connection) && connection.syncMode === "bidirectional");
  if (syncMode === "bidirectional") {
    validateNewBidirectionalConnectionIdentity(input, activeBidirectional);
  }
  if (input.inferredDocId && input.inferredDocId !== input.docId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "Inferred document id does not match the requested document id.", {
      docId: input.docId,
      inferredDocId: input.inferredDocId,
    });
  }

  const now = new Date();
  const connectionId = input.connectionId ?? createConnectionId();
  const connection: ConnectionConfig = {
    connectionId,
    docId: input.docId,
    syncMode,
    documentPath: input.documentPath,
    inferredDocId: input.inferredDocId,
    runtimeDocumentId: input.runtimeDocumentId,
    windowId: input.windowId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + defaultConnectionTtlMs).toISOString(),
    baselineRevision: metadata.revision,
    baselineContentHash: metadata.contentHash,
    state: "connected",
  };
  connection.identitySummary = buildIdentitySummary(connection);
  connection.capabilitySummary = buildCapabilitySummary(connection);

  const write = await ctx.workspace.writeSvgWithSnapshot(input.docId, "connect_inkscape_window", (currentSvg) => ({
    svg: injectInkMcpMarker(currentSvg, {
      connectionId,
      docId: input.docId,
      syncMode,
      documentPath: input.documentPath,
      inferredDocId: input.inferredDocId,
      runtimeDocumentId: input.runtimeDocumentId,
      windowId: input.windowId,
      updatedAt: now.toISOString(),
    }),
    result: {},
  }));
  const nextMetadata = await ctx.workspace.readMetadata(input.docId);
  const storedConnection = {
    ...connection,
    baselineRevision: nextMetadata.revision,
    baselineContentHash: nextMetadata.contentHash,
  };
  await ctx.workspace.writeConnection(storedConnection);
  await ctx.workspace.writeConnectionBaselineSvg(connectionId, await ctx.workspace.readSvg(input.docId));
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "connect_inkscape_window",
    inputSummary: { syncMode, connectionId, windowId: input.windowId },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const guiRefresh = await refreshConnectedWindow(ctx, input.docId, input.timeoutMs);
  const warnings = [write.operationDiffWarning, guiRefresh.warning].filter(Boolean);
  return {
    ok: true,
    docId: input.docId,
    connection: storedConnection,
    identitySummary: storedConnection.identitySummary,
    capabilitySummary: storedConnection.capabilitySummary,
    currentSvgPath: write.paths.currentSvg,
    snapshotPath: write.snapshotPath,
    ...(write.operationDiff ? { operationDiff: write.operationDiff } : {}),
    ...(guiRefresh.guiRefresh ? { guiRefresh: guiRefresh.guiRefresh } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function disconnectInkscapeWindow(input: z.infer<typeof disconnectInkscapeWindowSchema>, ctx: ToolContext) {
  const targets = input.connectionId
    ? [await ctx.workspace.readConnection(input.connectionId)]
    : await ctx.workspace.findConnectionsForDoc(input.docId as string);
  if (targets.length === 0) {
    throw new InkMcpError("SYNC_NOT_CONNECTED", "No active InkSMCP connection matched the disconnect request.", input);
  }
  const disconnected = await Promise.all(targets.map((connection) => ctx.workspace.disconnectConnection(connection.connectionId)));
  return {
    ok: true,
    disconnected: disconnected.map((connection) => ({
      connectionId: connection.connectionId,
      docId: connection.docId,
      syncMode: connection.syncMode,
      state: connection.state,
    })),
  };
}

export async function pullGuiState(input: z.infer<typeof pullGuiStateSchema>, ctx: ToolContext) {
  const connection = await resolveActiveConnection(ctx, input.docId, input.connectionId);
  if (connection.syncMode !== "bidirectional") {
    throw new InkMcpError("SYNC_NOT_CONNECTED", "Connection is not in bidirectional sync mode.", {
      connectionId: connection.connectionId,
      syncMode: connection.syncMode,
    });
  }

  const requestId = `pull-${randomUUID()}`;
  const beforeSvg = await ctx.workspace.readSvg(input.docId);
  const inkscape = await ctx.inkscape.pushGuiStateWithCompanionExtension({
    docId: input.docId,
    workspaceRoot: ctx.workspace.paths.root,
    connectionId: connection.connectionId,
    requestId,
    syncMode: connection.syncMode,
    runtimeDocumentId: connection.runtimeDocumentId,
    windowId: connection.windowId,
    timeoutMs: input.timeoutMs,
  });
  const manifest = await ctx.workspace.readGuiPullManifest(requestId);
  validatePullManifest(manifest, connection, requestId);
  const rawPulledSvg = await ctx.workspace.readGuiPullSvg(requestId);
  const marker = requireInkMcpMarker(rawPulledSvg, { connectionId: connection.connectionId, docId: input.docId });
  validateMarkerIdentity(marker, connection);
  const pulledSvg = normalizeSvg(rawPulledSvg);
  const idDiff = diffElementIds(beforeSvg, pulledSvg);
  const conflictReport = await buildConflictReport(ctx, connection, beforeSvg, pulledSvg, idDiff);
  const merge = await prepareMergeCandidate(ctx, connection, beforeSvg, pulledSvg, conflictReport.hasConflict, input.conflictPolicy);
  const preview = input.conflictPolicy === "preview_only"
    ? await createGuiPullPreviewArtifact(ctx, input.docId, requestId, pulledSvg, idDiff, conflictReport, merge)
    : undefined;
  if (preview) {
    return {
      ok: true,
      docId: input.docId,
      connectionId: connection.connectionId,
      requestId,
      wrote: false,
      pullStatus: preview.status,
      currentSvgPath: ctx.workspace.documentPaths(input.docId).currentSvg,
      rawPulledSvgPath: ctx.workspace.guiPullSvgPath(requestId),
      manifestPath: ctx.workspace.guiPullManifestPath(requestId),
      idDiff,
      ...(conflictReport.hasConflict ? { conflictReport } : {}),
      ...(merge ? { merge } : {}),
      ...(preview.artifact ? { mergePreview: preview.artifact } : {}),
      inkscape: { binaryPath: inkscape.binaryPath, exitCode: inkscape.exitCode },
    };
  }
  if (input.conflictPolicy === "merge_non_overlapping" && merge && !merge.ok) {
    throw new InkMcpError("SYNC_CONFLICT", "GUI and workspace changes overlap and cannot be merged automatically.", {
      conflictReport,
      merge,
    });
  }
  const candidateSvg = merge?.ok && merge.svg ? merge.svg : pulledSvg;
  const writePolicy: WriteConflictPolicy = input.conflictPolicy === "merge_non_overlapping" && merge?.ok
    ? "merge_non_overlapping"
    : input.conflictPolicy === "prefer_gui"
      ? "prefer_gui"
      : input.conflictPolicy === "prefer_workspace"
        ? "prefer_workspace"
        : "reject";

  let write: {
    paths: DocumentPaths;
    snapshotPath: string;
    result: { idDiff: typeof idDiff };
    wrote: boolean;
    operationDiff?: { path: string; generatedAt: string; summary: Record<string, unknown> };
    operationDiffWarning?: Record<string, unknown>;
  };
  try {
    write = await ctx.workspace.writeGuiPulledSvgWithSnapshot(
      input.docId,
      "pull_gui_state",
      { revision: connection.baselineRevision, contentHash: connection.baselineContentHash },
      writePolicy,
      candidateSvg,
      { idDiff },
    );
  } catch (error) {
    if (error instanceof InkMcpError && error.code === "SYNC_CONFLICT") {
      throw new InkMcpError(error.code, error.message, {
        ...error.details,
        conflictReport,
        ...(merge ? { merge } : {}),
      });
    }
    throw error;
  }

  const nextMetadata = await ctx.workspace.readMetadata(input.docId);
  const nextConnection: ConnectionConfig = {
    ...connection,
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    lastPulledAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + defaultConnectionTtlMs).toISOString(),
    baselineRevision: nextMetadata.revision,
    baselineContentHash: nextMetadata.contentHash,
  };
  await ctx.workspace.writeConnection(nextConnection);
  await ctx.workspace.writeConnectionBaselineSvg(connection.connectionId, await ctx.workspace.readSvg(input.docId));
  if (write.wrote) {
    await appendOperationLog(write.paths, {
      level: "info",
      docId: input.docId,
      toolName: "pull_gui_state",
      inputSummary: { connectionId: connection.connectionId, conflictPolicy: input.conflictPolicy, requestId },
      snapshotPath: write.snapshotPath,
      status: "ok",
    });
  }
  const warnings = [
    ...(write.operationDiffWarning ? [write.operationDiffWarning] : []),
    ...(!write.wrote && input.conflictPolicy === "prefer_workspace"
      ? [
          {
            code: "SYNC_PREFER_WORKSPACE",
            message: "GUI state was validated but workspace state was kept due to conflictPolicy=prefer_workspace.",
          },
        ]
      : []),
  ];
  return {
    ok: true,
    docId: input.docId,
    connectionId: connection.connectionId,
    requestId,
    wrote: write.wrote,
    currentSvgPath: write.paths.currentSvg,
    snapshotPath: write.snapshotPath || undefined,
    ...(write.operationDiff ? { operationDiff: write.operationDiff } : {}),
    rawPulledSvgPath: ctx.workspace.guiPullSvgPath(requestId),
    manifestPath: ctx.workspace.guiPullManifestPath(requestId),
    idDiff,
    ...(conflictReport.hasConflict ? { conflictReport } : {}),
    ...(merge ? { merge } : {}),
    inkscape: { binaryPath: inkscape.binaryPath, exitCode: inkscape.exitCode },
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function startGuiSyncPolling(input: z.infer<typeof startGuiSyncPollingSchema>, ctx: ToolContext) {
  await ensurePersistedPollingLoaded(ctx);
  const connection = await resolveActiveConnection(ctx, input.docId, input.connectionId);
  if (connection.syncMode !== "bidirectional") {
    throw new InkMcpError("SYNC_NOT_CONNECTED", "Connection is not in bidirectional sync mode.", {
      connectionId: connection.connectionId,
      syncMode: connection.syncMode,
    });
  }
  const registry = getPollRegistry(ctx);
  const existing = registry.entries.get(connection.connectionId);
  if (existing?.status.state === "running") {
    return {
      ok: true,
      polling: clonePollStatus(existing.status),
      alreadyRunning: true,
    };
  }

  const intervalMs = input.intervalMs ?? positiveEnvInt("INKSMCP_GUI_POLL_INTERVAL_MS") ?? defaultPollingIntervalMs;
  const persistent = input.persist ?? false;
  const now = new Date().toISOString();
  const generation = nextPollGeneration(registry);
  const status: GuiSyncPollStatus = {
    pollingId: createConnectionId("poll"),
    generation,
    docId: connection.docId,
    connectionId: connection.connectionId,
    state: "running",
    intervalMs,
    timeoutMs: input.timeoutMs,
    startedAt: now,
    updatedAt: now,
    inFlight: false,
    pullCount: 0,
    skippedPullCount: 0,
    conflictCount: 0,
    errorCount: 0,
    consecutiveErrorCount: 0,
    persistent,
    identitySummary: connection.identitySummary ?? buildIdentitySummary(connection),
    capabilitySummary: connection.capabilitySummary ?? buildCapabilitySummary(connection),
  };
  const entry: GuiSyncPollEntry = {
    status,
    timer: setInterval(() => {
      void runPollingTick(ctx, connection.docId, connection.connectionId, generation);
    }, intervalMs),
  };
  entry.timer.unref?.();
  registry.entries.set(connection.connectionId, entry);
  if (persistent) {
    await ctx.workspace.writeGuiSyncPollingPreference({
      docId: connection.docId,
      connectionId: connection.connectionId,
      intervalMs,
      timeoutMs: input.timeoutMs,
      persist: true,
      createdAt: now,
      updatedAt: now,
      state: "enabled",
    });
  }
  void runPollingTick(ctx, connection.docId, connection.connectionId, generation);
  return {
    ok: true,
    polling: clonePollStatus(status),
    alreadyRunning: false,
  };
}

export async function stopGuiSyncPolling(input: z.infer<typeof stopGuiSyncPollingSchema>, ctx: ToolContext) {
  await ensurePersistedPollingLoaded(ctx);
  const registry = getPollRegistry(ctx);
  const targets = pollingTargets(registry, input);
  const stopped = await Promise.all(
    targets.map(async (entry) => {
      const status = stopPollEntry(registry, entry.status.connectionId);
      if (status.persistent) {
        await ctx.workspace.disableGuiSyncPollingPreference(entry.status.connectionId);
      }
      return status;
    }),
  );
  return {
    ok: true,
    stopped,
  };
}

export async function getGuiSyncStatus(input: z.infer<typeof getGuiSyncStatusSchema>, ctx: ToolContext) {
  await ensurePersistedPollingLoaded(ctx);
  const registry = getPollRegistry(ctx);
  const statuses = pollingTargets(registry, input).map((entry) => clonePollStatus(entry.status));
  const persistedPolling = input.includeHistory
    ? (await ctx.workspace.listGuiSyncPollingPreferences()).filter((preference) => {
        if (input.connectionId && preference.connectionId !== input.connectionId) return false;
        if (input.docId && preference.docId !== input.docId) return false;
        return true;
      })
    : undefined;
  return {
    ok: true,
    polling: statuses,
    ...(persistedPolling ? { persistedPolling } : {}),
  };
}

export async function listMergePreviews(input: z.infer<typeof listMergePreviewsSchema>, ctx: ToolContext) {
  return {
    ok: true,
    docId: input.docId,
    previews: await ctx.workspace.listGuiMergePreviews(input.docId),
  };
}

export async function readMergePreview(input: z.infer<typeof readMergePreviewSchema>, ctx: ToolContext) {
  const artifact = await ctx.workspace.readGuiMergePreview(input.docId, input.previewId);
  return {
    ok: true,
    docId: input.docId,
    previewId: input.previewId,
    metadata: artifact.metadata,
    ...(input.includeSvg ? { svg: artifact.svg } : {}),
  };
}

export async function applyMergePreview(input: z.infer<typeof applyMergePreviewSchema>, ctx: ToolContext) {
  if (!input.confirmApplyPreview) {
    throw new InkMcpError("INVALID_INPUT", "apply_merge_preview requires confirmApplyPreview: true.", {
      requiredFlag: "confirmApplyPreview",
    });
  }

  const artifact = await ctx.workspace.readGuiMergePreview(input.docId, input.previewId);
  await prePullGuiStateForTool(ctx, input.docId, { toolName: "apply_merge_preview" });
  const currentMetadata = await ctx.workspace.readMetadata(input.docId);
  const baseline = verifyApplyMergePreviewBaseline(input.baseline, artifact.metadata.baseline, currentMetadata);
  const write = await ctx.workspace.writeGuiMergePreviewWithSnapshot(
    input.docId,
    artifact.metadata.previewId,
    baseline,
    artifact.svg,
    (currentSvg, nextSvg) => ({ diff: diffSvgDocuments(currentSvg, nextSvg) }),
    {
      beforeSnapshot: async () => {
        const metadata = await ctx.workspace.readMetadata(input.docId);
        verifyApplyMergePreviewBaseline(input.baseline, artifact.metadata.baseline, metadata);
      },
    },
  );
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "apply_merge_preview",
    inputSummary: {
      previewId: artifact.metadata.previewId,
      candidateKind: artifact.metadata.candidateKind,
      status: artifact.metadata.status,
      baselineRevision: baseline.revision,
    },
    snapshotPath: write.snapshotPath,
    status: "ok",
  });
  const refresh = await refreshAppliedMergePreview(ctx, write.paths);
  const diff = write.result.diff as ReturnType<typeof diffSvgDocuments>;
  const compact = {
    ok: true,
    docId: input.docId,
    previewId: artifact.metadata.previewId,
    responseMode: "compact" as const,
    applied: true,
    candidateKind: artifact.metadata.candidateKind,
    previewStatus: artifact.metadata.status,
    baseline,
    summary: diff.summary,
    addedElementIds: diff.addedElementIds,
    removedElementIds: diff.removedElementIds,
    changedElementIds: diff.changedElementIds,
    snapshotPath: write.snapshotPath,
    currentSvgPath: write.paths.currentSvg,
  };
  const payload =
    input.responseMode === "full"
      ? {
          ...compact,
          responseMode: "full" as const,
          diff,
        }
      : compact;
  return withLocalGuiRefreshResult(withLocalWriteDiagnostics(payload, write), refresh);
}

export async function prePullGuiStateForTool(
  ctx: ToolContext,
  docId: string,
  options: {
    toolName: string;
    readOnly?: boolean;
    skipPrePull?: boolean;
    allowStaleRead?: boolean;
    timeoutMs?: number;
    staleOkByDefault?: boolean;
  },
): Promise<{ warning?: Record<string, unknown>; pulled?: Record<string, unknown> }> {
  const connection = await activeBidirectionalConnectionForDoc(ctx, docId);
  if (!connection) return {};
  if (options.skipPrePull && options.readOnly) return {};
  if (shouldSkipForTtl(connection)) return {};

  try {
    const result = await pullGuiState(
      {
        docId,
        connectionId: connection.connectionId,
        conflictPolicy: "reject",
        timeoutMs: options.timeoutMs,
      },
      ctx,
    );
    return {
      pulled: {
        connectionId: connection.connectionId,
        requestId: result.requestId,
        wrote: result.wrote,
        idDiff: result.idDiff,
      },
    };
  } catch (error) {
    if (options.staleOkByDefault || (options.readOnly && options.allowStaleRead)) {
      return {
        warning: {
          code: "GUI_PRE_PULL_FAILED_STALE_READ",
          message: `${options.toolName} used stale workspace state because GUI pre-pull failed.`,
          details: error instanceof InkMcpError ? { code: error.code, message: error.message, details: error.details } : { message: String(error) },
        },
      };
    }
    throw error;
  }
}

export async function ensureNoActiveBidirectionalConnectionForRollback(ctx: ToolContext, docId: string): Promise<void> {
  const connection = await activeBidirectionalConnectionForDoc(ctx, docId);
  if (connection) {
    throw new InkMcpError("SYNC_CONFLICT", "rollback_document would discard active GUI state. Confirm discard explicitly to continue.", {
      docId,
      connectionId: connection.connectionId,
      requiredFlag: "confirmDiscardGuiState",
    });
  }
}

export async function updateActiveConnectionBaselineAfterMcpWrite(ctx: ToolContext, docId: string): Promise<void> {
  const connection = await activeBidirectionalConnectionForDoc(ctx, docId);
  if (!connection) return;
  const metadata = await ctx.workspace.readMetadata(docId);
  await ctx.workspace.writeConnection({
    ...connection,
    updatedAt: new Date().toISOString(),
    baselineRevision: metadata.revision,
    baselineContentHash: metadata.contentHash,
  });
}

async function resolveActiveConnection(ctx: ToolContext, docId: string, connectionId?: string): Promise<ConnectionConfig> {
  if (connectionId) {
    const connection = await ctx.workspace.readConnection(connectionId);
    if (connection.docId !== docId || connection.state !== "connected" || !isConnectionActive(connection)) {
      throw new InkMcpError("SYNC_NOT_CONNECTED", "Connection is not active for the requested document.", {
        docId,
        connectionId,
      });
    }
    return connection;
  }
  const active = (await ctx.workspace.findConnectionsForDoc(docId)).filter(isConnectionActive);
  const bidirectional = active.filter((connection) => connection.syncMode === "bidirectional");
  if (bidirectional.length === 0) {
    throw new InkMcpError("SYNC_NOT_CONNECTED", "No active bidirectional InkSMCP connection was found.", { docId });
  }
  if (bidirectional.length > 1) {
    throw new InkMcpError("SYNC_CONFLICT", "Multiple active bidirectional connections target this document.", {
      docId,
      connectionIds: bidirectional.map((connection) => connection.connectionId),
    });
  }
  return bidirectional[0] as ConnectionConfig;
}

async function activeBidirectionalConnectionForDoc(ctx: ToolContext, docId: string): Promise<ConnectionConfig | undefined> {
  const active = (await ctx.workspace.findConnectionsForDoc(docId)).filter(isConnectionActive);
  const bidirectional = active.filter((connection) => connection.syncMode === "bidirectional");
  if (bidirectional.length > 1) {
    throw new InkMcpError("SYNC_CONFLICT", "Multiple active bidirectional connections target this document.", {
      docId,
      connectionIds: bidirectional.map((connection) => connection.connectionId),
    });
  }
  return bidirectional[0];
}

function validateNewBidirectionalConnectionIdentity(
  input: z.infer<typeof connectInkscapeWindowSchema>,
  activeBidirectional: ConnectionConfig[],
): void {
  if (activeBidirectional.length === 0) return;
  if (!input.windowId && !input.runtimeDocumentId) {
    throw new InkMcpError("SYNC_CONFLICT", "A bidirectional connection is already active; provide windowId or runtimeDocumentId to disambiguate.", {
      docId: input.docId,
      activeConnections: activeBidirectional.map(connectionIdentitySummary),
    });
  }
  const duplicate = activeBidirectional.find((connection) => sameRuntimeIdentity(input, connection));
  if (duplicate) {
    throw new InkMcpError("SYNC_CONFLICT", "A bidirectional connection is already active for this runtime window identity.", {
      docId: input.docId,
      activeConnection: connectionIdentitySummary(duplicate),
    });
  }
}

function sameRuntimeIdentity(input: z.infer<typeof connectInkscapeWindowSchema>, connection: ConnectionConfig): boolean {
  const windowMatches = input.windowId && connection.windowId && input.windowId === connection.windowId;
  const runtimeMatches =
    input.runtimeDocumentId &&
    connection.runtimeDocumentId &&
    input.runtimeDocumentId === connection.runtimeDocumentId;
  return Boolean(windowMatches || runtimeMatches);
}

function validateMarkerIdentity(marker: InkMcpSvgMarker, connection: ConnectionConfig): void {
  if (connection.runtimeDocumentId && marker.runtimeDocumentId !== connection.runtimeDocumentId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "Pulled SVG runtime document id does not match the active connection.", {
      expected: { runtimeDocumentId: connection.runtimeDocumentId },
      actual: { runtimeDocumentId: marker.runtimeDocumentId },
    });
  }
  if (connection.windowId && marker.windowId !== connection.windowId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "Pulled SVG window id does not match the active connection.", {
      expected: { windowId: connection.windowId },
      actual: { windowId: marker.windowId },
    });
  }
}

async function buildConflictReport(
  ctx: ToolContext,
  connection: ConnectionConfig,
  beforeSvg: string,
  pulledSvg: string,
  idDiff: ElementIdDiff,
): Promise<Record<string, unknown> & { hasConflict: boolean }> {
  const current = await ctx.workspace.readMetadata(connection.docId);
  const hasConflict =
    current.revision !== connection.baselineRevision || current.contentHash !== connection.baselineContentHash;
  return {
    hasConflict,
    docId: connection.docId,
    connection: connectionIdentitySummary(connection),
    baseline: {
      revision: connection.baselineRevision,
      contentHash: connection.baselineContentHash,
    },
    workspace: metadataConflictSummary(current),
    guiCandidate: {
      contentHash: contentHash(pulledSvg),
      idDiff,
    },
    workspaceSincePullStart: {
      contentHash: contentHash(beforeSvg),
    },
    suggestions: hasConflict
      ? [
          "Use conflictPolicy=prefer_gui only when GUI state should replace newer workspace edits.",
          "Use conflictPolicy=prefer_workspace to validate identity but keep workspace state.",
          "Run query_document or pull_gui_state after resolving the conflicting edit source.",
        ]
      : [],
  };
}

async function prepareMergeCandidate(
  ctx: ToolContext,
  connection: ConnectionConfig,
  workspaceSvg: string,
  pulledSvg: string,
  hasConflict: boolean,
  conflictPolicy: z.infer<typeof pullGuiStateSchema>["conflictPolicy"],
): Promise<(SvgMergeResult & { strategy: "merge_non_overlapping" }) | undefined> {
  if (!hasConflict || (conflictPolicy !== "merge_non_overlapping" && conflictPolicy !== "preview_only")) return undefined;
  const baselineSvg = await ctx.workspace.readConnectionBaselineSvg(connection.connectionId);
  const merge = mergeNonOverlappingSvgChanges({
    baselineSvg,
    workspaceSvg,
    guiSvg: pulledSvg,
  });
  return {
    ...merge,
    strategy: "merge_non_overlapping",
  };
}

async function createGuiPullPreviewArtifact(
  ctx: ToolContext,
  docId: string,
  requestId: string,
  pulledSvg: string,
  idDiff: ElementIdDiff,
  conflictReport: Record<string, unknown> & { hasConflict: boolean },
  merge?: SvgMergeResult & { strategy: "merge_non_overlapping" },
): Promise<{
  status: "clean" | "previewable" | "conflict_only";
  artifact?: import("../adapters/workspace.js").GuiMergePreviewArtifact;
}> {
  const metadata = await ctx.workspace.readMetadata(docId);
  const baseline = { revision: metadata.revision, contentHash: metadata.contentHash };
  if (!conflictReport.hasConflict) {
    const artifact = await ctx.workspace.writeGuiMergePreviewArtifact({
      docId,
      requestId,
      svg: pulledSvg,
      status: "clean",
      candidateKind: "pulled_gui",
      baseline,
      summary: {
        requestId,
        idDiff,
        guiCandidate: conflictReport.guiCandidate,
      },
    });
    return { status: "clean", artifact };
  }

  if (merge?.ok && merge.svg) {
    const artifact = await ctx.workspace.writeGuiMergePreviewArtifact({
      docId,
      requestId,
      svg: merge.svg,
      status: "previewable",
      candidateKind: "merge_non_overlapping",
      baseline,
      summary: {
        requestId,
        idDiff,
        merge: {
          strategy: merge.strategy,
          appliedElementIds: merge.appliedElementIds,
        },
        conflictReport,
      },
    });
    return { status: "previewable", artifact };
  }

  return { status: "conflict_only" };
}

function metadataConflictSummary(metadata: StoredMetadata): Record<string, unknown> {
  return {
    revision: metadata.revision,
    contentHash: metadata.contentHash,
    lastWriter: metadata.lastWriter,
    updatedAt: metadata.updatedAt,
    ...(metadata.lastGuiPullAt ? { lastGuiPullAt: metadata.lastGuiPullAt } : {}),
  };
}

function connectionIdentitySummary(connection: Pick<ConnectionConfig, "connectionId" | "docId" | "runtimeDocumentId" | "windowId" | "syncMode">) {
  return {
    connectionId: connection.connectionId,
    docId: connection.docId,
    syncMode: connection.syncMode,
    ...(connection.runtimeDocumentId ? { runtimeDocumentId: connection.runtimeDocumentId } : {}),
    ...(connection.windowId ? { windowId: connection.windowId } : {}),
  };
}

export function buildIdentitySummary(
  connection: Pick<ConnectionConfig, "connectionId" | "runtimeDocumentId" | "windowId">,
): ConnectionIdentitySummary {
  const hasRuntimeDocumentId = Boolean(connection.runtimeDocumentId);
  const hasWindowId = Boolean(connection.windowId);
  return {
    strength: hasRuntimeDocumentId && hasWindowId ? "full" : hasWindowId ? "window" : hasRuntimeDocumentId ? "runtime_document" : "connection_only",
    hasConnectionId: Boolean(connection.connectionId),
    hasRuntimeDocumentId,
    hasWindowId,
    ambiguous: !hasRuntimeDocumentId && !hasWindowId,
  };
}

export function buildCapabilitySummary(connection: Pick<ConnectionConfig, "syncMode">): ConnectionCapabilitySummary {
  return {
    companionRefresh: "available_assumed",
    guiPull: connection.syncMode === "bidirectional" ? "available_assumed" : "not_applicable",
    guiPush: connection.syncMode === "bidirectional" ? "available_assumed" : "not_applicable",
    sameWindowRefresh: "available_assumed",
    manifestVersion: 1,
  };
}

function getPollRegistry(ctx: ToolContext): GuiSyncPollRegistry {
  if (!ctx.guiSyncPolling) {
    ctx.guiSyncPolling = createGuiSyncPollRegistry();
  }
  return ctx.guiSyncPolling;
}

async function ensurePersistedPollingLoaded(ctx: ToolContext): Promise<void> {
  const registry = getPollRegistry(ctx);
  if (registry.persistedLoaded) return;
  registry.persistedLoaded = true;
  const preferences = await ctx.workspace.listGuiSyncPollingPreferences().catch(() => []);
  for (const preference of preferences) {
    if (!preference.persist || preference.state !== "enabled" || registry.entries.has(preference.connectionId)) continue;
    const connection = await ctx.workspace.readConnection(preference.connectionId).catch(() => undefined);
    if (!connection || connection.state !== "connected" || connection.syncMode !== "bidirectional" || !isConnectionActive(connection)) continue;
    const status = createPollStatusFromPreference(preference, connection, nextPollGeneration(registry));
    const entry: GuiSyncPollEntry = {
      status,
      timer: setInterval(() => {
        void runPollingTick(ctx, connection.docId, connection.connectionId, status.generation);
      }, status.intervalMs),
    };
    entry.timer.unref?.();
    registry.entries.set(connection.connectionId, entry);
  }
}

function createPollStatusFromPreference(
  preference: import("../adapters/workspace.js").GuiSyncPollingPreference,
  connection: ConnectionConfig,
  generation: number,
): GuiSyncPollStatus {
  const now = new Date().toISOString();
  return {
    pollingId: createConnectionId("poll"),
    generation,
    docId: preference.docId,
    connectionId: preference.connectionId,
    state: "running",
    intervalMs: preference.intervalMs,
    timeoutMs: preference.timeoutMs,
    startedAt: now,
    updatedAt: now,
    inFlight: false,
    pullCount: 0,
    skippedPullCount: 0,
    conflictCount: 0,
    errorCount: 0,
    consecutiveErrorCount: 0,
    persistent: true,
    identitySummary: connection.identitySummary ?? buildIdentitySummary(connection),
    capabilitySummary: connection.capabilitySummary ?? buildCapabilitySummary(connection),
  };
}

function nextPollGeneration(registry: GuiSyncPollRegistry): number {
  if (!Number.isSafeInteger(registry.nextGeneration) || registry.nextGeneration < 1) {
    registry.nextGeneration = 1;
  }
  const generation = registry.nextGeneration;
  registry.nextGeneration += 1;
  return generation;
}

async function runPollingTick(ctx: ToolContext, docId: string, connectionId: string, generation: number): Promise<void> {
  const registry = getPollRegistry(ctx);
  const entry = registry.entries.get(connectionId);
  if (!entry || entry.status.state !== "running" || entry.status.generation !== generation) return;
  if (entry.status.inFlight) {
    recordSkippedPoll(entry.status, "in_flight");
    return;
  }
  if (entry.status.backoffUntil && Date.parse(entry.status.backoffUntil) > Date.now()) {
    recordSkippedPoll(entry.status, "backoff");
    return;
  }

  entry.status.inFlight = true;
  entry.status.lastAttemptAt = new Date().toISOString();
  entry.status.updatedAt = entry.status.lastAttemptAt;
  try {
    const result = await pullGuiState(
      {
        docId,
        connectionId,
        conflictPolicy: "reject",
        timeoutMs: entry.status.timeoutMs,
      },
      ctx,
    );
    entry.status.pullCount += 1;
    entry.status.consecutiveErrorCount = 0;
    entry.status.backoffUntil = undefined;
    entry.status.lastSuccessAt = new Date().toISOString();
    entry.status.updatedAt = entry.status.lastSuccessAt;
    entry.status.lastPull = {
      requestId: result.requestId,
      wrote: result.wrote,
      idDiff: result.idDiff,
    };
    entry.status.lastConflict = undefined;
    entry.status.lastError = undefined;
  } catch (error) {
    const payload = toErrorPayload(error);
    if (payload.code === "SYNC_CONFLICT") {
      entry.status.conflictCount += 1;
      entry.status.lastConflictAt = new Date().toISOString();
      entry.status.lastConflict = payload;
    }
    entry.status.errorCount += 1;
    entry.status.consecutiveErrorCount += 1;
    entry.status.lastErrorAt = new Date().toISOString();
    entry.status.updatedAt = entry.status.lastErrorAt;
    entry.status.lastError = payload;
    if (entry.status.consecutiveErrorCount >= 3) {
      const backoffMs = Math.min(entry.status.intervalMs * entry.status.consecutiveErrorCount, 30_000);
      entry.status.backoffUntil = new Date(Date.now() + backoffMs).toISOString();
    }
  } finally {
    const latest = registry.entries.get(connectionId);
    if (latest === entry && latest.status.generation === generation) {
      entry.status.inFlight = false;
      entry.status.updatedAt = new Date().toISOString();
    }
  }
}

function recordSkippedPoll(status: GuiSyncPollStatus, reason: "in_flight" | "backoff"): void {
  const now = new Date().toISOString();
  status.skippedPullCount += 1;
  status.lastSkippedAt = now;
  status.updatedAt = now;
  status.lastSkip = {
    reason,
    ...(reason === "backoff" && status.backoffUntil ? { backoffUntil: status.backoffUntil } : {}),
  };
}

function pollingTargets(
  registry: GuiSyncPollRegistry,
  input: { docId?: string; connectionId?: string },
): GuiSyncPollEntry[] {
  const all = [...registry.entries.values()];
  return all.filter((entry) => {
    if (input.connectionId && entry.status.connectionId !== input.connectionId) return false;
    if (input.docId && entry.status.docId !== input.docId) return false;
    return true;
  });
}

function stopPollEntry(registry: GuiSyncPollRegistry, connectionId: string): GuiSyncPollStatus {
  const entry = registry.entries.get(connectionId);
  if (!entry) {
    throw new InkMcpError("SYNC_NOT_CONNECTED", "No GUI sync polling entry matched the stop request.", { connectionId });
  }
  clearInterval(entry.timer);
  entry.status.state = "stopped";
  entry.status.updatedAt = new Date().toISOString();
  entry.status.inFlight = false;
  registry.entries.delete(connectionId);
  return clonePollStatus(entry.status);
}

function clonePollStatus(status: GuiSyncPollStatus): GuiSyncPollStatus {
  return {
    ...status,
    ...(status.lastPull ? { lastPull: { ...status.lastPull } } : {}),
    ...(status.lastSkip ? { lastSkip: { ...status.lastSkip } } : {}),
    ...(status.lastConflict ? { lastConflict: { ...status.lastConflict } } : {}),
    ...(status.lastError ? { lastError: { ...status.lastError } } : {}),
    ...(status.identitySummary ? { identitySummary: { ...status.identitySummary } } : {}),
    ...(status.capabilitySummary ? { capabilitySummary: { ...status.capabilitySummary } } : {}),
  };
}

function isConnectionActive(connection: ConnectionConfig): boolean {
  return connection.state === "connected" && Date.parse(connection.lastSeenAt) + defaultConnectionTtlMs > Date.now();
}

function shouldSkipForTtl(connection: ConnectionConfig): boolean {
  const ttlMs = positiveEnvInt("INKSMCP_GUI_PRE_PULL_TTL_MS") ?? 1000;
  return Boolean(connection.lastPulledAt) && Date.now() - Date.parse(connection.lastPulledAt as string) < ttlMs;
}

function validatePullManifest(manifest: GuiPullManifest, connection: ConnectionConfig, expectedRequestId: string): void {
  if (manifest.requestId !== expectedRequestId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest request id does not match the MCP request.", {
      expectedRequestId,
      actualRequestId: manifest.requestId,
    });
  }
  if (manifest.connectionId !== connection.connectionId || manifest.requestedDocId !== connection.docId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest does not match the requested connection.", {
      expected: { connectionId: connection.connectionId, docId: connection.docId },
      actual: { connectionId: manifest.connectionId, requestedDocId: manifest.requestedDocId },
    });
  }
  if (manifest.inferredDocId && manifest.inferredDocId !== connection.docId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest inferred a different document id.", {
      docId: connection.docId,
      inferredDocId: manifest.inferredDocId,
    });
  }
  if (connection.runtimeDocumentId && manifest.runtimeDocumentId !== connection.runtimeDocumentId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest runtime document id does not match the active connection.", {
      expected: { runtimeDocumentId: connection.runtimeDocumentId },
      actual: { runtimeDocumentId: manifest.runtimeDocumentId },
    });
  }
  if (connection.windowId && manifest.windowId !== connection.windowId) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest window id does not match the active connection.", {
      expected: { windowId: connection.windowId },
      actual: { windowId: manifest.windowId },
    });
  }
  const markerPath = manifest.svgPath;
  if (markerPath && !markerPath.endsWith(`${manifest.requestId}.svg`)) {
    throw new InkMcpError("SYNC_IDENTITY_MISMATCH", "GUI pull manifest SVG path does not match the request id.", {
      requestId: manifest.requestId,
      svgPath: markerPath,
    });
  }
}

async function refreshConnectedWindow(ctx: ToolContext, docId: string, timeoutMs?: number) {
  if (!ctx.autoRefresh?.enabled) {
    return {};
  }
  try {
    const refreshed = await ctx.inkscape.refreshActiveWindowWithCompanionExtension({
      docId,
      workspaceRoot: ctx.workspace.paths.root,
      timeoutMs: timeoutMs ?? ctx.autoRefresh.timeoutMs,
    });
    return {
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "companion_extension",
        binaryPath: refreshed.binaryPath,
        exitCode: refreshed.exitCode,
        ...(refreshed.redraw ? { redraw: refreshed.redraw } : {}),
      },
    };
  } catch (error) {
    return {
      guiRefresh: {
        attempted: true,
        refreshed: false,
        method: "companion_extension",
      },
      warning: {
        code: "INKSCAPE_CONNECT_REFRESH_FAILED",
        message:
          "The connection was created, but the marker could not be pushed into the active Inkscape window automatically.",
        details: error instanceof InkMcpError ? { code: error.code, message: error.message, details: error.details } : { message: String(error) },
      },
    };
  }
}

async function refreshAppliedMergePreview(ctx: ToolContext, paths: DocumentPaths) {
  if (!ctx.autoRefresh?.enabled) {
    return {};
  }
  try {
    const refreshed = await ctx.inkscape.refreshActiveWindowWithCompanionExtension({
      docId: paths.docId,
      workspaceRoot: ctx.workspace.paths.root,
      timeoutMs: ctx.autoRefresh.timeoutMs,
    });
    await updateActiveConnectionBaselineAfterMcpWrite(ctx, paths.docId);
    return {
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "companion_extension",
        binaryPath: refreshed.binaryPath,
        exitCode: refreshed.exitCode,
        ...(refreshed.redraw ? { redraw: refreshed.redraw } : {}),
      },
    };
  } catch (error) {
    const cause = error instanceof InkMcpError
      ? { code: error.code, message: error.message, details: error.details }
      : { message: error instanceof Error ? error.message : String(error) };
    return {
      guiRefresh: {
        attempted: true,
        refreshed: false,
        method: "companion_extension",
      },
      warning: {
        code: "INKSCAPE_AUTO_REFRESH_FAILED",
        message:
          "The merge preview was applied, but automatic Inkscape refresh did not finish. The workspace SVG remains authoritative.",
        details: {
          currentSvgPath: paths.currentSvg,
          cause,
        },
      },
    };
  }
}

function verifyApplyMergePreviewBaseline(
  explicit: { revision: number; contentHash: string } | undefined,
  artifact: { revision: number; contentHash: string } | undefined,
  current: Pick<StoredMetadata, "revision" | "contentHash">,
): { revision: number; contentHash: string } {
  if (explicit && artifact && (explicit.revision !== artifact.revision || explicit.contentHash !== artifact.contentHash)) {
    throw new InkMcpError("INVALID_INPUT", "Explicit baseline does not match the merge preview artifact baseline.", {
      explicit,
      artifact,
    });
  }
  const baseline = explicit ?? artifact;
  if (!baseline) {
    throw new InkMcpError("INVALID_INPUT", "apply_merge_preview requires a baseline because the merge preview artifact is unguarded.", {
      required: ["baseline.revision", "baseline.contentHash"],
    });
  }
  if (current.revision !== baseline.revision || current.contentHash !== baseline.contentHash) {
    throw new InkMcpError("SYNC_CONFLICT", "Workspace document changed since the merge preview baseline.", {
      expectedBase: baseline,
      actual: { revision: current.revision, contentHash: current.contentHash },
    });
  }
  return baseline;
}

function withLocalWriteDiagnostics<T extends Record<string, unknown>>(
  payload: T,
  write: { operationDiff?: { path: string; generatedAt: string; summary: Record<string, unknown> }; operationDiffWarning?: Record<string, unknown> },
): T & { operationDiff?: { path: string; generatedAt: string; summary: Record<string, unknown> }; warnings?: Record<string, unknown>[] } {
  const warnings = write.operationDiffWarning ? [write.operationDiffWarning] : [];
  return {
    ...payload,
    ...(write.operationDiff ? { operationDiff: write.operationDiff } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function withLocalGuiRefreshResult<T extends Record<string, unknown>>(
  payload: T & { warnings?: Record<string, unknown>[] },
  refresh: { guiRefresh?: Record<string, unknown>; warning?: Record<string, unknown> },
): T & { guiRefresh?: Record<string, unknown>; warnings?: Record<string, unknown>[] } {
  const existing = Array.isArray(payload.warnings) ? payload.warnings : [];
  const warnings = refresh.warning ? [...existing, refresh.warning] : existing;
  return {
    ...payload,
    ...(refresh.guiRefresh ? { guiRefresh: refresh.guiRefresh } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function positiveEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function hasInkMcpConnectionMarker(svg: string, connectionId: string, docId: string): boolean {
  const marker = readInkMcpMarker(svg);
  return marker?.connectionId === connectionId && marker.docId === docId;
}
