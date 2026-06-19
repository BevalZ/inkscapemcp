import { copyFile, mkdir, readFile, rename, readdir, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { InkMcpError } from "../core/errors.js";
import { assertSafeDocId } from "../core/ids.js";
import { diffSvgDocuments, type SvgOperationDiff } from "../core/svg-diff.js";
import { parseFullSvg } from "../core/validation.js";
import { contentHash } from "../core/sync-metadata.js";

export interface WorkspacePaths {
  root: string;
  drawingsDir: string;
  archiveDir: string;
  fontsDir: string;
  connectionsDir: string;
  guiPullDir: string;
}

export interface DocumentPaths {
  docId: string;
  dir: string;
  currentSvg: string;
  metadata: string;
  historyDir: string;
  operationDiffsDir: string;
  operationPreviewsDir: string;
  mergePreviewsDir: string;
  operationsLog: string;
}

export interface StoredMetadata {
  docId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  revision: number;
  contentHash: string;
  lastWriter: WorkspaceWriter;
  lastGuiPullAt?: string;
}

export type WorkspaceWriter = "mcp" | "gui" | "system";

export interface RecoverableWriteSnapshot {
  snapshotId: string;
  snapshotPath: string;
  toolName?: string;
  timestamp?: string;
}

export interface ConnectionConfig {
  connectionId: string;
  docId: string;
  syncMode: "display_only" | "bidirectional";
  documentPath?: string;
  inferredDocId?: string;
  runtimeDocumentId?: string;
  windowId?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  lastPulledAt?: string;
  expiresAt: string;
  baselineRevision: number;
  baselineContentHash: string;
  state: "connected" | "disconnected";
  identitySummary?: ConnectionIdentitySummary;
  capabilitySummary?: ConnectionCapabilitySummary;
}

export interface ConnectionIdentitySummary {
  strength: "connection_only" | "runtime_document" | "window" | "full";
  hasConnectionId: boolean;
  hasRuntimeDocumentId: boolean;
  hasWindowId: boolean;
  ambiguous: boolean;
}

export interface ConnectionCapabilitySummary {
  companionRefresh: "available_assumed" | "unknown";
  guiPull: "available_assumed" | "not_applicable" | "unknown";
  guiPush: "available_assumed" | "not_applicable" | "unknown";
  sameWindowRefresh: "available_assumed" | "unknown";
  manifestVersion: number;
  extensionVersion?: string;
}

export interface GuiSyncPollingPreference {
  docId: string;
  connectionId: string;
  intervalMs: number;
  timeoutMs?: number;
  persist: boolean;
  createdAt: string;
  updatedAt: string;
  state: "enabled" | "disabled";
}

export interface OperationDiffArtifact {
  path: string;
  generatedAt: string;
  summary: SvgOperationDiff["summary"];
}

export interface OperationPreviewArtifactMetadata {
  previewId: string;
  docId: string;
  toolName: "preview_svg_operations" | "replay_operations";
  generatedAt: string;
  label?: string;
  operationCount: number;
  responseMode: "compact" | "full";
  baseline?: { revision: number; contentHash: string };
  dryRun: true;
  svgPath: string;
  metadataPath: string;
  diff: SvgOperationDiff;
  summary: SvgOperationDiff["summary"];
  addedElementIds: string[];
  removedElementIds: string[];
  changedElementIds: string[];
  previewChangedElementIds: string[];
}

export interface OperationPreviewArtifactSummary {
  previewId: string;
  docId: string;
  toolName: OperationPreviewArtifactMetadata["toolName"];
  generatedAt: string;
  label?: string;
  operationCount: number;
  responseMode: "compact" | "full";
  baseline?: { revision: number; contentHash: string };
  dryRun: true;
  svgPath: string;
  metadataPath: string;
  summary: SvgOperationDiff["summary"];
  addedElementIds: string[];
  removedElementIds: string[];
  changedElementIds: string[];
  previewChangedElementIds: string[];
}

export interface GuiMergePreviewArtifact {
  previewId?: string;
  docId?: string;
  svgPath: string;
  metadataPath: string;
  generatedAt: string;
  status: "clean" | "previewable";
  candidateKind: "pulled_gui" | "merge_non_overlapping";
  baseline?: { revision: number; contentHash: string };
  summary: Record<string, unknown>;
}

export interface GuiMergePreviewArtifactSummary {
  previewId: string;
  docId: string;
  svgPath: string;
  metadataPath: string;
  generatedAt: string;
  status: GuiMergePreviewArtifact["status"];
  candidateKind: GuiMergePreviewArtifact["candidateKind"];
  baseline?: { revision: number; contentHash: string };
  summary: Record<string, unknown>;
}

export interface GuiPullManifest {
  requestId: string;
  connectionId: string;
  requestedDocId: string;
  inferredDocId?: string;
  documentPath?: string;
  runtimeDocumentId?: string;
  windowId?: string;
  inkscapeVersion?: string;
  exportedAt: string;
  svgPath?: string;
}

export interface CheckpointSnapshot {
  paths: DocumentPaths;
  checkpointId: string;
  snapshotId: string;
  snapshotPath: string;
  svg: string;
  metadata: StoredMetadata;
}

type WriteCallback<T> = (paths: DocumentPaths) => Promise<T>;

export class Workspace {
  readonly paths: WorkspacePaths;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(root = process.env.INKSMCP_WORKSPACE ?? path.resolve(process.cwd(), "workspace")) {
    const absoluteRoot = path.resolve(root);
    this.paths = {
      root: absoluteRoot,
      drawingsDir: path.join(absoluteRoot, "drawings"),
      archiveDir: path.join(absoluteRoot, "archive"),
      fontsDir: path.join(absoluteRoot, "fonts"),
      connectionsDir: path.join(absoluteRoot, "connections"),
      guiPullDir: path.join(absoluteRoot, "gui-pull"),
    };
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.paths.drawingsDir, { recursive: true });
    await mkdir(this.paths.archiveDir, { recursive: true });
    await mkdir(this.paths.fontsDir, { recursive: true });
    await mkdir(this.paths.connectionsDir, { recursive: true });
    await mkdir(this.paths.guiPullDir, { recursive: true });
  }

  documentPaths(docId: string): DocumentPaths {
    assertSafeDocId(docId);
    const dir = this.resolveWithinWorkspace("drawings", docId);
    return {
      docId,
      dir,
      currentSvg: this.resolveWithinWorkspace("drawings", docId, "current.svg"),
      metadata: this.resolveWithinWorkspace("drawings", docId, "metadata.json"),
      historyDir: this.resolveWithinWorkspace("drawings", docId, "history"),
      operationDiffsDir: this.resolveWithinWorkspace("drawings", docId, "operation-diffs"),
      operationPreviewsDir: this.resolveWithinWorkspace("drawings", docId, "operation-previews"),
      mergePreviewsDir: this.resolveWithinWorkspace("drawings", docId, "merge-previews"),
      operationsLog: this.resolveWithinWorkspace("drawings", docId, "operations.log"),
    };
  }

  archivePath(docId: string, archiveId: string): string {
    assertSafeDocId(docId);
    return this.resolveWithinWorkspace("archive", `${docId}-${archiveId}`);
  }

  exportPath(docId: string, filename: string): string {
    const safeName = filename.replace(/[^A-Za-z0-9_.-]+/g, "-");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new InkMcpError("INVALID_INPUT", "Invalid output filename.", { filename });
    }
    return this.resolveWithinWorkspace("drawings", assertSafeDocId(docId), safeName);
  }

  externalExportPath(outputDirectory: string, filename: string): string {
    if (isRemoteUriOrUnc(outputDirectory)) {
      throw new InkMcpError("INVALID_INPUT", "External export directory must be a local filesystem path.");
    }
    const safeName = filename.replace(/[^A-Za-z0-9_.-]+/g, "-");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new InkMcpError("INVALID_INPUT", "Invalid output filename.", { filename });
    }
    return path.join(path.resolve(outputDirectory), safeName);
  }

  previewPath(docId: string): string {
    return this.resolveWithinWorkspace("drawings", assertSafeDocId(docId), "preview.png");
  }

  vectorizedPath(docId: string, filename: string): string {
    const safeName = filename.replace(/[^A-Za-z0-9_.-]+/g, "-");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new InkMcpError("INVALID_INPUT", "Invalid vectorized output filename.", { filename });
    }
    return this.resolveWithinWorkspace("drawings", assertSafeDocId(docId), "vectorized", safeName);
  }

  tempPath(docId: string, filename: string): string {
    const safeName = filename.replace(/[^A-Za-z0-9_.-]+/g, "-");
    if (!safeName) {
      throw new InkMcpError("INVALID_INPUT", "Invalid temporary filename.", { filename });
    }
    return this.resolveWithinWorkspace("drawings", assertSafeDocId(docId), ".tmp", safeName);
  }

  connectionPath(connectionId: string): string {
    return this.resolveWithinWorkspace("connections", `${assertSafeConnectionId(connectionId)}.json`);
  }

  connectionBaselineSvgPath(connectionId: string): string {
    return this.resolveWithinWorkspace("connections", `${assertSafeConnectionId(connectionId)}.baseline.svg`);
  }

  guiSyncPollingPreferencePath(connectionId: string): string {
    return this.resolveWithinWorkspace("connections", `${assertSafeConnectionId(connectionId)}.polling.json`);
  }

  guiPullSvgPath(requestId: string): string {
    return this.resolveWithinWorkspace("gui-pull", `${assertSafeRequestId(requestId)}.svg`);
  }

  guiPullManifestPath(requestId: string): string {
    return this.resolveWithinWorkspace("gui-pull", `${assertSafeRequestId(requestId)}.json`);
  }

  fontPath(filename: string): string {
    const safeName = filename.replace(/[^A-Za-z0-9_.-]+/g, "-");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new InkMcpError("INVALID_INPUT", "Invalid font filename.", { filename });
    }
    return this.resolveWithinWorkspace("fonts", safeName);
  }

  async importFont(sourcePath: string, preferredName?: string): Promise<{ fontPath: string; bytes: number }> {
    if (isRemoteUriOrUnc(sourcePath)) {
      throw new InkMcpError("INVALID_INPUT", "Remote, URI, and UNC font sources are not allowed.");
    }
    const absoluteSource = path.resolve(sourcePath);
    const extension = path.extname(absoluteSource).toLowerCase();
    if (![".ttf", ".otf", ".woff", ".woff2"].includes(extension)) {
      throw new InkMcpError("INVALID_INPUT", "Unsupported font extension.", { extension });
    }
    const sourceInfo = await stat(absoluteSource).catch(() => {
      throw new InkMcpError("INVALID_INPUT", "Font source was not found.", { sourcePath });
    });
    if (!sourceInfo.isFile()) {
      throw new InkMcpError("INVALID_INPUT", "Font source must be a file.", { sourcePath });
    }
    await this.ensureReady();
    const baseName = preferredName ?? path.basename(absoluteSource);
    const target = this.fontPath(`${path.basename(baseName, path.extname(baseName))}-${timestampId()}${extension}`);
    await copyFile(absoluteSource, target);
    return { fontPath: target, bytes: sourceInfo.size };
  }

  async importSvgDocument(sourcePath: string, docId: string, title: string): Promise<DocumentPaths> {
    if (isRemoteUriOrUnc(sourcePath)) {
      throw new InkMcpError("INVALID_INPUT", "Remote, URI, and UNC SVG sources are not allowed.");
    }
    const absoluteSource = path.resolve(sourcePath);
    if (path.extname(absoluteSource).toLowerCase() !== ".svg") {
      throw new InkMcpError("INVALID_INPUT", "Imported document must be an .svg file.", { sourcePath });
    }
    const sourceInfo = await stat(absoluteSource).catch(() => {
      throw new InkMcpError("INVALID_INPUT", "SVG source was not found.", { sourcePath });
    });
    if (!sourceInfo.isFile()) {
      throw new InkMcpError("INVALID_INPUT", "SVG source must be a file.", { sourcePath });
    }
    const svg = await readFile(absoluteSource, "utf8");
    return this.createDocument(docId, title, svg);
  }

  async listDocuments(): Promise<string[]> {
    await this.ensureReady();
    const entries = await readdir(this.paths.drawingsDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  }

  async readSvg(docId: string): Promise<string> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    return readFile(paths.currentSvg, "utf8");
  }

  async readMetadata(docId: string): Promise<StoredMetadata> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const raw = await readFile(paths.metadata, "utf8");
    const metadata = JSON.parse(raw) as Partial<StoredMetadata>;
    return this.normalizeMetadata(paths, metadata);
  }

  async createDocument(docId: string, title: string, svg: string): Promise<DocumentPaths> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await mkdir(paths.historyDir, { recursive: true });
      try {
        await stat(paths.currentSvg);
        throw new InkMcpError("INVALID_INPUT", "Document already exists.", { docId });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      parseFullSvg(svg);
      await this.atomicWrite(paths.currentSvg, svg);
      const now = new Date().toISOString();
      const metadata: StoredMetadata = {
        docId,
        title,
        createdAt: now,
        updatedAt: now,
        archived: false,
        revision: 1,
        contentHash: contentHash(svg),
        lastWriter: "mcp",
      };
      await this.atomicWrite(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
      return paths;
    });
  }

  async writeSvgWithSnapshot<T>(
    docId: string,
    toolName: string,
    createNextSvg: (currentSvg: string, paths: DocumentPaths) => Promise<{ svg: string; result: T }> | { svg: string; result: T },
    options: {
      beforeSnapshot?: (currentSvg: string, paths: DocumentPaths) => Promise<void> | void;
    } = {},
  ): Promise<{ paths: DocumentPaths; snapshotPath: string; result: T; operationDiff?: OperationDiffArtifact; operationDiffWarning?: Record<string, unknown> }> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      await options.beforeSnapshot?.(currentSvg, paths);
      const snapshotPath = await this.createSnapshot(paths, toolName, currentSvg);
      const next = await createNextSvg(currentSvg, paths);
      parseFullSvg(next.svg);
      await this.atomicWrite(paths.currentSvg, next.svg);
      await this.touchMetadata(paths, next.svg, "mcp");
      const operationDiff = await this.createOperationDiffArtifact(paths, toolName, currentSvg, next.svg);
      return { paths, snapshotPath, result: next.result, ...operationDiff };
    });
  }

  async createCheckpointSnapshot(
    docId: string,
    input: { label?: string },
  ): Promise<CheckpointSnapshot> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      const metadata = await this.readMetadata(docId);
      const snapshotPath = await this.createSnapshot(paths, checkpointToolName(input.label), currentSvg);
      const snapshotId = path.basename(snapshotPath, ".svg");
      return { paths, checkpointId: snapshotId, snapshotId, snapshotPath, svg: currentSvg, metadata };
    });
  }

  async writeGuiPulledSvgWithSnapshot<T>(
    docId: string,
    toolName: string,
    expectedBase: { revision: number; contentHash: string },
    conflictPolicy: "reject" | "prefer_gui" | "prefer_workspace" | "merge_non_overlapping",
    nextSvg: string,
    result: T,
  ): Promise<{ paths: DocumentPaths; snapshotPath: string; result: T; wrote: boolean; operationDiff?: OperationDiffArtifact; operationDiffWarning?: Record<string, unknown> }> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      const currentMetadata = await this.readMetadata(docId);
      const hasConflict =
        currentMetadata.revision !== expectedBase.revision || currentMetadata.contentHash !== expectedBase.contentHash;
      if (hasConflict && conflictPolicy === "reject") {
        throw new InkMcpError("SYNC_CONFLICT", "Workspace document changed since the GUI connection baseline.", {
          expectedBase,
          actual: { revision: currentMetadata.revision, contentHash: currentMetadata.contentHash },
        });
      }
      if (hasConflict && conflictPolicy === "prefer_workspace") {
        return { paths, snapshotPath: "", result, wrote: false };
      }
      const snapshotPath = await this.createSnapshot(paths, toolName, currentSvg);
      parseFullSvg(nextSvg);
      await this.atomicWrite(paths.currentSvg, nextSvg);
      await this.touchMetadata(paths, nextSvg, "gui");
      const operationDiff = await this.createOperationDiffArtifact(paths, toolName, currentSvg, nextSvg);
      return { paths, snapshotPath, result, wrote: true, ...operationDiff };
    });
  }

  async writeGuiMergePreviewArtifact(input: {
    docId: string;
    requestId: string;
    svg: string;
    status: GuiMergePreviewArtifact["status"];
    candidateKind: GuiMergePreviewArtifact["candidateKind"];
    baseline?: { revision: number; contentHash: string };
    summary: Record<string, unknown>;
  }): Promise<GuiMergePreviewArtifact> {
    await this.ensureReady();
    const paths = this.documentPaths(input.docId);
    await this.assertDocumentExists(paths);
    parseFullSvg(input.svg);
    await mkdir(paths.mergePreviewsDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    const artifactId = `${timestampId()}-${assertSafeRequestId(input.requestId)}`;
    const svgPath = this.resolveWithinWorkspace("drawings", input.docId, "merge-previews", `${artifactId}.svg`);
    const metadataPath = this.resolveWithinWorkspace("drawings", input.docId, "merge-previews", `${artifactId}.json`);
    const artifact: GuiMergePreviewArtifact = {
      previewId: artifactId,
      docId: input.docId,
      svgPath,
      metadataPath,
      generatedAt,
      status: input.status,
      candidateKind: input.candidateKind,
      ...(input.baseline ? { baseline: input.baseline } : {}),
      summary: input.summary,
    };
    await this.atomicWrite(svgPath, input.svg);
    await this.atomicWrite(metadataPath, `${JSON.stringify(artifact, null, 2)}\n`);
    return artifact;
  }

  async listGuiMergePreviews(docId: string): Promise<GuiMergePreviewArtifactSummary[]> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const entries = await readdir(paths.mergePreviewsDir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    const previews = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const previewId = path.basename(entry.name, ".json");
          const expectedSvgPath = this.resolveWithinWorkspace("drawings", docId, "merge-previews", `${previewId}.svg`);
          const expectedMetadataPath = this.resolveWithinWorkspace("drawings", docId, "merge-previews", `${previewId}.json`);
          const raw = await readFile(path.join(paths.mergePreviewsDir, entry.name), "utf8");
          return compactGuiMergePreviewArtifact(
            docId,
            previewId,
            JSON.parse(raw) as GuiMergePreviewArtifact,
            expectedSvgPath,
            expectedMetadataPath,
          );
        }),
    );
    return previews.sort((a, b) => a.previewId.localeCompare(b.previewId));
  }

  async readGuiMergePreview(
    docId: string,
    previewId: string,
  ): Promise<{ metadata: GuiMergePreviewArtifactSummary; svg: string }> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const safePreviewId = assertSafeMergePreviewId(previewId);
    const metadataPath = this.resolveWithinWorkspace("drawings", docId, "merge-previews", `${safePreviewId}.json`);
    const svgPath = this.resolveWithinWorkspace("drawings", docId, "merge-previews", `${safePreviewId}.svg`);
    const raw = await readFile(metadataPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("DOC_NOT_FOUND", "Merge preview artifact was not found.", { previewId });
      }
      throw error;
    });
    const metadata = compactGuiMergePreviewArtifact(
      docId,
      safePreviewId,
      JSON.parse(raw) as GuiMergePreviewArtifact,
      svgPath,
      metadataPath,
    );
    const svg = await readFile(svgPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("DOC_NOT_FOUND", "Merge preview SVG artifact was not found.", { previewId });
      }
      throw error;
    });
    parseFullSvg(svg);
    return { metadata, svg };
  }

  async writeGuiMergePreviewWithSnapshot(
    docId: string,
    previewId: string,
    baseline: { revision: number; contentHash: string },
    nextSvg: string,
    createResult: (currentSvg: string, nextSvg: string) => Record<string, unknown>,
    options?: { beforeSnapshot?: (currentSvg: string) => Promise<void> | void },
  ) {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      await options?.beforeSnapshot?.(currentSvg);
      const currentMetadata = await this.readMetadata(docId);
      if (currentMetadata.revision !== baseline.revision || currentMetadata.contentHash !== baseline.contentHash) {
        throw new InkMcpError("SYNC_CONFLICT", "Workspace document changed since the merge preview baseline.", {
          previewId,
          expectedBase: baseline,
          actual: { revision: currentMetadata.revision, contentHash: currentMetadata.contentHash },
        });
      }
      const snapshotPath = await this.createSnapshot(paths, "apply_merge_preview", currentSvg);
      parseFullSvg(nextSvg);
      await this.atomicWrite(paths.currentSvg, nextSvg);
      await this.touchMetadata(paths, nextSvg, "mcp");
      const operationDiff = await this.createOperationDiffArtifact(paths, "apply_merge_preview", currentSvg, nextSvg);
      const result = createResult(currentSvg, nextSvg);
      return { paths, snapshotPath, result, ...operationDiff };
    });
  }

  async writeOperationPreviewArtifact(input: {
    docId: string;
    toolName: OperationPreviewArtifactMetadata["toolName"];
    candidateSvg: string;
    diff: SvgOperationDiff;
    operationCount: number;
    responseMode: "compact" | "full";
    previewChangedElementIds: string[];
    label?: string;
    baseline?: { revision: number; contentHash: string };
  }): Promise<OperationPreviewArtifactSummary> {
    await this.ensureReady();
    const paths = this.documentPaths(input.docId);
    await this.assertDocumentExists(paths);
    parseFullSvg(input.candidateSvg);
    await mkdir(paths.operationPreviewsDir, { recursive: true });
    const generatedAt = new Date().toISOString();
    const previewId = `${timestampId()}-${previewToolSlug(input.toolName)}${labelSuffix(input.label)}`;
    const svgPath = this.resolveWithinWorkspace("drawings", input.docId, "operation-previews", `${previewId}.svg`);
    const metadataPath = this.resolveWithinWorkspace("drawings", input.docId, "operation-previews", `${previewId}.json`);
    const metadata: OperationPreviewArtifactMetadata = {
      previewId,
      docId: input.docId,
      toolName: input.toolName,
      generatedAt,
      ...(input.label ? { label: input.label } : {}),
      operationCount: input.operationCount,
      responseMode: input.responseMode,
      ...(input.baseline ? { baseline: input.baseline } : {}),
      dryRun: true,
      svgPath,
      metadataPath,
      diff: input.diff,
      summary: input.diff.summary,
      addedElementIds: input.diff.addedElementIds,
      removedElementIds: input.diff.removedElementIds,
      changedElementIds: input.diff.changedElementIds,
      previewChangedElementIds: input.previewChangedElementIds,
    };
    await this.atomicWrite(svgPath, input.candidateSvg);
    await this.atomicWrite(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    return compactOperationPreviewArtifact(metadata);
  }

  async listOperationPreviews(docId: string): Promise<OperationPreviewArtifactSummary[]> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const entries = await readdir(paths.operationPreviewsDir, { withFileTypes: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    });
    const previews = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const raw = await readFile(path.join(paths.operationPreviewsDir, entry.name), "utf8");
          return compactOperationPreviewArtifact(JSON.parse(raw) as OperationPreviewArtifactMetadata);
        }),
    );
    return previews.sort((a, b) => a.previewId.localeCompare(b.previewId));
  }

  async readOperationPreview(
    docId: string,
    previewId: string,
  ): Promise<{ metadata: OperationPreviewArtifactMetadata; svg: string }> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const safePreviewId = assertSafeOperationPreviewId(previewId);
    const metadataPath = this.resolveWithinWorkspace("drawings", docId, "operation-previews", `${safePreviewId}.json`);
    const svgPath = this.resolveWithinWorkspace("drawings", docId, "operation-previews", `${safePreviewId}.svg`);
    const raw = await readFile(metadataPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("DOC_NOT_FOUND", "Operation preview artifact was not found.", { previewId });
      }
      throw error;
    });
    const metadata = JSON.parse(raw) as OperationPreviewArtifactMetadata;
    if (metadata.docId !== docId || metadata.previewId !== safePreviewId) {
      throw new InkMcpError("INVALID_INPUT", "Operation preview metadata does not match the requested document.", {
        docId,
        previewId,
      });
    }
    const svg = await readFile(svgPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("DOC_NOT_FOUND", "Operation preview SVG artifact was not found.", { previewId });
      }
      throw error;
    });
    parseFullSvg(svg);
    return { metadata, svg };
  }

  async listHistory(docId: string): Promise<Array<{ snapshotId: string; path: string; size: number; createdAt: string }>> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const entries = await readdir(paths.historyDir, { withFileTypes: true });
    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".svg"))
        .map(async (entry) => {
          const snapshotPath = path.join(paths.historyDir, entry.name);
          const info = await stat(snapshotPath);
          return {
            snapshotId: path.basename(entry.name, ".svg"),
            path: snapshotPath,
            size: info.size,
            createdAt: info.mtime.toISOString(),
          };
        }),
    );
    return snapshots.sort((a, b) => a.snapshotId.localeCompare(b.snapshotId));
  }

  async readHistorySnapshot(docId: string, snapshotId: string): Promise<{ snapshotId: string; path: string; svg: string; size: number; createdAt: string }> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const snapshotPath = this.historySnapshotPath(docId, snapshotId);
    const info = await stat(snapshotPath).catch(() => {
      throw new InkMcpError("DOC_NOT_FOUND", "History snapshot was not found.", { snapshotId });
    });
    if (!info.isFile()) {
      throw new InkMcpError("DOC_NOT_FOUND", "History snapshot was not a file.", { snapshotId });
    }
    return {
      snapshotId,
      path: snapshotPath,
      svg: await readFile(snapshotPath, "utf8"),
      size: info.size,
      createdAt: info.mtime.toISOString(),
    };
  }

  async findLastSuccessfulWriteSnapshot(docId: string): Promise<RecoverableWriteSnapshot | undefined> {
    const paths = this.documentPaths(docId);
    await this.assertDocumentExists(paths);
    const raw = await readFile(paths.operationsLog, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    });
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const entry = parseOperationLogLine(lines[index]);
      if (!entry || entry.status !== "ok" || typeof entry.snapshotPath !== "string") continue;
      const snapshotId = this.snapshotIdFromDocumentHistoryPath(paths, entry.snapshotPath);
      if (!snapshotId) continue;
      return {
        snapshotId,
        snapshotPath: entry.snapshotPath,
        ...(typeof entry.toolName === "string" ? { toolName: entry.toolName } : {}),
        ...(typeof entry.timestamp === "string" ? { timestamp: entry.timestamp } : {}),
      };
    }
    return undefined;
  }

  async rollback(
    docId: string,
    snapshotId: string,
    toolName = "rollback_document",
  ): Promise<{ paths: DocumentPaths; snapshotPath: string; restoredPath: string }> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const restoredPath = this.historySnapshotPath(docId, snapshotId);
      await stat(restoredPath).catch(() => {
        throw new InkMcpError("DOC_NOT_FOUND", "History snapshot was not found.", { snapshotId });
      });
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      const snapshotPath = await this.createSnapshot(paths, toolName, currentSvg);
      const restoredSvg = await readFile(restoredPath, "utf8");
      parseFullSvg(restoredSvg);
      await this.atomicWrite(paths.currentSvg, restoredSvg);
      await this.touchMetadata(paths, restoredSvg, "mcp");
      await this.createOperationDiffArtifact(paths, toolName, currentSvg, restoredSvg);
      return { paths, snapshotPath, restoredPath };
    });
  }

  async archiveDocument(docId: string): Promise<{ archivePath: string }> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const archiveId = timestampId();
      const archivePath = this.archivePath(docId, archiveId);
      await mkdir(path.dirname(archivePath), { recursive: true });
      await rename(paths.dir, archivePath);
      return { archivePath };
    });
  }

  async writeConnection(config: ConnectionConfig): Promise<void> {
    await this.ensureReady();
    await this.atomicWrite(this.connectionPath(config.connectionId), `${JSON.stringify(config, null, 2)}\n`);
  }

  async writeGuiSyncPollingPreference(preference: GuiSyncPollingPreference): Promise<void> {
    await this.ensureReady();
    await this.atomicWrite(this.guiSyncPollingPreferencePath(preference.connectionId), `${JSON.stringify(preference, null, 2)}\n`);
  }

  async readGuiSyncPollingPreference(connectionId: string): Promise<GuiSyncPollingPreference> {
    await this.ensureReady();
    const raw = await readFile(this.guiSyncPollingPreferencePath(connectionId), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("SYNC_NOT_CONNECTED", "GUI sync polling preference was not found.", { connectionId });
      }
      throw error;
    });
    return JSON.parse(raw) as GuiSyncPollingPreference;
  }

  async listGuiSyncPollingPreferences(): Promise<GuiSyncPollingPreference[]> {
    await this.ensureReady();
    const entries = await readdir(this.paths.connectionsDir, { withFileTypes: true });
    return Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".polling.json"))
        .map(async (entry) => JSON.parse(await readFile(path.join(this.paths.connectionsDir, entry.name), "utf8")) as GuiSyncPollingPreference),
    );
  }

  async disableGuiSyncPollingPreference(connectionId: string): Promise<GuiSyncPollingPreference | undefined> {
    const existing = await this.readGuiSyncPollingPreference(connectionId).catch((error) => {
      if (error instanceof InkMcpError && error.code === "SYNC_NOT_CONNECTED") return undefined;
      throw error;
    });
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const next: GuiSyncPollingPreference = {
      ...existing,
      state: "disabled",
      updatedAt: now,
    };
    await this.writeGuiSyncPollingPreference(next);
    return next;
  }

  async writeConnectionBaselineSvg(connectionId: string, svg: string): Promise<void> {
    await this.ensureReady();
    parseFullSvg(svg);
    await this.atomicWrite(this.connectionBaselineSvgPath(connectionId), svg);
  }

  async readConnectionBaselineSvg(connectionId: string): Promise<string> {
    await this.ensureReady();
    return readFile(this.connectionBaselineSvgPath(connectionId), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("SYNC_CONFLICT", "Connection baseline SVG was not found; reconnect before automatic merge.", {
          connectionId,
        });
      }
      throw error;
    });
  }

  async readConnection(connectionId: string): Promise<ConnectionConfig> {
    await this.ensureReady();
    const raw = await readFile(this.connectionPath(connectionId), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("SYNC_NOT_CONNECTED", "InkSMCP connection was not found.", { connectionId });
      }
      throw error;
    });
    return JSON.parse(raw) as ConnectionConfig;
  }

  async findConnectionsForDoc(docId: string): Promise<ConnectionConfig[]> {
    assertSafeDocId(docId);
    await this.ensureReady();
    const entries = await readdir(this.paths.connectionsDir, { withFileTypes: true });
    const connections = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => JSON.parse(await readFile(path.join(this.paths.connectionsDir, entry.name), "utf8")) as ConnectionConfig),
    );
    return connections.filter((connection) => connection.docId === docId && connection.state === "connected");
  }

  async disconnectConnection(connectionId: string): Promise<ConnectionConfig> {
    const config = await this.readConnection(connectionId);
    const now = new Date().toISOString();
    const next: ConnectionConfig = { ...config, state: "disconnected", updatedAt: now };
    await this.writeConnection(next);
    return next;
  }

  async touchConnectionSeen(connectionId: string, date = new Date()): Promise<ConnectionConfig> {
    const config = await this.readConnection(connectionId);
    const now = date.toISOString();
    const next: ConnectionConfig = { ...config, updatedAt: now, lastSeenAt: now };
    await this.writeConnection(next);
    return next;
  }

  async readGuiPullManifest(requestId: string): Promise<GuiPullManifest> {
    await this.ensureReady();
    const raw = await readFile(this.guiPullManifestPath(requestId), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("INKSCAPE_FAILED", "Inkscape extension did not write a GUI pull manifest.", {
          requestId,
        });
      }
      throw error;
    });
    return JSON.parse(raw) as GuiPullManifest;
  }

  async readGuiPullSvg(requestId: string): Promise<string> {
    await this.ensureReady();
    return readFile(this.guiPullSvgPath(requestId), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("INKSCAPE_FAILED", "Inkscape extension did not write a GUI pull SVG artifact.", {
          requestId,
        });
      }
      throw error;
    });
  }

  resolveWithinWorkspace(...segments: string[]): string {
    const target = path.resolve(this.paths.root, ...segments);
    const relative = path.relative(this.paths.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InkMcpError("PATH_OUTSIDE_WORKSPACE", "Resolved path escapes the configured workspace.", {
        target,
      });
    }
    return target;
  }

  private async withDocumentWriteLock<T>(docId: string, callback: WriteCallback<T>): Promise<T> {
    assertSafeDocId(docId);
    const previous = this.locks.get(docId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.locks.set(docId, chained);

    try {
      await previous.catch(() => undefined);
      await this.ensureReady();
      return await callback(this.documentPaths(docId));
    } finally {
      release();
      if (this.locks.get(docId) === chained) {
        this.locks.delete(docId);
      }
    }
  }

  private async assertDocumentExists(paths: DocumentPaths): Promise<void> {
    try {
      await stat(paths.currentSvg);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new InkMcpError("DOC_NOT_FOUND", "Document was not found.", { docId: paths.docId });
      }
      throw error;
    }
  }

  private async createSnapshot(paths: DocumentPaths, toolName: string, svg: string): Promise<string> {
    await mkdir(paths.historyDir, { recursive: true });
    const snapshotPath = path.join(paths.historyDir, `${timestampId()}-${toolName}.svg`);
    await this.atomicWrite(snapshotPath, svg);
    return snapshotPath;
  }

  private historySnapshotPath(docId: string, snapshotId: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(snapshotId)) {
      throw new InkMcpError("INVALID_INPUT", "Invalid snapshot id.", { snapshotId });
    }
    return this.resolveWithinWorkspace("drawings", docId, "history", `${snapshotId}.svg`);
  }

  private snapshotIdFromDocumentHistoryPath(paths: DocumentPaths, snapshotPath: string): string | undefined {
    const absoluteSnapshotPath = path.resolve(snapshotPath);
    const relative = path.relative(paths.historyDir, absoluteSnapshotPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    if (path.dirname(relative) !== ".") return undefined;
    if (!relative.endsWith(".svg")) return undefined;
    return path.basename(relative, ".svg");
  }

  private async createOperationDiffArtifact(
    paths: DocumentPaths,
    toolName: string,
    beforeSvg: string,
    afterSvg: string,
  ): Promise<{ operationDiff?: OperationDiffArtifact; operationDiffWarning?: Record<string, unknown> }> {
    try {
      await mkdir(paths.operationDiffsDir, { recursive: true });
      const diff = diffSvgDocuments(beforeSvg, afterSvg);
      const diffPath = path.join(paths.operationDiffsDir, `${timestampId()}-${toolName}.json`);
      await this.atomicWrite(diffPath, `${JSON.stringify(diff, null, 2)}\n`);
      return {
        operationDiff: {
          path: diffPath,
          generatedAt: diff.generatedAt,
          summary: diff.summary,
        },
      };
    } catch (error) {
      return {
        operationDiffWarning: {
          code: "OPERATION_DIFF_FAILED",
          message: "SVG write succeeded, but operation diff artifact generation failed.",
          details: { message: error instanceof Error ? error.message : String(error) },
        },
      };
    }
  }

  private async touchMetadata(paths: DocumentPaths, svg: string, lastWriter: WorkspaceWriter): Promise<void> {
    const metadata = await this.readMetadata(paths.docId);
    metadata.updatedAt = new Date().toISOString();
    metadata.revision += 1;
    metadata.contentHash = contentHash(svg);
    metadata.lastWriter = lastWriter;
    if (lastWriter === "gui") {
      metadata.lastGuiPullAt = metadata.updatedAt;
    }
    await this.atomicWrite(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  private async normalizeMetadata(paths: DocumentPaths, raw: Partial<StoredMetadata>): Promise<StoredMetadata> {
    const svg = await readFile(paths.currentSvg, "utf8");
    const now = new Date().toISOString();
    return {
      docId: raw.docId ?? paths.docId,
      title: raw.title ?? paths.docId,
      createdAt: raw.createdAt ?? now,
      updatedAt: raw.updatedAt ?? now,
      archived: raw.archived ?? false,
      revision: raw.revision ?? 1,
      contentHash: raw.contentHash ?? contentHash(svg),
      lastWriter: raw.lastWriter ?? "system",
      ...(raw.lastGuiPullAt ? { lastGuiPullAt: raw.lastGuiPullAt } : {}),
    };
  }

  private async atomicWrite(targetPath: string, content: string): Promise<void> {
    this.assertInsideWorkspace(targetPath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(tempPath, content, "utf8");
      await rename(tempPath, targetPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw new InkMcpError("WRITE_FAILED", "Failed to write workspace file.", {
        targetPath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private assertInsideWorkspace(targetPath: string): void {
    const target = path.resolve(targetPath);
    const relative = path.relative(this.paths.root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new InkMcpError("PATH_OUTSIDE_WORKSPACE", "Path escapes the configured workspace.", { target });
    }
  }
}

export function timestampId(date = new Date()): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${Math.random().toString(16).slice(2, 8)}`;
}

function parseOperationLogLine(line: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function checkpointToolName(label?: string): string {
  if (!label) return "create_checkpoint";
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `create_checkpoint-${slug}` : "create_checkpoint";
}

function previewToolSlug(toolName: OperationPreviewArtifactMetadata["toolName"]): string {
  return toolName.replaceAll("_", "-");
}

function labelSuffix(label?: string): string {
  if (!label) return "";
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `-${slug}` : "";
}

function compactOperationPreviewArtifact(
  metadata: OperationPreviewArtifactMetadata,
): OperationPreviewArtifactSummary {
  return {
    previewId: metadata.previewId,
    docId: metadata.docId,
    toolName: metadata.toolName,
    generatedAt: metadata.generatedAt,
    ...(metadata.label ? { label: metadata.label } : {}),
    operationCount: metadata.operationCount,
    responseMode: metadata.responseMode,
    ...(metadata.baseline ? { baseline: metadata.baseline } : {}),
    dryRun: true,
    svgPath: metadata.svgPath,
    metadataPath: metadata.metadataPath,
    summary: metadata.summary,
    addedElementIds: metadata.addedElementIds,
    removedElementIds: metadata.removedElementIds,
    changedElementIds: metadata.changedElementIds,
    previewChangedElementIds: metadata.previewChangedElementIds,
  };
}

function compactGuiMergePreviewArtifact(
  docId: string,
  previewId: string,
  artifact: GuiMergePreviewArtifact,
  expectedSvgPath: string,
  expectedMetadataPath: string,
): GuiMergePreviewArtifactSummary {
  if (artifact.previewId && artifact.previewId !== previewId) {
    throw new InkMcpError("INVALID_INPUT", "Merge preview metadata does not match the requested preview id.", {
      previewId,
      artifactPreviewId: artifact.previewId,
    });
  }
  if (artifact.docId && artifact.docId !== docId) {
    throw new InkMcpError("INVALID_INPUT", "Merge preview metadata does not match the requested document id.", {
      docId,
      artifactDocId: artifact.docId,
      previewId,
    });
  }
  if (path.resolve(artifact.svgPath) !== path.resolve(expectedSvgPath)) {
    throw new InkMcpError("INVALID_INPUT", "Merge preview metadata does not match the requested document.", {
      docId,
      previewId,
      svgPath: artifact.svgPath,
    });
  }
  if (path.resolve(artifact.metadataPath) !== path.resolve(expectedMetadataPath)) {
    throw new InkMcpError("INVALID_INPUT", "Merge preview metadata path does not match the requested document.", {
      docId,
      previewId,
      metadataPath: artifact.metadataPath,
    });
  }
  return {
    previewId,
    docId,
    svgPath: artifact.svgPath,
    metadataPath: artifact.metadataPath,
    generatedAt: artifact.generatedAt,
    status: artifact.status,
    candidateKind: artifact.candidateKind,
    ...(artifact.baseline ? { baseline: artifact.baseline } : {}),
    summary: artifact.summary,
  };
}

function assertSafeConnectionId(connectionId: string): string {
  if (!/^conn-[A-Za-z0-9_-]{8,80}$/.test(connectionId)) {
    throw new InkMcpError("INVALID_INPUT", "Invalid connection id.", { connectionId });
  }
  return connectionId;
}

function assertSafeRequestId(requestId: string): string {
  if (!/^pull-[A-Za-z0-9_.-]{8,96}$/.test(requestId)) {
    throw new InkMcpError("INVALID_INPUT", "Invalid GUI pull request id.", { requestId });
  }
  return requestId;
}

function assertSafeOperationPreviewId(previewId: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(previewId)) {
    throw new InkMcpError("INVALID_INPUT", "Invalid operation preview id.", { previewId });
  }
  return previewId;
}

function assertSafeMergePreviewId(previewId: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(previewId)) {
    throw new InkMcpError("INVALID_INPUT", "Invalid merge preview id.", { previewId });
  }
  return previewId;
}

function isRemoteUriOrUnc(inputPath: string): boolean {
  return /^(?:https?|ftp|file):/i.test(inputPath) || /^(?:\/\/|\\\\)/.test(inputPath.trim());
}
