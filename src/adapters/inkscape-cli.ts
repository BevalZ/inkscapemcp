import { access, copyFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { InkMcpError } from "../core/errors.js";

export interface InkscapeRunOptions {
  timeoutMs?: number;
}

export interface ExportOptions extends InkscapeRunOptions {
  width?: number;
  dpi?: number;
  background?: string;
  textToPath?: boolean;
}

export interface InkscapeResult {
  binaryPath: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class InkscapeCli {
  private binaryPath?: string | null;

  async discover(): Promise<string | null> {
    if (this.binaryPath !== undefined) return this.binaryPath;

    const candidates = await this.discoveryCandidates();
    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        this.binaryPath = candidate;
        return candidate;
      }
    }

    this.binaryPath = null;
    return null;
  }

  async requireBinary(): Promise<string> {
    const binary = await this.discover();
    if (!binary) {
      throw new InkMcpError("INKSCAPE_UNAVAILABLE", "Inkscape binary was not found.", {
        checked: "INKSCAPE_BIN, inksmcp.config.json, PATH, known Windows paths",
      });
    }
    return binary;
  }

  resolveTimeout(timeoutMs?: number): number {
    const maxTimeout = positiveEnvInt("INKSMCP_MAX_TIMEOUT_MS") ?? 120_000;
    const configuredDefault = positiveEnvInt("INKSMCP_INKSCAPE_TIMEOUT_MS") ?? 30_000;
    const requested = timeoutMs ?? configuredDefault;

    if (requested < 1000 || requested > maxTimeout) {
      throw new InkMcpError("INVALID_INPUT", "Inkscape timeout must be between 1000 and INKSMCP_MAX_TIMEOUT_MS.", {
        timeoutMs: requested,
        maxTimeout,
      });
    }

    return Math.min(requested, maxTimeout);
  }

  async renderPng(inputSvgPath: string, outputPngPath: string, options: ExportOptions = {}): Promise<InkscapeResult> {
    return this.runExport(inputSvgPath, outputPngPath, {
      ...options,
      textToPath: false,
    });
  }

  async exportDocument(inputSvgPath: string, outputPath: string, options: ExportOptions = {}): Promise<InkscapeResult> {
    if (path.extname(outputPath).toLowerCase() === ".svg" && !options.textToPath) {
      const binary = await this.requireBinary();
      await copyFile(inputSvgPath, outputPath);
      return { binaryPath: binary, stdout: "", stderr: "", exitCode: 0 };
    }
    return this.runExport(inputSvgPath, outputPath, options);
  }

  async open(inputSvgPath: string): Promise<{ binaryPath: string; pid: number | undefined }> {
    const binary = await this.requireBinary();
    await stat(inputSvgPath);
    const child = spawn(binary, [inputSvgPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    return { binaryPath: binary, pid: child.pid };
  }

  private async runExport(inputSvgPath: string, outputPath: string, options: ExportOptions): Promise<InkscapeResult> {
    const args = [inputSvgPath, `--export-filename=${outputPath}`];
    if (options.width) args.push(`--export-width=${options.width}`);
    if (options.dpi) args.push(`--export-dpi=${options.dpi}`);
    if (options.background) args.push(`--export-background=${options.background}`);
    if (options.textToPath) args.push("--export-text-to-path");
    return this.run(args, options);
  }

  private async run(args: string[], options: InkscapeRunOptions = {}): Promise<InkscapeResult> {
    const binary = await this.requireBinary();
    const timeout = this.resolveTimeout(options.timeoutMs);

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
        reject(new InkMcpError("INKSCAPE_TIMEOUT", "Inkscape command timed out.", { timeoutMs: timeout }));
      }, timeout);

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
        reject(new InkMcpError("INKSCAPE_FAILED", "Failed to start Inkscape.", { message: error.message }));
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (exitCode !== 0) {
          reject(
            new InkMcpError("INKSCAPE_FAILED", "Inkscape command failed.", {
              exitCode,
              stderr: stderr.slice(0, 2000),
            }),
          );
          return;
        }
        resolve({ binaryPath: binary, stdout, stderr, exitCode: exitCode ?? 0 });
      });
    });
  }

  private async discoveryCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    if (process.env.INKSCAPE_BIN) candidates.push(process.env.INKSCAPE_BIN);

    const configPath = path.resolve(process.cwd(), "inksmcp.config.json");
    if (await fileExists(configPath)) {
      const config = JSON.parse(await readFile(configPath, "utf8")) as { inkscapeBin?: string };
      if (config.inkscapeBin) candidates.push(config.inkscapeBin);
    }

    candidates.push(...pathCandidates());
    candidates.push(
      "D:\\Software\\Scoop\\apps\\inkscape\\current\\bin\\inkscape.com",
      "C:\\Program Files\\Inkscape\\bin\\inkscape.com",
      "C:\\Program Files\\Inkscape\\bin\\inkscape.exe",
    );

    return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function pathCandidates(): string[] {
  const names = process.platform === "win32" ? ["inkscape.com", "inkscape.exe", "inkscape"] : ["inkscape"];
  const pathParts = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  return pathParts.flatMap((part) => names.map((name) => path.join(part, name)));
}

function positiveEnvInt(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
