import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { DirectAttributeUpdate } from "../adapters/inkscape-cli.js";
import { InkscapeCli } from "../adapters/inkscape-cli.js";
import type { DocumentPaths } from "../adapters/workspace.js";
import { Workspace } from "../adapters/workspace.js";
import { InkMcpError, toErrorPayload } from "../core/errors.js";
import type { AttributeMap, SvgOperation } from "../core/svg-ops.js";

export interface ToolContext {
  workspace: Workspace;
  inkscape: InkscapeCli;
  autoRefresh?: {
    enabled: boolean;
    timeoutMs?: number;
  };
}

export function createToolContext(): ToolContext {
  return {
    workspace: new Workspace(),
    inkscape: new InkscapeCli(),
    autoRefresh: {
      enabled: process.env.INKSMCP_AUTO_REFRESH_INKSCAPE !== "0",
      timeoutMs: positiveEnvInt("INKSMCP_AUTO_REFRESH_TIMEOUT_MS") ?? 10_000,
    },
  };
}

export function jsonResult(payload: Record<string, unknown>, extraContent: CallToolResult["content"] = []): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
      ...extraContent,
    ],
    structuredContent: payload,
  };
}

export async function runTool(
  toolName: string,
  callback: () => Promise<Record<string, unknown>>,
): Promise<CallToolResult> {
  try {
    return jsonResult(await callback());
  } catch (error) {
    return jsonResult({
      ok: false,
      error: toErrorPayload(error),
      toolName,
    });
  }
}

export function warningFromError(error: unknown) {
  if (error instanceof InkMcpError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return { code: "INKSCAPE_FAILED", message: error instanceof Error ? error.message : String(error) };
}

export async function tryAutoRefreshInInkscape(ctx: ToolContext, paths: DocumentPaths) {
  if (!ctx.autoRefresh?.enabled) {
    return {};
  }
  try {
    const refreshed = await ctx.inkscape.refreshActiveWindowWithCompanionExtension({
      docId: paths.docId,
      workspaceRoot: ctx.workspace.paths.root,
      timeoutMs: ctx.autoRefresh.timeoutMs,
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
    const warning = warningFromError(error);
    return {
      guiRefresh: {
        attempted: true,
        refreshed: false,
        method: "companion_extension",
      },
      warning: {
        code:
          warning.code === "INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED"
            ? "INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED"
            : "INKSCAPE_AUTO_REFRESH_FAILED",
        message:
          "The SVG was saved, but automatic Inkscape refresh did not finish. The workspace SVG remains authoritative.",
        details: {
          currentSvgPath: paths.currentSvg,
          cause: warning,
        },
      },
    };
  }
}

export async function tryAutoSyncAttributesInInkscape(
  ctx: ToolContext,
  updates: DirectAttributeUpdate[],
): Promise<{ guiRefresh?: Record<string, unknown>; warning?: Record<string, unknown> }> {
  if (!ctx.autoRefresh?.enabled || updates.length === 0) {
    return {};
  }
  try {
    const synced = await ctx.inkscape.syncActiveWindowAttributes({
      updates,
      timeoutMs: ctx.autoRefresh.timeoutMs,
    });
    return {
      guiRefresh: {
        attempted: true,
        refreshed: true,
        method: "active_window_attribute_sync",
        changedAttributeCount: updates.length,
        binaryPath: synced.binaryPath,
        exitCode: synced.exitCode,
      },
    };
  } catch (error) {
    const warning = warningFromError(error);
    return {
      guiRefresh: {
        attempted: true,
        refreshed: false,
        method: "active_window_attribute_sync",
        changedAttributeCount: updates.length,
      },
      warning: {
        code: "INKSCAPE_ACTIVE_WINDOW_ATTRIBUTE_SYNC_FAILED",
        message:
          "The SVG was saved, but direct Inkscape window attribute sync failed. The workspace SVG remains authoritative.",
        details: { cause: warning },
      },
    };
  }
}

export function directAttributeUpdatesForSetAttributes(
  elementId: string,
  setAttributes: AttributeMap = {},
): DirectAttributeUpdate[] {
  return Object.entries(setAttributes)
    .filter(([attributeName]) => attributeName !== "id" && attributeName !== "textContent")
    .map(([attributeName, value]) => ({
      elementId,
      attributeName,
      value: String(value),
    }));
}

export function directAttributeUpdatesForAttributeOnlyOperations(
  operations: SvgOperation[],
): DirectAttributeUpdate[] | undefined {
  const updates: DirectAttributeUpdate[] = [];
  for (const operation of operations) {
    if (
      operation.type !== "update" ||
      operation.text !== undefined ||
      (operation.removeAttributes?.length ?? 0) > 0
    ) {
      return undefined;
    }
    updates.push(...directAttributeUpdatesForSetAttributes(operation.elementId, operation.setAttributes));
  }
  return updates;
}

export function withGuiRefreshResult<T extends Record<string, unknown>>(
  payload: T,
  refresh: { guiRefresh?: Record<string, unknown>; warning?: Record<string, unknown> },
): T & { guiRefresh?: Record<string, unknown>; warnings?: Record<string, unknown>[] } {
  const existing = Array.isArray(payload.warnings) ? (payload.warnings as Record<string, unknown>[]) : [];
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
