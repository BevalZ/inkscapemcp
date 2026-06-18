import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import {
  diagnoseInkscapeGuiSchema,
  exportDocumentExternalSchema,
  exportDocumentSchema,
  openInInkscapeSchema,
  refreshInInkscapeSchema,
  renderPreviewSchema,
} from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import { prePullBeforeStaleTolerantOutput, jsonResult, type ToolContext } from "./context.js";
import { normalizeExportFilename, readPngContent } from "./document.js";
import { stripInkMcpMetadata } from "../core/sync-metadata.js";

export async function renderPreview(input: z.infer<typeof renderPreviewSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
  const prePull = await prePullBeforeStaleTolerantOutput(ctx, input.docId, {
    toolName: "render_preview",
    skipPrePull: input.skipPrePull,
    timeoutMs: input.timeoutMs,
  });
  await ctx.workspace.readSvg(input.docId);
  const previewPath = ctx.workspace.previewPath(input.docId);
  const render = await ctx.inkscape.renderPng(paths.currentSvg, previewPath, {
    width: input.width,
    dpi: input.dpi,
    background: input.background,
    timeoutMs: input.timeoutMs,
  });
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName: "render_preview",
    inputSummary: { width: input.width, dpi: input.dpi, hasBackground: Boolean(input.background) },
    previewPath,
    status: "ok",
  });
  return jsonResult(
    {
      ok: true,
      docId: input.docId,
      previewPath,
      currentSvgPath: paths.currentSvg,
      inkscape: { binaryPath: render.binaryPath, exitCode: render.exitCode },
      ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
      ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
    },
    [await readPngContent(previewPath)],
  );
}

export async function exportDocument(input: z.infer<typeof exportDocumentSchema>, ctx: ToolContext) {
  const filename = normalizeExportFilename(input.filename, input.docId, input.format);
  return exportDocumentToPath(input, ctx, ctx.workspace.exportPath(input.docId, filename), "export_document");
}

export async function exportDocumentExternal(input: z.infer<typeof exportDocumentExternalSchema>, ctx: ToolContext) {
  const filename = normalizeExportFilename(input.filename, input.docId, input.format);
  const outputPath = ctx.workspace.externalExportPath(input.outputDirectory, filename);
  return exportDocumentToPath(input, ctx, outputPath, "export_document_external");
}

async function exportDocumentToPath(
  input: z.infer<typeof exportDocumentSchema>,
  ctx: ToolContext,
  outputPath: string,
  toolName: "export_document" | "export_document_external",
) {
  const paths = ctx.workspace.documentPaths(input.docId);
  const prePull = await prePullBeforeStaleTolerantOutput(ctx, input.docId, {
    toolName,
    skipPrePull: input.skipPrePull,
    timeoutMs: input.timeoutMs,
  });
  const svg = await ctx.workspace.readSvg(input.docId);
  const exportInputPath = input.includeInkMcpMetadata ? paths.currentSvg : ctx.workspace.tempPath(input.docId, `export-${Date.now()}.svg`);
  if (!input.includeInkMcpMetadata) {
    await mkdir(path.dirname(exportInputPath), { recursive: true });
    await writeFile(exportInputPath, stripInkMcpMetadata(svg), "utf8");
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  let exported;
  try {
    exported = await ctx.inkscape.exportDocument(exportInputPath, outputPath, {
      width: input.width,
      dpi: input.dpi,
      textToPath: input.textToPath,
      timeoutMs: input.timeoutMs,
    });
  } finally {
    if (!input.includeInkMcpMetadata) {
      await rm(exportInputPath, { force: true }).catch(() => undefined);
    }
  }
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName,
    inputSummary: { format: input.format, width: input.width, dpi: input.dpi, textToPath: input.textToPath },
    exportPath: outputPath,
    status: "ok",
  });
  return {
    ok: true,
    docId: input.docId,
    outputPath,
    format: input.format,
    exportMode: toolName === "export_document_external" ? "external" : "workspace",
    currentSvgPath: paths.currentSvg,
    inkscape: { binaryPath: exported.binaryPath, exitCode: exported.exitCode },
    ...(prePull.pulled ? { guiPrePull: prePull.pulled } : {}),
    ...(prePull.warning ? { warnings: [prePull.warning] } : {}),
  };
}

