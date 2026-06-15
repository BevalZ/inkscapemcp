import * as z from "zod/v4";

import { exportDocumentSchema, openInInkscapeSchema, renderPreviewSchema } from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import { jsonResult, type ToolContext } from "./context.js";
import { normalizeExportFilename, readPngContent } from "./document.js";

export async function renderPreview(input: z.infer<typeof renderPreviewSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
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
    },
    [await readPngContent(previewPath)],
  );
}

export async function exportDocument(input: z.infer<typeof exportDocumentSchema>, ctx: ToolContext) {
  const paths = ctx.workspace.documentPaths(input.docId);
  await ctx.workspace.readSvg(input.docId);
  const outputPath = ctx.workspace.exportPath(input.docId, normalizeExportFilename(input.filename, input.docId, input.format));
  const exported = await ctx.inkscape.exportDocument(paths.currentSvg, outputPath, {
    width: input.width,
    dpi: input.dpi,
    textToPath: input.textToPath,
    timeoutMs: input.timeoutMs,
  });
  await appendOperationLog(paths, {
    level: "info",
    docId: input.docId,
    toolName: "export_document",
    inputSummary: { format: input.format, width: input.width, dpi: input.dpi, textToPath: input.textToPath },
    exportPath: outputPath,
    status: "ok",
  });
  return {
    ok: true,
    docId: input.docId,
    outputPath,
    format: input.format,
    currentSvgPath: paths.currentSvg,
    inkscape: { binaryPath: exported.binaryPath, exitCode: exported.exitCode },
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
        message: "GUI opening is best-effort; file-based SVG workflow remains authoritative.",
      },
    ],
  };
}
