import { mkdir, readFile, rename, readdir, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";

import { InkMcpError } from "../core/errors.js";
import { assertSafeDocId } from "../core/ids.js";
import { parseFullSvg } from "../core/validation.js";

export interface WorkspacePaths {
  root: string;
  drawingsDir: string;
  archiveDir: string;
  fontsDir: string;
}

export interface DocumentPaths {
  docId: string;
  dir: string;
  currentSvg: string;
  metadata: string;
  historyDir: string;
  operationsLog: string;
}

export interface StoredMetadata {
  docId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
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
    };
  }

  async ensureReady(): Promise<void> {
    await mkdir(this.paths.drawingsDir, { recursive: true });
    await mkdir(this.paths.archiveDir, { recursive: true });
    await mkdir(this.paths.fontsDir, { recursive: true });
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

  previewPath(docId: string): string {
    return this.resolveWithinWorkspace("drawings", assertSafeDocId(docId), "preview.png");
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
    return JSON.parse(raw) as StoredMetadata;
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
      const metadata: StoredMetadata = { docId, title, createdAt: now, updatedAt: now, archived: false };
      await this.atomicWrite(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
      return paths;
    });
  }

  async writeSvgWithSnapshot<T>(
    docId: string,
    toolName: string,
    createNextSvg: (currentSvg: string, paths: DocumentPaths) => Promise<{ svg: string; result: T }> | { svg: string; result: T },
  ): Promise<{ paths: DocumentPaths; snapshotPath: string; result: T }> {
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      const snapshotPath = await this.createSnapshot(paths, toolName, currentSvg);
      const next = await createNextSvg(currentSvg, paths);
      parseFullSvg(next.svg);
      await this.atomicWrite(paths.currentSvg, next.svg);
      await this.touchMetadata(paths);
      return { paths, snapshotPath, result: next.result };
    });
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

  async rollback(docId: string, snapshotId: string): Promise<{ paths: DocumentPaths; snapshotPath: string; restoredPath: string }> {
    if (!/^[A-Za-z0-9_.-]+$/.test(snapshotId)) {
      throw new InkMcpError("INVALID_INPUT", "Invalid snapshot id.", { snapshotId });
    }
    return this.withDocumentWriteLock(docId, async (paths) => {
      await this.assertDocumentExists(paths);
      const restoredPath = this.resolveWithinWorkspace("drawings", docId, "history", `${snapshotId}.svg`);
      await stat(restoredPath).catch(() => {
        throw new InkMcpError("DOC_NOT_FOUND", "History snapshot was not found.", { snapshotId });
      });
      const currentSvg = await readFile(paths.currentSvg, "utf8");
      const snapshotPath = await this.createSnapshot(paths, "rollback_document", currentSvg);
      const restoredSvg = await readFile(restoredPath, "utf8");
      parseFullSvg(restoredSvg);
      await this.atomicWrite(paths.currentSvg, restoredSvg);
      await this.touchMetadata(paths);
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

  private async touchMetadata(paths: DocumentPaths): Promise<void> {
    const metadata = await this.readMetadata(paths.docId);
    metadata.updatedAt = new Date().toISOString();
    await this.atomicWrite(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
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