export async function openInInkscape(input: z.infer<typeof openInInkscapeSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
  await ctx.workspace.readSvg(input.docId);
  const opened = await ctx.inkscape.open(paths.currentSvg);
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName: "open_in_inkscape",
    inputSummary: {},
    status: "ok",
  });
  return {
    ok: true,
    docId: input.docId,
    currentSvgPath: paths.currentSvg,
    inkscape: opened,
    warnings: [
      {
        code: "GUI_BEST_EFFORT",
        message:
          "GUI opening is best-effort and may open another window. The workspace SVG remains authoritative; on Windows, active-window automation is disabled by default because it can target the wrong document or crash.",
      },
    ],
  };
}

export async function refreshInInkscape(input: z.infer<typeof refreshInInkscapeSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
  await ctx.workspace.readSvg(input.docId);
  if (input.useCompanionExtension !== false && !input.allowUnstableRebase) {
    try {
      const refreshed = await ctx.inkscape.refreshActiveWindowWithCompanionExtension({
        docId: input.docId,
        workspaceRoot: ctx.workspace.paths.root,
        timeoutMs: input.timeoutMs,
      });
      await appendOperationLog(paths, {
        level: "info",
        docId: input.docId,
        toolName: "refresh_in_inkscape",
        inputSummary: { method: "companion-extension", timeoutMs: input.timeoutMs },
        status: "ok",
      });
      return {
        ok: true,
        docId: input.docId,
        currentSvgPath: paths.currentSvg,
        refreshed: true,
        method: "companion_extension",
        inkscape: { binaryPath: refreshed.binaryPath, exitCode: refreshed.exitCode },
        ...(refreshed.redraw ? { redraw: refreshed.redraw } : {}),
      };
    } catch (error) {
      await appendOperationLog(paths, {
        level: "warn",
        docId: input.docId,
        toolName: "refresh_in_inkscape",
        inputSummary: { method: "companion-extension", timeoutMs: input.timeoutMs },
        status: "ok",
      });
      return {
        ok: true,
        docId: input.docId,
        currentSvgPath: paths.currentSvg,
        refreshed: false,
        method: "companion_extension",
        warnings: [
          {
            code: "INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED",
            message:
              "Inkscape active-window refresh was not run. The workspace SVG remains authoritative; reopen current.svg in Inkscape or opt into unsafe active-window experiments only for manual diagnosis.",
            details: {
              cause: error instanceof Error ? error.message : String(error),
            },
          },
        ],
      };
    }
  }

  if (!input.allowUnstableRebase) {
    return {
      ok: true,
      docId: input.docId,
      currentSvgPath: paths.currentSvg,
      refreshed: false,
      warnings: [
        {
          code: "UNSTABLE_REBASE_DISABLED",
          message:
            "Inkscape active-window file-rebase is disabled by default because it can crash Inkscape 1.4.x on Windows. The workspace SVG remains authoritative.",
        },
      ],
    };
  }

  const refreshed = await ctx.inkscape.refreshActiveWindow(paths.currentSvg, { timeoutMs: input.timeoutMs });
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName: "refresh_in_inkscape",
    inputSummary: { timeoutMs: input.timeoutMs, allowUnstableRebase: input.allowUnstableRebase },
    status: "ok",
  });
  return {
    ok: true,
    docId: input.docId,
    currentSvgPath: paths.currentSvg,
    refreshed: true,
    inkscape: { binaryPath: refreshed.binaryPath, exitCode: refreshed.exitCode },
    warnings: [
      {
        code: "UNSTABLE_REBASE",
        message:
          "Active-window file-rebase is an unstable best-effort path and may crash some Inkscape versions on Windows. The workspace SVG remains authoritative.",
      },
    ],
  };
}

export async function diagnoseInkscapeGui(input: z.infer<typeof diagnoseInkscapeGuiSchema>, ctx: ToolContext) {
  const diagnostics = await ctx.inkscape.diagnoseGui({ timeoutMs: input.timeoutMs });
  return {
    ok: true,
    ...(input.docId ? { docId: input.docId } : {}),
    diagnostics,
    automationBoundary: {
      primaryPath: "companion_extension_or_active_window_actions",
      mouseKeyboardAutomation: "diagnostic_fallback_only",
      mutatesSvg: false,
    },
  };
}
