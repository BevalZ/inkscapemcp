import * as z from "zod/v4";
import { randomUUID } from "node:crypto";

import type { ConnectionConfig, GuiPullManifest } from "../adapters/workspace.js";
import { appendOperationLog } from "../logging/operation-log.js";
import {
  connectInkscapeWindowSchema,
  disconnectInkscapeWindowSchema,
  pullGuiStateSchema,
} from "../core/validation.js";
import { InkMcpError } from "../core/errors.js";
import {
  createConnectionId,
  diffElementIds,
  injectInkMcpMarker,
  normalizeSvg,
  readInkMcpMarker,
  requireInkMcpMarker,
} from "../core/sync-metadata.js";
import type { ToolContext } from "./context.js";

const defaultConnectionTtlMs = 10 * 60 * 1000;

export async function connectInkscapeWindow(input: z.infer<typeof connectInkscapeWindowSchema>, ctx: ToolContext) {
  const syncMode = input.syncMode ?? "display_only";
  const metadata = await ctx.workspace.readMetadata(input.docId);
  const existingConnections = await ctx.workspace.findConnectionsForDoc(input.docId);
  const activeBidirectional = existingConnections.filter((connection) => isConnectionActive(connection) && connection.syncMode === "bidirectional");
  if (syncMode === "bidirectional" && activeBidirectional.length > 0) {
    throw new InkMcpError("SYNC_CONFLICT", "A bidirectional connection is already active for this document.", {
      docId: input.docId,
      activeConnections: activeBidirectional.map((connection) => connection.connectionId),
    });
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
  await appendOperationLog(write.paths, {
    level: "info",
    docId: input.docId,
    toolName: "connect_inkscape_window",
    inputSummary: { syncMode, connectionId },
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
    timeoutMs: input.timeoutMs,
  });
  const manifest = await ctx.workspace.readGuiPullManifest(requestId);
  validatePullManifest(manifest, connection, requestId);
  const rawPulledSvg = await ctx.workspace.readGuiPullSvg(requestId);
  requireInkMcpMarker(rawPulledSvg, { connectionId: connection.connectionId, docId: input.docId });
  const pulledSvg = normalizeSvg(rawPulledSvg);
  const idDiff = diffElementIds(beforeSvg, pulledSvg);

  const write = await ctx.workspace.writeGuiPulledSvgWithSnapshot(
    input.docId,
    "pull_gui_state",
    { revision: connection.baselineRevision, contentHash: connection.baselineContentHash },
    input.conflictPolicy,
    pulledSvg,
    { idDiff },
  );

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
