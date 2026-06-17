import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ReadBuffer, serializeMessage } from "@modelcontextprotocol/sdk/shared/stdio.js";
import type { Notification } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HotReloadProxy } from "../src/hot-proxy.js";

describe("HotReloadProxy", () => {
  let root: string;
  let proxy: HotReloadProxy | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-hot-proxy-"));
  });

  afterEach(async () => {
    await proxy?.close();
    await rm(root, { recursive: true, force: true });
  });

  it("restarts the worker and lets the same client see the updated tool list", async () => {
    const workerPath = path.join(root, "worker.mjs");
    await writeFile(workerPath, workerScript("old_tool", process.cwd()), "utf8");

    const clientOutput = new PassThrough();
    const proxyInput = new PassThrough();
    const proxyOutput = new PassThrough();
    const clientInput = new PassThrough();
    clientOutput.pipe(proxyInput);
    proxyOutput.pipe(clientInput);
    const transport = new MemoryClientTransport(clientOutput, clientInput);
    const listChangedNotifications: Notification[] = [];
    const client = new Client({ name: "hot-proxy-test", version: "0.0.0" });
    client.fallbackNotificationHandler = (notification) => {
      if (notification.method === "notifications/tools/list_changed") {
        listChangedNotifications.push(notification);
      }
    };

    proxy = new HotReloadProxy({
      clientInput: proxyInput,
      clientOutput: proxyOutput,
      workerCommand: process.execPath,
      workerArgs: [workerPath],
      watchPaths: [root],
      debounceMs: 50,
      restartGraceMs: 200,
      stderr: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    });

    await proxy.start();
    await client.connect(transport, { timeout: 1_000 });
    await expect(client.listTools(undefined, { timeout: 1_000 })).resolves.toMatchObject({
      tools: [expect.objectContaining({ name: "old_tool" })],
    });

    await writeFile(workerPath, workerScript("new_tool", process.cwd()), "utf8");
    await waitFor(() => listChangedNotifications.length > 0);

    await expect(client.listTools(undefined, { timeout: 1_000 })).resolves.toMatchObject({
      tools: [expect.objectContaining({ name: "new_tool" })],
    });

    await client.close();
  });
});

class MemoryClientTransport {
  onmessage?: (message: unknown, extra?: unknown) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  private readonly readBuffer = new ReadBuffer();

  constructor(
    private readonly clientOutput: PassThrough,
    private readonly clientInput: PassThrough,
  ) {}

  async start(): Promise<void> {
    this.clientInput.on("data", this.onData);
    this.clientInput.on("error", this.onError);
  }

  async close(): Promise<void> {
    this.clientInput.off("data", this.onData);
    this.clientInput.off("error", this.onError);
    this.onclose?.();
  }

  async send(message: unknown): Promise<void> {
    this.clientOutput.write(serializeMessage(message));
  }

  private readonly onData = (chunk: Buffer) => {
    this.readBuffer.append(chunk);
    while (true) {
      const message = this.readBuffer.readMessage();
      if (!message) break;
      this.onmessage?.(message);
    }
  };

  private readonly onError = (error: Error) => {
    this.onerror?.(error);
  };
}

function workerScript(toolName: string, projectRoot: string): string {
  return `
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(${JSON.stringify(`${projectRoot}${path.sep}package.json`)});
const { McpServer } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/mcp.js")).href);
const { StdioServerTransport } = await import(pathToFileURL(require.resolve("@modelcontextprotocol/sdk/server/stdio.js")).href);

const server = new McpServer({ name: "fake-worker", version: "0.0.0" });
server.registerTool("${toolName}", { title: "${toolName}" }, () => ({
  content: [{ type: "text", text: "${toolName}" }],
  structuredContent: { ok: true }
}));
await server.connect(new StdioServerTransport());
`;
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
