import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { InkscapeCli } from "../adapters/inkscape-cli.js";
import { Workspace } from "../adapters/workspace.js";
import { InkMcpError, toErrorPayload } from "../core/errors.js";

export interface ToolContext {
  workspace: Workspace;
  inkscape: InkscapeCli;
}

export function createToolContext(): ToolContext {
  return {
    workspace: new Workspace(),
    inkscape: new InkscapeCli(),
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
