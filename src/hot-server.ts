#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defaultHotWorkerArgs, HotReloadProxy } from "./hot-proxy.js";

export async function main() {
  const entryPath = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(entryPath), "..");
  const defaults = defaultHotWorkerArgs(entryPath);
  const proxy = new HotReloadProxy({
    clientInput: process.stdin,
    clientOutput: process.stdout,
    workerCommand: process.env.INKSMCP_HOT_WORKER_COMMAND ?? defaults.command,
    workerArgs: process.env.INKSMCP_HOT_WORKER_ARGS
      ? JSON.parse(process.env.INKSMCP_HOT_WORKER_ARGS) as string[]
      : defaults.args,
    workerCwd: process.env.INKSMCP_HOT_WORKER_CWD ?? packageRoot,
    workerEnv: process.env,
    watchPaths: process.env.INKSMCP_HOT_WATCH_PATHS
      ? process.env.INKSMCP_HOT_WATCH_PATHS.split(path.delimiter).filter(Boolean)
      : defaults.watchPaths,
    debounceMs: positiveEnvInt("INKSMCP_HOT_DEBOUNCE_MS"),
    restartGraceMs: positiveEnvInt("INKSMCP_HOT_RESTART_GRACE_MS"),
    stderr: process.stderr,
  });
  await proxy.start();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function positiveEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
