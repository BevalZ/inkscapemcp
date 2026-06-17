import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { JSONRPCMessage, JSONRPCNotification, JSONRPCRequest, RequestId } from "@modelcontextprotocol/sdk/types.js";

interface HotReloadProxyOptions {
  clientInput: Readable;
  clientOutput: Writable;
  workerCommand: string;
  workerArgs: string[];
  workerCwd?: string;
  workerEnv?: NodeJS.ProcessEnv;
  watchPaths?: string[];
  debounceMs?: number;
  restartGraceMs?: number;
  stderr?: Writable;
}

type WorkerState = "starting" | "handshaking" | "ready" | "closed";

const defaultDebounceMs = 300;
const defaultRestartGraceMs = 2_000;

export class HotReloadProxy {
  private worker?: ChildProcessWithoutNullStreams;
  private workerState: WorkerState = "closed";
  private readonly clientReadBuffer = new ReadBuffer();
  private readonly workerReadBuffer = new ReadBuffer();
  private readonly queuedClientMessages: JSONRPCMessage[] = [];
  private readonly inFlightClientRequestIds = new Set<RequestId>();
  private readonly watchers: FSWatcher[] = [];
  private readonly watchedDirectories = new Set<string>();
  private initializeRequest?: JSONRPCRequest;
  private initializedNotification?: JSONRPCNotification;
  private internalInitializeId?: string;
  private internalInitializeResolve?: () => void;
  private internalInitializeReject?: (error: Error) => void;
  private reloadTimer?: NodeJS.Timeout;
  private reloadGraceTimer?: NodeJS.Timeout;
  private pendingReloadReason?: string;
  private closing = false;

  constructor(private readonly options: HotReloadProxyOptions) {}

  async start(): Promise<void> {
    this.options.clientInput.on("data", this.onClientData);
    this.options.clientInput.on("error", this.onError);
    await this.startWorker();
    await this.startWatchers();
  }

  async close(): Promise<void> {
    this.closing = true;
    this.options.clientInput.off("data", this.onClientData);
    this.options.clientInput.off("error", this.onError);
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers.length = 0;
    this.watchedDirectories.clear();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    if (this.reloadGraceTimer) clearTimeout(this.reloadGraceTimer);
    await this.stopWorker();
  }

