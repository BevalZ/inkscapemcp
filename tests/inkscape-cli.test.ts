import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildActiveWindowAttributeSyncActions,
  companionRefreshAction,
  companionPushGuiStateAction,
  InkscapeCli,
  unsafeActiveWindowRefreshEnv,
} from "../src/adapters/inkscape-cli.js";

describe("InkscapeCli", () => {
  let previousUnsafeRefresh: string | undefined;
  let tempRoots: string[] = [];

  beforeEach(() => {
    previousUnsafeRefresh = process.env[unsafeActiveWindowRefreshEnv];
    delete process.env[unsafeActiveWindowRefreshEnv];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousUnsafeRefresh === undefined) {
      delete process.env[unsafeActiveWindowRefreshEnv];
    } else {
      process.env[unsafeActiveWindowRefreshEnv] = previousUnsafeRefresh;
    }
  });

  afterEach(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
    tempRoots = [];
  });

  it("builds direct active-window attribute sync actions without reloading the document", () => {
    expect(
      buildActiveWindowAttributeSyncActions([
        { elementId: "fish-body", attributeName: "fill", value: "#22c55e" },
        { elementId: "fish-tail", attributeName: "stroke", value: "#15803d" },
      ]),
    ).toBe(
      "select-clear;select-by-id:fish-body;object-set-attribute:fill,#22c55e;select-clear;select-by-id:fish-tail;object-set-attribute:stroke,#15803d;select-clear",
    );
  });

  it("uses the registered companion action id for GUI state push", () => {
    expect(companionPushGuiStateAction).toBe("dev.hydens.inksmcp.push-gui-state.noprefs");
  });

  it("diagnoses installed companion extension files, action declarations, and config", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-cli-diagnose-"));
    tempRoots.push(root);
    const userDataDirectory = path.join(root, "inkscape-user-data");
    const extensionDirectory = path.join(userDataDirectory, "extensions");
    const workspaceRoot = path.join(root, "workspace");
    await mkdir(extensionDirectory, { recursive: true });
    await writeFile(
      path.join(extensionDirectory, "inksmcp_pull.inx"),
      companionInx("Pull Workspace Document", "dev.hydens.inksmcp.pull_workspace_document", "pull"),
      "utf8",
    );
    await writeFile(
      path.join(extensionDirectory, "inksmcp_push_gui_state.inx"),
      companionInx("Push GUI State", "dev.hydens.inksmcp.push_gui_state", "push"),
      "utf8",
    );
    await writeFile(path.join(extensionDirectory, "inksmcp_pull.py"), "# extension script\n", "utf8");
    await writeFile(
      path.join(extensionDirectory, "inksmcp-extension.json"),
      `${JSON.stringify({ workspaceRoot })}\n`,
      "utf8",
    );

    const diagnostics = await new TestInkscapeCli("inkscape", userDataDirectory).diagnoseGui();

    expect(diagnostics).toMatchObject({
      binaryAvailable: true,
      userDataDirectory,
      extensionDirectory,
      companionExtensionInstalled: true,
      pushExtensionInstalled: true,
      extensionSelfCheck: {
        pullAction: {
          ok: true,
          expectedActionId: companionRefreshAction,
          actionId: companionRefreshAction,
          actionParam: "pull",
          actionParamHidden: true,
          commandDeclared: true,
        },
        pushAction: {
          ok: true,
          expectedActionId: companionPushGuiStateAction,
          actionId: companionPushGuiStateAction,
          actionParam: "push",
          actionParamHidden: true,
          commandDeclared: true,
        },
        config: {
          ok: true,
          workspaceRoot: path.resolve(workspaceRoot),
        },
        capabilities: {
          sameWindowRefresh: true,
          bidirectionalGuiPull: true,
          configWorkspaceRoot: true,
        },
      },
    });
    expect(diagnostics.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INKSMCP_EXTENSION_ACTION_STALE" }),
        expect.objectContaining({ code: "INKSMCP_EXTENSION_CONFIG_INVALID" }),
      ]),
    );
  });

  it("diagnoses stale companion extension declarations and invalid config", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-cli-diagnose-bad-"));
    tempRoots.push(root);
    const userDataDirectory = path.join(root, "inkscape-user-data");
    const extensionDirectory = path.join(userDataDirectory, "extensions");
    await mkdir(extensionDirectory, { recursive: true });
    await writeFile(
      path.join(extensionDirectory, "inksmcp_pull.inx"),
      companionInx("Pull Workspace Document", "dev.hydens.inksmcp.old_pull", "manual"),
      "utf8",
    );
    await writeFile(
      path.join(extensionDirectory, "inksmcp_push_gui_state.inx"),
      companionInx("Push GUI State", "dev.hydens.inksmcp.push_gui_state", "push", { hiddenAction: false }),
      "utf8",
    );
    await writeFile(path.join(extensionDirectory, "inksmcp_pull.py"), "# extension script\n", "utf8");
    await writeFile(path.join(extensionDirectory, "inksmcp-extension.json"), "{not json", "utf8");

    const diagnostics = await new TestInkscapeCli("inkscape", userDataDirectory).diagnoseGui();

    expect(diagnostics.extensionSelfCheck).toMatchObject({
      pullAction: {
        ok: false,
        extensionId: "dev.hydens.inksmcp.old_pull",
        actionParam: "manual",
      },
      pushAction: {
        ok: false,
        actionParamHidden: false,
      },
      config: {
        ok: false,
        exists: true,
      },
      capabilities: {
        sameWindowRefresh: false,
        bidirectionalGuiPull: false,
      },
    });
    expect(diagnostics.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INKSMCP_EXTENSION_ACTION_STALE" }),
        expect.objectContaining({ code: "INKSMCP_EXTENSION_ACTION_PARAM_STALE" }),
        expect.objectContaining({ code: "INKSMCP_EXTENSION_ACTION_PARAM_VISIBLE" }),
        expect.objectContaining({ code: "INKSMCP_EXTENSION_CONFIG_INVALID" }),
      ]),
    );
  });
});

class TestInkscapeCli extends InkscapeCli {
  constructor(
    private readonly binary: string,
    private readonly userDataDir: string,
  ) {
    super();
  }

  override async discover(): Promise<string | null> {
    return this.binary;
  }

  protected override async userDataDirectoryWithTimeout(): Promise<string> {
    return this.userDataDir;
  }
}

function companionInx(
  name: string,
  extensionId: string,
  action: string,
  options: { hiddenAction?: boolean } = {},
): string {
  const guiHidden = options.hiddenAction === false ? "false" : "true";
  return `<?xml version="1.0" encoding="UTF-8"?>
<inkscape-extension xmlns="http://www.inkscape.org/namespace/inkscape/extension">
  <name>${name}</name>
  <id>${extensionId}</id>
  <param name="action" type="string" gui-hidden="${guiHidden}">${action}</param>
  <script>
    <command location="inx" interpreter="python">inksmcp_pull.py</command>
  </script>
</inkscape-extension>
`;
}
