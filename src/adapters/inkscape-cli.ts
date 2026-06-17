import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
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
  redraw?: {
    attempted: boolean;
    method: "win32_window_refresh";
    refreshed: boolean;
    details?: Record<string, unknown>;
  };
}

export interface CompanionRefreshOptions extends InkscapeRunOptions {
  docId: string;
  workspaceRoot: string;
}

export interface DirectAttributeUpdate {
  elementId: string;
  attributeName: string;
  value: string;
}

export interface DirectAttributeSyncOptions extends InkscapeRunOptions {
  updates: DirectAttributeUpdate[];
}

export interface ActionExportOptions extends InkscapeRunOptions {
  actions: string[];
  outputPath: string;
}

export const companionRefreshAction = "dev.hydens.inksmcp.pull-workspace-document.noprefs";
export const unsafeActiveWindowRefreshEnv = "INKSMCP_ENABLE_UNSAFE_ACTIVE_WINDOW_REFRESH";
const companionConfigFile = "inksmcp-extension.json";

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

  async refreshActiveWindow(inputSvgPath: string, options: InkscapeRunOptions = {}): Promise<InkscapeResult> {
    await stat(inputSvgPath);
    return this.run(["--active-window", `--actions=file-rebase:${inputSvgPath}`], options);
  }

  async syncActiveWindowAttributes(options: DirectAttributeSyncOptions): Promise<InkscapeResult> {
    if (options.updates.length === 0) {
      const binary = await this.requireBinary();
      return { binaryPath: binary, stdout: "", stderr: "", exitCode: 0 };
    }
    return this.run(["--active-window", `--actions=${buildActiveWindowAttributeSyncActions(options.updates)}`], options);
  }

  async refreshActiveWindowWithCompanionExtension(options: CompanionRefreshOptions): Promise<InkscapeResult> {
    await this.writeCompanionConfig({
      workspaceRoot: options.workspaceRoot,
      activeDocId: options.docId,
    });
    const result = await this.run([`--actions=active-window-start;${companionRefreshAction};active-window-end`], options);
    if (process.platform !== "win32") {
      return result;
    }
    return {
      ...result,
      redraw: await this.tryWindowsGuiRefresh(options.timeoutMs),
    };
  }

  async runActionsToSvg(inputSvgPath: string, options: ActionExportOptions): Promise<InkscapeResult> {
    const actionText = [...options.actions, `export-filename:${options.outputPath}`, "export-do"].join(";");
    return this.run([inputSvgPath, `--actions=${actionText}`], options);
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
    return this.runProcess(binary, args, timeout);
  }

  private async runProcess(binary: string, args: string[], timeoutMs: number): Promise<InkscapeResult> {
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
        reject(new InkMcpError("INKSCAPE_TIMEOUT", "Inkscape command timed out.", { timeoutMs }));
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

  private async writeCompanionConfig(config: { workspaceRoot: string; activeDocId: string }): Promise<void> {
    const userDataDir = await this.userDataDirectory();
    const extensionDir = path.join(userDataDir, "extensions");
    await mkdir(extensionDir, { recursive: true });
    await writeFile(
      path.join(extensionDir, companionConfigFile),
      `${JSON.stringify(
        {
          workspaceRoot: path.resolve(config.workspaceRoot),
          activeDocId: config.activeDocId,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  private async userDataDirectory(): Promise<string> {
    const result = await this.run(["--user-data-directory"], { timeoutMs: 15_000 });
    const directory = result.stdout.trim().split(/\r?\n/)[0]?.trim();
    if (!directory) {
      throw new InkMcpError("INKSCAPE_FAILED", "Could not discover Inkscape user data directory.");
    }
    return path.resolve(directory);
  }

  private async tryWindowsGuiRefresh(timeoutMs?: number): Promise<NonNullable<InkscapeResult["redraw"]>> {
    const script = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
namespace Win32 {
public static class Native {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern bool InvalidateRect(IntPtr hWnd, IntPtr rect, bool erase);
  [DllImport("user32.dll")] public static extern bool UpdateWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool RedrawWindow(IntPtr hWnd, IntPtr rect, IntPtr region, uint flags);
}
}
"@
$flags = 0x0001 -bor 0x0080 -bor 0x0100 -bor 0x0400
$handles = [System.Collections.Generic.List[string]]::new()
[Win32.Native]::EnumWindows({
  param($hWnd, $lParam)
  [uint32]$windowPid = 0
  [void][Win32.Native]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
  $title = [System.Text.StringBuilder]::new(512)
  $class = [System.Text.StringBuilder]::new(256)
  [void][Win32.Native]::GetWindowText($hWnd, $title, $title.Capacity)
  [void][Win32.Native]::GetClassName($hWnd, $class, $class.Capacity)
  if ($title.ToString() -like '*Inkscape*' -and $class.ToString() -eq 'gdkWindowToplevel') {
    [void][Win32.Native]::InvalidateRect($hWnd, [IntPtr]::Zero, $true)
    [void][Win32.Native]::RedrawWindow($hWnd, [IntPtr]::Zero, [IntPtr]::Zero, $flags)
    [void][Win32.Native]::UpdateWindow($hWnd)
    $handles.Add("$hWnd|$windowPid|$($title.ToString())") | Out-Null
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
[pscustomobject]@{ refreshed = ($handles.Count -gt 0); handles = $handles } | ConvertTo-Json -Compress
`;
    try {
      const result = await this.runProcess("powershell", ["-NoProfile", "-Command", script], timeoutMs ?? 5_000);
      const parsed = safeJsonParse(result.stdout);
      return {
        attempted: true,
        method: "win32_window_refresh",
        refreshed: Boolean(parsed && typeof parsed === "object" && "refreshed" in parsed ? (parsed as Record<string, unknown>).refreshed : false),
        details: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined,
      };
    } catch (error) {
      return {
        attempted: true,
        method: "win32_window_refresh",
        refreshed: false,
        details: { message: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

export function isUnsafeActiveWindowRefreshDisabled(): boolean {
  return process.platform === "win32" && process.env[unsafeActiveWindowRefreshEnv] !== "1";
}

export function buildActiveWindowAttributeSyncActions(updates: DirectAttributeUpdate[]): string {
  const actions = ["select-clear"];
  for (const update of updates) {
    actions.push(
      `select-by-id:${encodeActionValue(assertSafeActionElementId(update.elementId))}`,
      `object-set-attribute:${encodeActionValue(assertSafeActionAttributeName(update.attributeName))},${encodeActionValue(update.value)}`,
      "select-clear",
    );
  }
  return actions.join(";");
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

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function assertSafeActionElementId(elementId: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(elementId)) {
    throw new InkMcpError("INVALID_INPUT", "Element id is not safe for Inkscape active-window action sync.", {
      elementId,
    });
  }
  return elementId;
}

function assertSafeActionAttributeName(attributeName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,79}$/.test(attributeName) || attributeName === "id") {
    throw new InkMcpError("INVALID_INPUT", "Attribute name is not safe for Inkscape active-window action sync.", {
      attributeName,
    });
  }
  return attributeName;
}

function encodeActionValue(value: string): string {
  if (/[;\r\n]/.test(value)) {
    throw new InkMcpError("INVALID_INPUT", "Value is not safe for Inkscape active-window action sync.");
  }
  return value;
}
