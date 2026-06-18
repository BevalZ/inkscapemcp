import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";

import { diffPngBuffers } from "../core/png-diff.js";
import { InkMcpError } from "../core/errors.js";
import { vectorizeBitmapSchema } from "../core/validation.js";
import type { ToolContext } from "./context.js";

export async function vectorizeBitmap(input: z.infer<typeof vectorizeBitmapSchema>, ctx: ToolContext) {
  if (isRemoteUriOrUnc(input.sourcePath)) {
    throw new InkMcpError("INVALID_INPUT", "Bitmap source must be a local filesystem path.");
  }
  const sourcePath = path.resolve(input.sourcePath);
  const extension = path.extname(sourcePath).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"].includes(extension)) {
    throw new InkMcpError("INVALID_INPUT", "Unsupported bitmap source extension.", { extension });
  }
  const sourceInfo = await stat(sourcePath).catch(() => {
    throw new InkMcpError("INVALID_INPUT", "Bitmap source was not found.", { sourcePath: input.sourcePath });
  });
  if (!sourceInfo.isFile()) {
    throw new InkMcpError("INVALID_INPUT", "Bitmap source must be a file.", { sourcePath: input.sourcePath });
  }

  const outputPath = ctx.workspace.vectorizedPath(
    input.docId,
    normalizeVectorizedFilename(input.filename, input.docId, input.engine),
  );
  await mkdir(path.dirname(outputPath), { recursive: true });
  const vectorized = await ctx.vectorizer.vectorize({
    inputPath: sourcePath,
    outputPath,
    engine: input.engine,
    timeoutMs: input.timeoutMs,
  });

  const quality = input.runQualityCheck
    ? await qualityCheck(sourcePath, outputPath, input, ctx)
    : { checked: false, reason: "disabled" };

  return {
    ok: true,
    docId: input.docId,
    sourcePath,
    outputPath,
    engine: input.engine,
    vectorizer: {
      binaryPath: vectorized.binaryPath,
      exitCode: vectorized.exitCode,
    },
    quality,
    warnings: [
      {
        code: "VECTORIZATION_REVIEW_REQUIRED",
        message:
          "Vectorization output was written as a separate SVG artifact. Inspect quality metrics before inserting or replacing editable artwork.",
      },
    ],
  };
}

async function qualityCheck(
  sourcePath: string,
  vectorizedSvgPath: string,
  input: z.infer<typeof vectorizeBitmapSchema>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  if (path.extname(sourcePath).toLowerCase() !== ".png") {
    return { checked: false, reason: "source_not_png" };
  }
  const renderedPath = ctx.workspace.vectorizedPath(input.docId, `${path.basename(vectorizedSvgPath, ".svg")}-preview.png`);
  try {
    await ctx.inkscape.renderPng(vectorizedSvgPath, renderedPath, { timeoutMs: input.timeoutMs });
    const metrics = diffPngBuffers(await readFile(sourcePath), await readFile(renderedPath));
    return {
      checked: true,
      renderedPath,
      metrics,
    };
  } catch (error) {
    return {
      checked: false,
      reason: "render_or_diff_failed",
      details: error instanceof InkMcpError ? { code: error.code, message: error.message, details: error.details } : { message: String(error) },
    };
  }
}

function normalizeVectorizedFilename(filename: string | undefined, docId: string, engine: string): string {
  const chosen = filename ?? `${docId}-${engine}-vectorized.svg`;
  return path.extname(chosen).toLowerCase() === ".svg" ? chosen : `${chosen}.svg`;
}

function isRemoteUriOrUnc(inputPath: string): boolean {
  return /^(?:https?|ftp|file):/i.test(inputPath) || /^(?:\/\/|\\\\)/.test(inputPath.trim());
}
