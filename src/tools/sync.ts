import * as z from "zod/v4";
import { randomUUID } from "node:crypto";

import type { ConnectionConfig, DocumentPaths, GuiPullManifest, StoredMetadata } from "../adapters/workspace.js";
import { appendOperationLog } from "../logging/operation-log.js";
import {
  connectInkscapeWindowSchema,
  disconnectInkscapeWindowSchema,
  getGuiSyncStatusSchema,
  pullGuiStateSchema,
  startGuiSyncPollingSchema,
  stopGuiSyncPollingSchema,
} from "../core/validation.js";
import { InkMcpError, toErrorPayload } from "../core/errors.js";
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

export interface GuiSyncPollStatus {
  pollingId: string;
  docId: string;
  connectionId: string;
  state: "running" | "stopped";
  intervalMs: number;
  timeoutMs?: number;
  startedAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastErrorAt?: string;
  inFlight: boolean;
  pullCount: number;
  errorCount: number;
  lastPull?: Record<string, unknown>;
  lastError?: Record<string, unknown>;
}

interface GuiSyncPollEntry {
  status: GuiSyncPollStatus;
  timer: NodeJS.Timeout;
}

export interface GuiSyncPollRegistry {
  entries: Map<string, GuiSyncPollEntry>;
}

export function createGuiSyncPollRegistry(): GuiSyncPollRegistry {
  return { entries: new Map() };
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
  return {
    ok: true,
    docId: input.docId,
    connection: storedConnection,
    currentSvgPath: write.paths.currentSvg,
    snapshotPath: write.snapshotPath,
    ...(guiRefresh.guiRefresh ? { guiRefresh: guiRefresh.guiRefresh } : {}),
    ...(guiRefresh.warning ? { warnings: [guiRefresh.warning] } : {}),
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
  if (input.conflictPolicy === "merge_non_overlapping" && merge && !merge.ok) {
    throw new InkMcpError("SYNC_CONFLICT", "GUI and workspace changes overlap and cannot be merged automatically.", {
      conflictReport,
      merge,
    });
  }
  const candidateSvg = merge?.ok && merge.svg ? merge.svg : pulledSvg;
  const writePolicy = input.conflictPolicy === "merge_non_overlapping" && merge?.ok ? "merge_non_overlapping" : input.conflictPolicy;

  let write: { paths: DocumentPaths; snapshotPath: string; result: { idDiff: typeof idDiff }; wrote: boolean };
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
  return {
    ok: true,
    docId: input.docId,
    connectionId: connection.connectionId,
    requestId,
    wrote: write.wrote,
    currentSvgPath: write.paths.currentSvg,
    snapshotPath: write.snapshotPath || undefined,
    rawPulledSvgPath: ctx.workspace.guiPullSvgPath(requestId),
    manifestPath: ctx.workspace.guiPullManifestPath(requestId),
    idDiff,
    ...(conflictReport.hasConflict ? { conflictReport } : {}),
    ...(merge ? { merge } : {}),
    inkscape: { binaryPath: inkscape.binaryPath, exitCode: inkscape.exitCode },
    warnings:
      write.wrote || input.conflictPolicy !== "prefer_workspace"
        ? undefined
        : [
            {
              code: "SYNC_PREFER_WORKSPACE",
              message: "GUI state was validated but workspace state was kept due to conflictPolicy=prefer_workspace.",
            },
          ],
  };
}

export async function startGuiSyncPolling(input: z.infer<typeof startGuiSyncPollingSchema>, ctx: ToolContext) {
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
  const now = new Date().toISOString();
  const status: GuiSyncPollStatus = {
    pollingId: createConnectionId("poll"),
    docId: connection.docId,
    connectionId: connection.connectionId,
    state: "running",
    intervalMs,
    timeoutMs: input.timeoutMs,
    startedAt: now,
    updatedAt: now,
    inFlight: false,
    pullCount: 0,
    errorCount: 0,
  };
  const entry: GuiSyncPollEntry = {
    status,
    timer: setInterval(() => {
      void runPollingTick(ctx, connection.docId, connection.connectionId);
    }, intervalMs),
  };
  entry.timer.unref?.();
  registry.entries.set(connection.connectionId, entry);
  void runPollingTick(ctx, connection.docId, connection.connectionId);
  return {
    ok: true,
    polling: clonePollStatus(status),
    alreadyRunning: false,
  };
}

export async function stopGuiSyncPolling(input: z.infer<typeof stopGuiSyncPollingSchema>, ctx: ToolContext) {
  const registry = getPollRegistry(ctx);
  const targets = pollingTargets(registry, input);
  const stopped = targets.map((entry) => stopPollEntry(registry, entry.status.connectionId));
  return {
    ok: true,
    stopped,
  };
}

export async function getGuiSyncStatus(input: z.infer<typeof getGuiSyncStatusSchema>, ctx: ToolContext) {
  const registry = getPollRegistry(ctx);
  const statuses = pollingTargets(registry, input).map((entry) => clonePollStatus(entry.status));
  return {
    ok: true,
    polling: statuses,
  };
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
  if (!hasConflict || conflictPolicy !== "merge_non_overlapping") return undefined;
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

function getPollRegistry(ctx: ToolContext): GuiSyncPollRegistry {
  if (!ctx.guiSyncPolling) {
    ctx.guiSyncPolling = createGuiSyncPollRegistry();
  }
  return ctx.guiSyncPolling;
}

async function runPollingTick(ctx: ToolContext, docId: string, connectionId: string): Promise<void> {
  const registry = getPollRegistry(ctx);
  const entry = registry.entries.get(connectionId);
  if (!entry || entry.status.state !== "running" || entry.status.inFlight) return;

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
    entry.status.lastSuccessAt = new Date().toISOString();
    entry.status.updatedAt = entry.status.lastSuccessAt;
    entry.status.lastPull = {
      requestId: result.requestId,
      wrote: result.wrote,
      idDiff: result.idDiff,
    };
    entry.status.lastError = undefined;
  } catch (error) {
    entry.status.errorCount += 1;
    entry.status.lastErrorAt = new Date().toISOString();
    entry.status.updatedAt = entry.status.lastErrorAt;
    entry.status.lastError = toErrorPayload(error);
  } finally {
    const latest = registry.entries.get(connectionId);
    if (latest === entry) {
      entry.status.inFlight = false;
      entry.status.updatedAt = new Date().toISOString();
    }
  }
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
    ...(status.lastError ? { lastError: { ...status.lastError } } : {}),
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
