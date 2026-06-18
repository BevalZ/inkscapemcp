import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pythonBin = process.env.PYTHON ?? "python";

describe("Inkscape companion extension", () => {
  let tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
    tempRoots = [];
  });

  it("declares the pull extension and Python command", async () => {
    const inx = await readFile(path.join(repoRoot, "inkscape-extension", "inksmcp_pull.inx"), "utf8");

    expect(inx).toContain("<submenu name=\"InkSMCP\"/>");
    expect(inx).toContain("<command location=\"inx\" interpreter=\"python\">inksmcp_pull.py</command>");
    expect(inx).toContain("<param name=\"doc_id\" type=\"string\"");
  });

  it("declares the hidden push GUI state extension action", async () => {
    const inx = await readFile(path.join(repoRoot, "inkscape-extension", "inksmcp_push_gui_state.inx"), "utf8");

    expect(inx).toContain("<id>dev.hydens.inksmcp.push_gui_state</id>");
    expect(inx).toContain("<param name=\"action\" type=\"string\" gui-hidden=\"true\">push</param>");
    expect(inx).toContain("<command location=\"inx\" interpreter=\"python\">inksmcp_pull.py</command>");
  });

  it("passes the extension path-resolution self-test", async () => {
    await execFile(pythonBin, [path.join(repoRoot, "inkscape-extension", "inksmcp_pull.py"), "--self-test"], {
      timeout: 15000,
      windowsHide: true,
    });
  });

  it("installs extension files and workspace config into an explicit Inkscape user data directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-extension-install-"));
    tempRoots.push(root);
    const userDataDir = path.join(root, "inkscape-user-data");
    const workspaceRoot = path.join(root, "workspace");

    await execFile(
      process.execPath,
      [
        path.join(repoRoot, "scripts", "install-inkscape-extension.mjs"),
        "--user-data-dir",
        userDataDir,
        "--workspace",
        workspaceRoot,
      ],
      { timeout: 15000, windowsHide: true },
    );

    const extensionDir = path.join(userDataDir, "extensions");
    await expect(readFile(path.join(extensionDir, "inksmcp_pull.inx"), "utf8")).resolves.toContain(
      "Pull Workspace Document",
    );
    await expect(readFile(path.join(extensionDir, "inksmcp_pull.py"), "utf8")).resolves.toContain(
      "resolve_requested_svg",
    );
    await expect(readFile(path.join(extensionDir, "inksmcp_push_gui_state.inx"), "utf8")).resolves.toContain(
      "Push GUI State",
    );

    const config = JSON.parse(await readFile(path.join(extensionDir, "inksmcp-extension.json"), "utf8")) as {
      workspaceRoot: string;
    };
    expect(config.workspaceRoot).toBe(path.resolve(workspaceRoot));
  });
});