  requestReload(reason = "manual"): void {
    if (this.closing) return;
    this.pendingReloadReason = reason;
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      this.reloadWhenSafe(false).catch(this.onError);
    }, this.options.debounceMs ?? defaultDebounceMs);
  }

  private readonly onClientData = (chunk: Buffer) => {
    this.clientReadBuffer.append(chunk);
    while (true) {
      const message = this.clientReadBuffer.readMessage();
      if (!message) break;
      this.handleClientMessage(message).catch(this.onError);
    }
  };

  private readonly onWorkerData = (chunk: Buffer) => {
    this.workerReadBuffer.append(chunk);
    while (true) {
      const message = this.workerReadBuffer.readMessage();
      if (!message) break;
      this.handleWorkerMessage(message).catch(this.onError);
    }
  };

  private readonly onError = (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    this.options.stderr?.write(`[inksmcp-hot] ${message}\n`);
  };

  private async handleClientMessage(message: JSONRPCMessage): Promise<void> {
    if (isRequest(message) && message.method === "initialize") {
      this.initializeRequest = message;
      await this.sendToWorker(message);
      return;
    }

    if (isNotification(message) && message.method === "notifications/initialized") {
      this.initializedNotification = message;
      await this.sendToWorker(message);
      this.workerState = "ready";
      await this.flushClientQueue();
      if (this.pendingReloadReason) {
        await this.reloadWhenSafe(false);
      }
      return;
    }

    if (this.workerState !== "ready") {
      this.queuedClientMessages.push(message);
      return;
    }

    await this.forwardClientMessage(message);
  }

  private async handleWorkerMessage(message: JSONRPCMessage): Promise<void> {
    if (isResponse(message)) {
      if (this.internalInitializeId !== undefined && message.id === this.internalInitializeId) {
        const resolve = this.internalInitializeResolve;
        this.internalInitializeId = undefined;
        this.internalInitializeResolve = undefined;
        this.internalInitializeReject = undefined;
        resolve?.();
        return;
      }
      this.inFlightClientRequestIds.delete(message.id);
    }

    await this.sendToClient(message);
  }

  private async forwardClientMessage(message: JSONRPCMessage): Promise<void> {
    if (isRequest(message)) {
      this.inFlightClientRequestIds.add(message.id);
    }
    await this.sendToWorker(message);
  }

  private async flushClientQueue(): Promise<void> {
    while (this.workerState === "ready" && this.queuedClientMessages.length > 0) {
      const message = this.queuedClientMessages.shift();
      if (message) await this.forwardClientMessage(message);
    }
  }

  private async startWorker(): Promise<void> {
    this.workerState = "starting";
    this.workerReadBuffer.clear();
    const worker = spawn(this.options.workerCommand, this.options.workerArgs, {
      cwd: this.options.workerCwd,
      env: {
        ...process.env,
        ...this.options.workerEnv,
        INKSMCP_HOT_WORKER: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: process.platform === "win32",
    });
    this.worker = worker;
    worker.stdout.on("data", this.onWorkerData);
    worker.stderr.on("data", (chunk: Buffer) => this.options.stderr?.write(chunk));
    worker.on("error", this.onError);
    worker.on("close", () => {
      if (this.worker === worker) {
        this.worker = undefined;
        this.workerState = "closed";
        this.rejectInternalInitialize(new Error("Worker exited during initialize."));
        if (!this.closing) {
          this.requestReload("worker-exit");
        }
      }
    });

    if (this.initializeRequest && this.initializedNotification) {
      await this.initializeWorker();
    }
  }

  private async initializeWorker(): Promise<void> {
    if (!this.initializeRequest || !this.initializedNotification) return;
    this.workerState = "handshaking";
    const internalId = `inksmcp-hot-initialize-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.internalInitializeId = internalId;
    const initialized = new Promise<void>((resolve, reject) => {
      this.internalInitializeResolve = resolve;
      this.internalInitializeReject = reject;
    });
    await this.sendToWorker({ ...this.initializeRequest, id: internalId });
    await initialized;
    await this.sendToWorker(this.initializedNotification);
    this.workerState = "ready";
  }

  private rejectInternalInitialize(error: Error): void {
    const reject = this.internalInitializeReject;
    this.internalInitializeId = undefined;
    this.internalInitializeResolve = undefined;
    this.internalInitializeReject = undefined;
    reject?.(error);
  }

  private async stopWorker(): Promise<void> {
    const worker = this.worker;
    this.worker = undefined;
    this.workerState = "closed";
    this.rejectInternalInitialize(new Error("Worker stopped."));
    if (!worker) return;

    worker.stdout.off("data", this.onWorkerData);
    const closed = new Promise<void>((resolve) => worker.once("close", () => resolve()));
    worker.stdin.end();
    await Promise.race([closed, delay(500)]);
    if (worker.exitCode === null) {
      worker.kill();
      await Promise.race([closed, delay(1_500)]);
    }
    if (worker.exitCode === null) {
      worker.kill("SIGKILL");
    }
  }

  private async reloadWhenSafe(force: boolean): Promise<void> {
    if (this.closing || !this.pendingReloadReason) return;
    if (!this.initializeRequest || !this.initializedNotification) {
      return;
    }

    if (this.inFlightClientRequestIds.size > 0 && !force) {
      if (!this.reloadGraceTimer) {
        this.reloadGraceTimer = setTimeout(() => {
          this.reloadGraceTimer = undefined;
          this.reloadWhenSafe(true).catch(this.onError);
        }, this.options.restartGraceMs ?? defaultRestartGraceMs);
      }
      return;
    }

    const reason = this.pendingReloadReason;
    this.pendingReloadReason = undefined;
    if (this.reloadGraceTimer) {
      clearTimeout(this.reloadGraceTimer);
      this.reloadGraceTimer = undefined;
    }

    this.failInFlightRequests("InkSMCP hot reload restarted the worker before this request completed.");
    await this.stopWorker();
    await this.startWorker();
    await this.flushClientQueue();
    await this.sendHotReloadNotifications(reason);
  }

  private failInFlightRequests(message: string): void {
    for (const id of this.inFlightClientRequestIds) {
      this.sendToClient({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message },
      }).catch(this.onError);
    }
    this.inFlightClientRequestIds.clear();
  }

  private async sendHotReloadNotifications(reason: string): Promise<void> {
    this.options.stderr?.write(`[inksmcp-hot] reloaded worker: ${reason}\n`);
    await this.sendToClient({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    await this.sendToClient({ jsonrpc: "2.0", method: "notifications/resources/list_changed" });
    await this.sendToClient({ jsonrpc: "2.0", method: "notifications/prompts/list_changed" });
  }

  private async sendToWorker(message: JSONRPCMessage): Promise<void> {
    const worker = this.worker;
    if (!worker?.stdin.writable) {
      this.queuedClientMessages.push(message);
      return;
    }
    await writeSerialized(worker.stdin, message);
  }

  private async sendToClient(message: JSONRPCMessage): Promise<void> {
    await writeSerialized(this.options.clientOutput, message);
  }

  private async startWatchers(): Promise<void> {
    for (const watchPath of this.options.watchPaths ?? []) {
      await this.watchRecursively(path.resolve(watchPath));
    }
  }

  private async watchRecursively(targetPath: string): Promise<void> {
    const targetStat = await stat(targetPath).catch(() => undefined);
    if (!targetStat) return;
    const directories = targetStat.isDirectory() ? await collectDirectories(targetPath) : [path.dirname(targetPath)];
    for (const directory of directories) {
      if (this.watchedDirectories.has(directory)) continue;
      this.watchedDirectories.add(directory);
      const watcher = watch(directory, { persistent: true }, (_event, filename) => {
        if (filename) {
          const changedPath = path.join(directory, filename.toString());
          stat(changedPath)
            .then((info) => {
              if (info.isDirectory() && !this.watchedDirectories.has(changedPath)) {
                this.watchRecursively(changedPath).catch(this.onError);
              }
            })
            .catch(() => undefined);
        }
        this.requestReload(filename ? `${directory}${path.sep}${filename.toString()}` : directory);
      });
      watcher.on("error", this.onError);
      this.watchers.push(watcher);
    }
  }
}

export function defaultHotWorkerArgs(entryPath: string): { command: string; args: string[]; watchPaths: string[] } {
  const entryDir = path.dirname(entryPath);
  return {
    command: process.execPath,
    args: [path.join(entryDir, "server.js")],
    watchPaths: [entryDir],
  };
}

async function collectDirectories(root: string): Promise<string[]> {
  const result = [root];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const childDirectories = await collectDirectories(path.join(root, entry.name));
    result.push(...childDirectories);
  }
  return result;
}

function isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
  return "method" in message && typeof message.method === "string" && Object.prototype.hasOwnProperty.call(message, "id");
}

function isNotification(message: JSONRPCMessage): message is JSONRPCNotification {
  return "method" in message && typeof message.method === "string" && !Object.prototype.hasOwnProperty.call(message, "id");
}

function isResponse(message: JSONRPCMessage): message is JSONRPCMessage & { id: RequestId } {
  return Object.prototype.hasOwnProperty.call(message, "id") && ("result" in message || "error" in message);
}

function writeSerialized(output: Writable, message: JSONRPCMessage): Promise<void> {
  return new Promise((resolve) => {
    if (output.write(serializeMessage(message))) {
      resolve();
    } else {
      output.once("drain", resolve);
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
