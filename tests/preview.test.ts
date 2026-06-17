import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InkscapeCli,
  unsafeActiveWindowRefreshEnv,
} from "../src/adapters/inkscape-cli.js";
import { InkMcpError } from "../src/core/errors.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { addElement } from "../src/tools/elements.js";
import { refreshInInkscape } from "../src/tools/preview.js";

describe("preview tools", () => {
  let root: string;
  let workspace: Workspace;
  let previousUnsafeRefresh: string | undefined;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-preview-"));
    workspace = new Workspace(root);
    previousUnsafeRefresh = process.env[unsafeActiveWindowRefreshEnv];
    delete process.env[unsafeActiveWindowRefreshEnv];
  });

  afterEach(async () => {
    if (previousUnsafeRefresh === undefined) {
      delete process.env[unsafeActiveWindowRefreshEnv];
    } else {
      process.env[unsafeActiveWindowRefreshEnv] = previousUnsafeRefresh;
    }
    await rm(root, { recursive: true, force: true });
  });

  it("returns a warning when companion refresh is disabled by the adapter", async () => {
    await workspace.createDocument(
      "refresh-doc",
      "Refresh doc",
      createSvgDocument({ title: "Refresh doc", width: 20, height: 20, unit: "px" }),
    );
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockRejectedValue(
      new InkMcpError("INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED", "Unsafe active-window refresh disabled."),
    );
    const rebase = vi.spyOn(inkscape, "refreshActiveWindow");

    const result = await refreshInInkscape({ docId: "refresh-doc", allowUnstableRebase: false }, { workspace, inkscape });

    expect(rebase).not.toHaveBeenCalled();
    expect(companion).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      refreshed: false,
      warnings: [expect.objectContaining({ code: "INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED" })],
    });
  });

  it("keeps unstable active-window rebase disabled when companion refresh is explicitly disabled", async () => {
    await workspace.createDocument(
      "refresh-doc",
      "Refresh doc",
      createSvgDocument({ title: "Refresh doc", width: 20, height: 20, unit: "px" }),
    );
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");
    const rebase = vi.spyOn(inkscape, "refreshActiveWindow");

    const result = await refreshInInkscape(
      { docId: "refresh-doc", allowUnstableRebase: false, useCompanionExtension: false },
      { workspace, inkscape },
    );

    expect(companion).not.toHaveBeenCalled();
    expect(rebase).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      refreshed: false,
      warnings: [expect.objectContaining({ code: "UNSTABLE_REBASE_DISABLED" })],
    });
  });

  it("attempts structural auto-refresh without failing a successful write", async () => {
    await workspace.createDocument(
      "write-doc",
      "Write doc",
      createSvgDocument({ title: "Write doc", width: 20, height: 20, unit: "px" }),
    );
    const inkscape = new InkscapeCli();
    const companion = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await addElement(
      {
        docId: "write-doc",
        type: "rect",
        attributes: { id: "box", x: 1, y: 1, width: 10, height: 10, fill: "#ff0000" },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({
      ok: true,
      elementId: "box",
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
    expect(companion).toHaveBeenCalledTimes(1);
    await expect(workspace.readSvg("write-doc")).resolves.toContain('id="box"');
  });
});
