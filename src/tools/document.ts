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
} from "../core/svg-document.js";
import { parseFullSvg } from "../core/validation.js";
import {
  archiveDocumentSchema,
  createDocumentSchema,
  listHistorySchema,
  queryDocumentSchema,
  replaceDocumentSvgSchema,
  rollbackDocumentSchema,
} from "../core/validation.js";
import { appendOperationLog } from "../logging/operation-log.js";
import { tryAutoRefreshInInkscape, withGuiRefreshResult, type ToolContext } from "./context.js";

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

export async function replaceDocumentSvg(input: z.infer<typeof replaceDocumentSvgSchema>, ctx: ToolContext) {
  if (!input.confirmFullDocumentReplacement) {
    throw new InkMcpError(
      "INVALID_INPUT",
      "replace_document_svg replaces the whole SVG object tree. Use object-level tools for normal edits, or set confirmFullDocumentReplacement=true for an intentional redraw.",
      { requiredFlag: "confirmFullDocumentReplacement" },
    );
  }

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
  return withGuiRefreshResult({
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
  }, refresh);
}

export async function queryDocument(input: z.infer<typeof queryDocumentSchema>, ctx: ToolContext) {
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

  return {
    ok: true,
    document: summarizeDocument(document, paths.currentSvg, input.docId, metadata.title),
    tree: summarizeElement(target),
  };
}

export async function listHistory(input: z.infer<typeof listHistorySchema>, ctx: ToolContext) {
  return {
    ok: true,
    docId: input.docId,
    snapshots: await ctx.workspace.listHistory(input.docId),
  };
}

export async function rollbackDocument(input: z.infer<typeof rollbackDocumentSchema>, ctx: ToolContext) {
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
