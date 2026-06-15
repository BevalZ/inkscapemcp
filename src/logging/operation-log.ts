import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { DocumentPaths } from "../adapters/workspace.js";

export type OperationLogLevel = "info" | "warn" | "error";

export interface OperationLogEntry {
  level: OperationLogLevel;
  docId: string;
  toolName: string;
  inputSummary?: Record<string, unknown>;
  snapshotPath?: string;
  status: "ok" | "error";
  previewPath?: string;
  exportPath?: string;
  errorCode?: string;
}

export async function appendOperationLog(paths: DocumentPaths, entry: OperationLogEntry): Promise<void> {
  await mkdir(path.dirname(paths.operationsLog), { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  await appendFile(paths.operationsLog, `${line}\n`, "utf8");
}
