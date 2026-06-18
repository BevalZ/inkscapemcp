import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkscapeCli } from "../src/adapters/inkscape-cli.js";
import { Workspace } from "../src/adapters/workspace.js";
import { createSvgDocument } from "../src/core/svg-document.js";
import { injectInkMcpMarker, stripInkMcpMetadata } from "../src/core/sync-metadata.js";
import { addElement, updateElement } from "../src/tools/elements.js";
import {
  connectInkscapeWindow,
  createGuiSyncPollRegistry,
  getGuiSyncStatus,
  pullGuiState,
  startGuiSyncPolling,
  stopGuiSyncPolling,
} from "../src/tools/sync.js";
import { exportDocument } from "../src/tools/preview.js";
import { queryDocument, recoverDocument, rollbackDocument } from "../src/tools/document.js";

describe("bidirectional GUI sync", () => {
  let root: string;
  let workspace: Workspace;
  let inkscape: InkscapeCli;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "inksmcp-sync-"));
    workspace = new Workspace(root);
    inkscape = new InkscapeCli();
    await workspace.createDocument("fish", "Fish", baseSvg("#f9a8d4"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("connects a document by injecting a marker and creating connection config", async () => {
    const result = await connectInkscapeWindow(
      {
        docId: "fish",
        syncMode: "bidirectional",
        documentPath: workspace.documentPaths("fish").currentSvg,
        runtimeDocumentId: "runtime-fish",
        windowId: "window-a",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({ ok: true, docId: "fish" });
    expect(result.identitySummary).toMatchObject({ strength: "full", ambiguous: false });
    expect(result.capabilitySummary).toMatchObject({ guiPush: "available_assumed", manifestVersion: 1 });
    const svg = await workspace.readSvg("fish");
    expect(svg).toContain("inksmcp-sync-metadata");
    const connection = await workspace.readConnection(result.connection.connectionId);
    expect(connection).toMatchObject({
      docId: "fish",
      syncMode: "bidirectional",
      state: "connected",
      runtimeDocumentId: "runtime-fish",
      windowId: "window-a",
      baselineRevision: 2,
      identitySummary: { strength: "full" },
      capabilitySummary: { guiPull: "available_assumed" },
    });
  });

  it("allows multiple bidirectional connections only when runtime window identity is explicit", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional", windowId: "window-a" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    await expect(
      connectInkscapeWindow(
        { docId: "fish", syncMode: "bidirectional" },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("provide windowId");

    const second = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional", windowId: "window-b" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(second.connection).toMatchObject({ windowId: "window-b" });
  });

  it("attempts to push the connection marker into the active window on connect", async () => {
    const refresh = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: true, timeoutMs: 1234 } },
    );

    expect(refresh).toHaveBeenCalledWith({
      docId: "fish",
      workspaceRoot: workspace.paths.root,
      timeoutMs: 1234,
    });
    expect(result).toMatchObject({
      ok: true,
      guiRefresh: { attempted: true, refreshed: true, method: "companion_extension" },
    });
  });

  it("pulls GUI state, updates revision metadata, and returns id diff without refreshing Inkscape", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#facc15", '<circle id="bubble" cx="80" cy="20" r="4"/>'), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        windowId: options.windowId,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          inferredDocId: options.docId,
          windowId: options.windowId,
          exportedAt: new Date().toISOString(),
          svgPath: workspace.guiPullSvgPath(options.requestId),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });
    const refresh = vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension");

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "reject",
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      wrote: true,
      idDiff: { added: ["bubble"], removed: [], retained: expect.arrayContaining(["body"]) },
    });
    expect(result.idDiff.retained).not.toContain("inksmcp-sync-metadata");
    await expect(workspace.readSvg("fish")).resolves.toContain('fill="#facc15"');
    const metadata = await workspace.readMetadata("fish");
    expect(metadata).toMatchObject({ revision: 3, lastWriter: "gui" });
    expect(metadata.lastGuiPullAt).toBeTruthy();
  });

  it("rejects GUI pulls with a mismatched window identity", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional", windowId: "window-a" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#facc15"), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        windowId: "window-b",
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          windowId: "window-b",
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        {
          docId: "fish",
          connectionId: connected.connection.connectionId,
          conflictPolicy: "reject",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("window id");
  });

  it("pre-pulls before writes and leaves workspace unchanged when GUI pull fails", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const before = await workspace.readSvg("fish");
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    await expect(
      updateElement(
        {
          docId: "fish",
          elementId: "body",
          setAttributes: { fill: "#22c55e" },
          removeAttributes: [],
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("GUI pull manifest");

    await expect(workspace.readSvg("fish")).resolves.toBe(before);
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.lastPulledAt).toBeUndefined();
  });

  it("rejects a GUI pull manifest with a mismatched request id", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      await writeFile(workspace.guiPullSvgPath(options.requestId), await workspace.readSvg("fish"), "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: "pull-different",
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        {
          docId: "fish",
          connectionId: connected.connection.connectionId,
          conflictPolicy: "reject",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("request id");
  });

  it("rejects GUI pull conflicts by default and supports prefer_gui", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_conflict", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="workspace-change" cx="5" cy="5" r="2"/></svg>'),
      result: {},
    }));
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#a7f3d0"), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        { docId: "fish", connectionId: connected.connection.connectionId, conflictPolicy: "reject" },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({
      code: "SYNC_CONFLICT",
      details: {
        conflictReport: expect.objectContaining({
          hasConflict: true,
          baseline: expect.objectContaining({ revision: 2 }),
          guiCandidate: expect.objectContaining({ idDiff: expect.any(Object) }),
        }),
      },
    });

    const result = await pullGuiState(
      { docId: "fish", connectionId: connected.connection.connectionId, conflictPolicy: "prefer_gui" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({ ok: true, wrote: true });
    await expect(workspace.readSvg("fish")).resolves.not.toContain("workspace-change");
    await expect(workspace.readSvg("fish")).resolves.toContain("#a7f3d0");
  });

  it("merges non-overlapping GUI and workspace changes conservatively", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_non_overlap", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="workspace-change" cx="5" cy="5" r="2" fill="#0f172a"/></svg>'),
      result: {},
    }));
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#a7f3d0"), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "merge_non_overlapping",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: true,
      merge: {
        ok: true,
        strategy: "merge_non_overlapping",
        appliedElementIds: expect.arrayContaining(["body", "tail"]),
      },
    });
    const svg = await workspace.readSvg("fish");
    expect(svg).toContain("workspace-change");
    expect(svg).toContain("#a7f3d0");
  });

  it("previews non-overlapping GUI and workspace changes without replacing current.svg", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_non_overlap", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="workspace-change" cx="5" cy="5" r="2" fill="#0f172a"/></svg>'),
      result: {},
    }));
    const beforePreview = await workspace.readSvg("fish");
    mockGuiPull(inkscape, workspace, baseSvg("#a7f3d0"));

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "previewable",
      merge: {
        ok: true,
        strategy: "merge_non_overlapping",
        appliedElementIds: expect.arrayContaining(["body", "tail"]),
      },
      mergePreview: {
        svgPath: expect.stringContaining("merge-previews"),
        metadataPath: expect.stringContaining("merge-previews"),
        status: "previewable",
        candidateKind: "merge_non_overlapping",
      },
    });
    await expect(workspace.readSvg("fish")).resolves.toBe(beforePreview);
    await expect(readFile(result.mergePreview?.svgPath as string, "utf8")).resolves.toContain("workspace-change");
    await expect(readFile(result.mergePreview?.svgPath as string, "utf8")).resolves.toContain("#a7f3d0");
  });

  it("previews a clean GUI pull without replacing current.svg or advancing connection baseline", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const beforePreview = await workspace.readSvg("fish");
    const beforeMetadata = await workspace.readMetadata("fish");
    const beforeConnection = await workspace.readConnection(connected.connection.connectionId);
    mockGuiPull(inkscape, workspace, baseSvg("#a7f3d0"));

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "clean",
      mergePreview: {
        status: "clean",
        candidateKind: "pulled_gui",
        svgPath: expect.stringContaining("merge-previews"),
      },
    });
    expect(result).not.toHaveProperty("conflictReport");
    expect(result).not.toHaveProperty("merge");
    await expect(workspace.readSvg("fish")).resolves.toBe(beforePreview);
    await expect(readFile(result.mergePreview?.svgPath as string, "utf8")).resolves.toContain("#a7f3d0");
    await expect(workspace.readMetadata("fish")).resolves.toMatchObject({
      revision: beforeMetadata.revision,
      contentHash: beforeMetadata.contentHash,
      lastWriter: beforeMetadata.lastWriter,
    });
    const afterConnection = await workspace.readConnection(connected.connection.connectionId);
    expect(afterConnection.baselineRevision).toBe(beforeConnection.baselineRevision);
    expect(afterConnection.baselineContentHash).toBe(beforeConnection.baselineContentHash);
    expect(afterConnection.lastPulledAt).toBe(beforeConnection.lastPulledAt);
  });

  it("reports same-attribute preview conflicts without writing current.svg", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_same_attribute", (currentSvg) => ({
      svg: currentSvg.replace('fill="#f9a8d4"', 'fill="#22c55e"'),
      result: {},
    }));
    const beforePreview = await workspace.readSvg("fish");
    mockGuiPull(inkscape, workspace, baseSvg("#a7f3d0"));

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "body",
            reason: "overlapping_element_change",
            classes: expect.arrayContaining(["same_attribute_changed"]),
          }),
        ]),
      },
    });
    expect(result).not.toHaveProperty("mergePreview");
    await expect(workspace.readSvg("fish")).resolves.toBe(beforePreview);
  });

  it("reports text preview conflicts", async () => {
    await workspace.createDocument("label-doc", "Label", textConflictSvg("hello"));
    const connected = await connectInkscapeWindow(
      { docId: "label-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("label-doc", "test_workspace_text", (currentSvg) => ({
      svg: currentSvg.replace(">hello</text>", ">workspace</text>"),
      result: {},
    }));
    const beforePreview = await workspace.readSvg("label-doc");
    mockGuiPull(inkscape, workspace, textConflictSvg("gui"));

    const result = await pullGuiState(
      {
        docId: "label-doc",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "label",
            classes: expect.arrayContaining(["text_changed_both"]),
          }),
        ]),
      },
    });
    await expect(workspace.readSvg("label-doc")).resolves.toBe(beforePreview);
  });

  it("reports one-sided delete preview conflicts", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_delete_conflict", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="body" stroke="#111827"'),
      result: {},
    }));
    mockGuiPull(inkscape, workspace, baseSvg("#f9a8d4").replace(/\s*<path id="body"[^>]+\/>\n/, ""));

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "body",
            classes: expect.arrayContaining(["element_deleted_one_side"]),
          }),
        ]),
      },
    });
  });

  it("reports concurrent same-id additions in preview mode", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_add_same_id", (currentSvg) => ({
      svg: currentSvg.replace("</svg>", '<circle id="shared-new" cx="5" cy="5" r="2" fill="#0f172a"/></svg>'),
      result: {},
    }));
    mockGuiPull(inkscape, workspace, baseSvg("#f9a8d4", '<rect id="shared-new" x="1" y="1" width="4" height="4" fill="#facc15"/>'));

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "shared-new",
            reason: "concurrent_add_same_id",
            classes: expect.arrayContaining(["concurrent_add_same_id"]),
          }),
        ]),
      },
    });
  });

  it("reports sibling order preview conflicts", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_order_conflict", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="body" stroke="#111827"'),
      result: {},
    }));
    mockGuiPull(inkscape, workspace, reorderedFishSvg());

    const result = await pullGuiState(
      {
        docId: "fish",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "tail",
            reason: "gui_reorder",
            classes: expect.arrayContaining(["sibling_order_changed"]),
          }),
        ]),
      },
    });
  });

  it("reports dependency-sensitive preview conflicts", async () => {
    await workspace.createDocument("defs-doc", "Defs", defsConflictSvg("#fff", "#000"));
    const connected = await connectInkscapeWindow(
      { docId: "defs-doc", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("defs-doc", "test_workspace_defs_conflict", (currentSvg) => ({
      svg: currentSvg.replace('stroke="#000"', 'stroke="#111827"'),
      result: {},
    }));
    mockGuiPull(inkscape, workspace, defsConflictSvg("#facc15", "#000"));

    const result = await pullGuiState(
      {
        docId: "defs-doc",
        connectionId: connected.connection.connectionId,
        conflictPolicy: "preview_only",
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      wrote: false,
      pullStatus: "conflict_only",
      merge: {
        ok: false,
        conflicts: expect.arrayContaining([
          expect.objectContaining({
            elementId: "paint",
            reason: "dependency_sensitive_change",
            classes: expect.arrayContaining(["dependency_sensitive_change"]),
          }),
        ]),
      },
    });
  });

  it("rejects merge_non_overlapping when both sides change the same element", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    await workspace.writeSvgWithSnapshot("fish", "test_workspace_overlap", (currentSvg) => ({
      svg: currentSvg.replace('id="body"', 'id="body" stroke="#111827"'),
      result: {},
    }));
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      const pulled = injectInkMcpMarker(baseSvg("#a7f3d0"), {
        connectionId: options.connectionId,
        docId: options.docId,
        syncMode: options.syncMode,
        updatedAt: new Date().toISOString(),
      });
      await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    await expect(
      pullGuiState(
        {
          docId: "fish",
          connectionId: connected.connection.connectionId,
          conflictPolicy: "merge_non_overlapping",
        },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toMatchObject({
      code: "SYNC_CONFLICT",
      details: {
        merge: expect.objectContaining({
          ok: false,
          conflicts: expect.arrayContaining([
            expect.objectContaining({ elementId: "body", reason: "overlapping_element_change" }),
          ]),
        }),
      },
    });
  });

  it("starts, reports, and stops lightweight GUI sync polling without overlapping pulls", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional", windowId: "window-a" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const ctx = {
      workspace,
      inkscape,
      autoRefresh: { enabled: false },
      guiSyncPolling: createGuiSyncPollRegistry(),
    };
    let releasePull: (() => void) | undefined;
    let resolvePullFinished!: () => void;
    const pullFinished = new Promise<void>((resolve) => {
      resolvePullFinished = resolve;
    });
    const pullStarted = new Promise<void>((resolve) => {
      vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
        resolve();
        await new Promise<void>((release) => {
          releasePull = release;
        });
        const pulled = injectInkMcpMarker(await workspace.readSvg("fish"), {
          connectionId: options.connectionId,
          docId: options.docId,
          syncMode: options.syncMode,
          windowId: options.windowId,
          updatedAt: new Date().toISOString(),
        });
        await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
        await writeFile(
          workspace.guiPullManifestPath(options.requestId),
          `${JSON.stringify({
            requestId: options.requestId,
            connectionId: options.connectionId,
            requestedDocId: options.docId,
            windowId: options.windowId,
            exportedAt: new Date().toISOString(),
          })}\n`,
          "utf8",
        );
        resolvePullFinished();
        return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
      });
    });

    try {
      const started = await startGuiSyncPolling(
        { docId: "fish", connectionId: connected.connection.connectionId, intervalMs: 250, persist: true },
        ctx,
      );
      expect(started).toMatchObject({
        ok: true,
        alreadyRunning: false,
        polling: {
          persistent: true,
          skippedPullCount: 0,
          conflictCount: 0,
          identitySummary: { strength: "window" },
        },
      });
      await pullStarted;
      await delay(350);
      const inFlightStatus = await getGuiSyncStatus({ connectionId: connected.connection.connectionId, includeHistory: true }, ctx);
      expect(inFlightStatus.polling[0]).toMatchObject({ skippedPullCount: expect.any(Number), persistent: true });
      expect(inFlightStatus.persistedPolling?.[0]).toMatchObject({
        connectionId: connected.connection.connectionId,
        state: "enabled",
      });
      expect(inkscape.pushGuiStateWithCompanionExtension).toHaveBeenCalledTimes(1);

      releasePull?.();
      await pullFinished;
      await waitForPollingStatus(ctx, connected.connection.connectionId, { pullCount: 1, inFlight: false });

      const stopped = await stopGuiSyncPolling({ connectionId: connected.connection.connectionId }, ctx);
      expect(stopped.stopped[0]).toMatchObject({ state: "stopped" });
    } finally {
      releasePull?.();
      await stopGuiSyncPolling({ connectionId: connected.connection.connectionId }, ctx).catch(() => undefined);
    }
  });

  it("allows stale query reads with a warning when pre-pull fails", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await queryDocument(
      { docId: "fish", allowStaleRead: true, skipPrePull: false },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result).toMatchObject({
      ok: true,
      warnings: [expect.objectContaining({ code: "GUI_PRE_PULL_FAILED_STALE_READ" })],
    });
  });

  it("rejects rollback with active bidirectional sync unless discard is confirmed", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const snapshots = await workspace.listHistory("fish");
    const snapshotId = snapshots[0]?.snapshotId;
    expect(snapshotId).toBeTruthy();

    await expect(
      rollbackDocument(
        { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: false },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("discard active GUI state");

    const result = await rollbackDocument(
      { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: true },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(result).toMatchObject({ ok: true, restoredPath: expect.stringContaining(`${snapshotId}.svg`) });
  });

  it("rejects recovery with active bidirectional sync unless discard is confirmed", async () => {
    await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const snapshots = await workspace.listHistory("fish");
    const snapshotId = snapshots[0]?.snapshotId;
    expect(snapshotId).toBeTruthy();

    await expect(
      recoverDocument(
        { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: false },
        { workspace, inkscape, autoRefresh: { enabled: false } },
      ),
    ).rejects.toThrow("discard active GUI state");

    const result = await recoverDocument(
      { docId: "fish", snapshotId: snapshotId as string, confirmDiscardGuiState: true },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    expect(result).toMatchObject({
      ok: true,
      recoveredFromSnapshotId: snapshotId,
      restoredPath: expect.stringContaining(`${snapshotId}.svg`),
    });
  });

  it("strips InkSMCP metadata from SVG export by default", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "display_only" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    const exportSpy = vi.spyOn(inkscape, "exportDocument").mockImplementation(async (inputPath, outputPath) => {
      await writeFile(outputPath, await readFile(inputPath, "utf8"), "utf8");
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await exportDocument(
      {
        docId: "fish",
        format: "svg",
        filename: "fish.svg",
        textToPath: false,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(exportSpy).toHaveBeenCalledTimes(1);
    await expect(readFile(result.outputPath, "utf8")).resolves.not.toContain(connected.connection.connectionId);
    expect(stripInkMcpMetadata(await workspace.readSvg("fish"))).not.toContain("inksmcp-sync-metadata");
  });

  it("preserves InkSMCP metadata when export opts in", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "display_only" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "exportDocument").mockImplementation(async (inputPath, outputPath) => {
      await writeFile(outputPath, await readFile(inputPath, "utf8"), "utf8");
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });

    const result = await exportDocument(
      {
        docId: "fish",
        format: "svg",
        filename: "fish-meta.svg",
        textToPath: false,
        includeInkMcpMetadata: true,
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    await expect(readFile(result.outputPath, "utf8")).resolves.toContain(connected.connection.connectionId);
  });

  it("updates the connection baseline after a successful MCP write refresh", async () => {
    const connected = await connectInkscapeWindow(
      { docId: "fish", syncMode: "bidirectional" },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );
    vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
      await writeFile(workspace.guiPullSvgPath(options.requestId), await workspace.readSvg("fish"), "utf8");
      await writeFile(
        workspace.guiPullManifestPath(options.requestId),
        `${JSON.stringify({
          requestId: options.requestId,
          connectionId: options.connectionId,
          requestedDocId: options.docId,
          exportedAt: new Date().toISOString(),
        })}\n`,
        "utf8",
      );
      return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
    });
    vi.spyOn(inkscape, "refreshActiveWindowWithCompanionExtension").mockResolvedValue({
      binaryPath: "inkscape",
      stdout: "",
      stderr: "",
      exitCode: 0,
    });

    const result = await addElement(
      {
        docId: "fish",
        type: "circle",
        attributes: { id: "eye", cx: 30, cy: 20, r: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: true } },
    );

    expect(result).toMatchObject({ ok: true, guiRefresh: { refreshed: true } });
    const metadata = await workspace.readMetadata("fish");
    const connection = await workspace.readConnection(connected.connection.connectionId);
    expect(connection.baselineRevision).toBe(metadata.revision);
    expect(connection.baselineContentHash).toBe(metadata.contentHash);
  });

  it("writes operation diff artifacts for successful workspace edits", async () => {
    const result = await addElement(
      {
        docId: "fish",
        type: "circle",
        attributes: { id: "eye", cx: 30, cy: 20, r: 2 },
      },
      { workspace, inkscape, autoRefresh: { enabled: false } },
    );

    expect(result.operationDiff).toMatchObject({
      path: expect.stringContaining("operation-diffs"),
      summary: {
        addedElementCount: 1,
        removedElementCount: 0,
        changedElementCount: 1,
      },
    });
    await expect(readFile(result.operationDiff?.path as string, "utf8")).resolves.toContain('"eye"');
  });
});

function baseSvg(fill: string, extra = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="${fill}"/>
  <path id="tail" d="M10 30 L1 18 L1 42 Z" fill="${fill}"/>
  ${extra}
</svg>`;
}

function textConflictSvg(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <text id="label" x="10" y="20" fill="#111827">${text}</text>
</svg>`;
}

function reorderedFishSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <path id="tail" d="M10 30 L1 18 L1 42 Z" fill="#f9a8d4"/>
  <path id="body" d="M10 30 C25 5 70 5 90 30 C70 55 25 55 10 30 Z" fill="#f9a8d4"/>
</svg>`;
}

function defsConflictSvg(stopColor: string, stroke: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100px" height="60px" viewBox="0 0 100 60">
  <defs>
    <linearGradient id="paint"><stop id="paint-stop" offset="0%" stop-color="${stopColor}"/></linearGradient>
  </defs>
  <rect id="box" x="1" y="1" width="10" height="10" fill="url(#paint)" stroke="${stroke}"/>
</svg>`;
}

function mockGuiPull(inkscape: InkscapeCli, workspace: Workspace, svg: string) {
  vi.spyOn(inkscape, "pushGuiStateWithCompanionExtension").mockImplementation(async (options) => {
    const pulled = injectInkMcpMarker(svg, {
      connectionId: options.connectionId,
      docId: options.docId,
      syncMode: options.syncMode,
      windowId: options.windowId,
      updatedAt: new Date().toISOString(),
    });
    await writeFile(workspace.guiPullSvgPath(options.requestId), pulled, "utf8");
    await writeFile(
      workspace.guiPullManifestPath(options.requestId),
      `${JSON.stringify({
        requestId: options.requestId,
        connectionId: options.connectionId,
        requestedDocId: options.docId,
        inferredDocId: options.docId,
        windowId: options.windowId,
        exportedAt: new Date().toISOString(),
        svgPath: workspace.guiPullSvgPath(options.requestId),
      })}\n`,
      "utf8",
    );
    return { binaryPath: "inkscape", stdout: "", stderr: "", exitCode: 0 };
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPollingStatus(
  ctx: Parameters<typeof getGuiSyncStatus>[1],
  connectionId: string,
  expected: { pullCount: number; inFlight: boolean },
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 2_000) {
    const status = await getGuiSyncStatus({ connectionId }, ctx);
    const polling = status.polling[0];
    if (polling?.pullCount === expected.pullCount && polling.inFlight === expected.inFlight) {
      expect(polling).toMatchObject({
        connectionId,
        state: "running",
        pullCount: expected.pullCount,
        inFlight: expected.inFlight,
      });
      return;
    }
    await delay(20);
  }
  const status = await getGuiSyncStatus({ connectionId }, ctx);
  expect(status.polling[0]).toMatchObject({
    connectionId,
    state: "running",
    pullCount: expected.pullCount,
    inFlight: expected.inFlight,
  });
}
