import * as z from "zod/v4";

import { importFontSchema } from "../core/validation.js";
import type { ToolContext } from "./context.js";

export async function importFont(input: z.infer<typeof importFontSchema>, ctx: ToolContext) {
  const result = await ctx.workspace.importFont(input.sourcePath, input.filename);
  return {
    ok: true,
    fontPath: result.fontPath,
    bytes: result.bytes,
    warnings: [
      {
        code: "FONT_NOT_EMBEDDED",
        message: "Font was imported into the workspace but not embedded into existing SVG documents.",
      },
    ],
  };
}
