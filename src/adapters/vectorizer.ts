import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { InkMcpError } from "../core/errors.js";

export interface VectorizeOptions {
  inputPath: string;
  outputPath: string;
  engine: "vtracer" | "potrace";
  timeoutMs?: number;
}

export interface VectorizeResult {
  binaryPath: string;
  engine: "vtracer" | "potrace";
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class VectorizerCli {
  private readonly discovered = new Map<string, string | null>();

  async vectorize(options: VectorizeOptions): Promise<VectorizeResult> {
    const binary = await this.requireBinary(options.engine);
    const timeout = resolveTimeout(options.timeoutMs);
    const args =
      options.engine === "vtracer"
        ? ["--input", options.inputPath, "--output", options.outputPath]
        : [options.inputPath, "--svg", "--output", options.outputPath];
    const result = await runProcess(binary, args, timeout);
    return { ...result, binaryPath: binary, engine: options.engine };
  }

  async requireBinary(engine: "vtracer" | "potrace"): Promise<string> {
    const binary = await this.discover(engine);
    if (!binary) {
      throw new InkMcpError("INKSCAPE_UNAVAILABLE", `${engine} binary was not found.`, {
        checked: `${engine.toUpperCase()}_BIN, PATH`,
      });
    }
    return binary;
  }

  async discover(engine: "vtracer" | "potrace"): Promise<string | null> {
    if (this.discovered.has(engine)) return this.discovered.get(engine) ?? null;
    const envName = `${engine.toUpperCase()}_BIN`;
    const names = process.platform === "win32" ? [`${engine}.exe`, engine] : [engine];
    const candidates = [
      ...(process.env[envName] ? [process.env[envName] as string] : []),
      ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).flatMap((part) => names.map((name) => path.join(part, name))),
    ].map((candidate) => path.resolve(candidate));
    for (const candidate of [...new Set(candidates)]) {
      if (await fileExists(candidate)) {
        this.discovered.set(engine, candidate);
        return candidate;
      }
    }
    this.discovered.set(engine, null);
    return null;
  }
}

async function runProcess(binary: string, args: string[], timeoutMs: number): Promise<Omit<VectorizeResult, "binaryPath" | "engine">> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new InkMcpError("INKSCAPE_TIMEOUT", "Vectorizer command timed out.", { timeoutMs }));
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new InkMcpError("INKSCAPE_FAILED", "Failed to start vectorizer.", { message: error.message }));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (exitCode !== 0) {
        reject(
          new InkMcpError("INKSCAPE_FAILED", "Vectorizer command failed.", {
            exitCode,
            stderr: stderr.slice(0, 2000),
          }),
        );
        return;
      }
      resolve({ stdout, stderr, exitCode: exitCode ?? 0 });
    });
  });
}

function resolveTimeout(timeoutMs?: number): number {
  const maxTimeout = positiveEnvInt("INKSMCP_MAX_TIMEOUT_MS") ?? 120_000;
  const requested = timeoutMs ?? positiveEnvInt("INKSMCP_VECTORIZER_TIMEOUT_MS") ?? 30_000;
  if (requested < 1000 || requested > maxTimeout) {
    throw new InkMcpError("INVALID_INPUT", "Vectorizer timeout must be between 1000 and INKSMCP_MAX_TIMEOUT_MS.", {
      timeoutMs: requested,
      maxTimeout,
    });
  }
  return requested;
}

function positiveEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
