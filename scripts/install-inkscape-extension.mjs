#!/usr/bin/env node
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionSourceDir = join(repoRoot, "inkscape-extension");

const options = parseArgs(process.argv.slice(2));
const workspaceRoot = resolve(options.workspace ?? process.env.INKSMCP_WORKSPACE ?? join(repoRoot, "workspace"));
const userDataDir = resolve(
  options.userDataDir ?? (await resolveInkscapeUserDataDir(options.inkscapeBin ?? process.env.INKSCAPE_BIN)),
);
const extensionTargetDir = join(userDataDir, "extensions");

await mkdir(extensionTargetDir, { recursive: true });
await copyFile(join(extensionSourceDir, "inksmcp_pull.inx"), join(extensionTargetDir, "inksmcp_pull.inx"));
await copyFile(join(extensionSourceDir, "inksmcp_push_gui_state.inx"), join(extensionTargetDir, "inksmcp_push_gui_state.inx"));
await copyFile(join(extensionSourceDir, "inksmcp_pull.py"), join(extensionTargetDir, "inksmcp_pull.py"));
await writeFile(
  join(extensionTargetDir, "inksmcp-extension.json"),
  `${JSON.stringify({ workspaceRoot }, null, 2)}\n`,
  "utf8",
);

console.log(`Installed InkSMCP Inkscape extension to: ${extensionTargetDir}`);
console.log(`Configured workspace root: ${workspaceRoot}`);
console.log("Restart Inkscape once so already-open windows load the extension action.");
console.log("MCP write tools will then refresh the active window automatically; the menu item remains a manual fallback.");

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    const [name, inlineValue] = arg.split("=", 2);
    if (!name.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const value = inlineValue ?? args[++index];
    if (!value) {
      throw new Error(`Missing value for ${name}`);
    }
    switch (name) {
      case "--workspace":
        parsed.workspace = value;
        break;
      case "--user-data-dir":
        parsed.userDataDir = value;
        break;
      case "--inkscape-bin":
        parsed.inkscapeBin = value;
        break;
      default:
        throw new Error(`Unknown option: ${name}`);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run install:inkscape-extension -- [options]

Options:
  --workspace <path>      InkSMCP workspace root. Defaults to INKSMCP_WORKSPACE or ./workspace.
  --user-data-dir <path>  Inkscape user data directory. Defaults to Inkscape --user-data-directory.
  --inkscape-bin <path>   Inkscape binary used for directory discovery. Defaults to INKSCAPE_BIN or PATH.
`);
}

async function resolveInkscapeUserDataDir(explicitBin) {
  const discovered = explicitBin
    ? await userDataFromBinary(explicitBin)
    : await firstUserDataDir(["inkscape.com", "inkscape", defaultWindowsInkscapeBin()].filter(Boolean));
  if (discovered) {
    return discovered;
  }
  const fallback = defaultUserDataDir();
  if (fallback) {
    return fallback;
  }
  throw new Error(
    "Could not discover Inkscape user data directory. Pass --user-data-dir or set INKSCAPE_BIN.",
  );
}

async function firstUserDataDir(candidates) {
  for (const candidate of candidates) {
    const discovered = await userDataFromBinary(candidate).catch(() => undefined);
    if (discovered) {
      return discovered;
    }
  }
  return undefined;
}

async function userDataFromBinary(binaryPath) {
  if (binaryPath.includes("\\") || binaryPath.includes("/")) {
    await access(binaryPath, constants.X_OK).catch(() => access(binaryPath, constants.F_OK));
  }
  const { stdout } = await execFile(binaryPath, ["--user-data-directory"], {
    windowsHide: true,
    timeout: 15000,
  });
  const directory = stdout.trim().split(/\r?\n/)[0]?.trim();
  return directory || undefined;
}

function defaultWindowsInkscapeBin() {
  if (process.platform !== "win32") {
    return undefined;
  }
  return "D:\\Software\\Scoop\\apps\\inkscape\\current\\bin\\inkscape.com";
}

function defaultUserDataDir() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "inkscape");
  }
  if (process.platform === "darwin" && process.env.HOME) {
    return join(process.env.HOME, "Library", "Application Support", "org.inkscape.Inkscape", "config", "inkscape");
  }
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "inkscape");
  }
  if (process.env.HOME) {
    return join(process.env.HOME, ".config", "inkscape");
  }
  return undefined;
}
