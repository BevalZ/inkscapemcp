import { readFile, stat } from "node:fs/promises";

import type { Workspace } from "../adapters/workspace.js";

export async function listArtifactResources(workspace: Workspace) {
  return {
    resources: [...(await listCurrentSvgResources(workspace)).resources, ...(await listPreviewPngResources(workspace)).resources],
  };
}

export async function listCurrentSvgResources(workspace: Workspace) {
  const resources = [];
  for (const docId of await workspace.listDocuments()) {
    resources.push({
      uri: `inksmcp://documents/${docId}/current.svg`,
      name: `${docId} current SVG`,
      mimeType: "image/svg+xml",
    });
  }
  return { resources };
}

export async function listPreviewPngResources(workspace: Workspace) {
  const resources = [];
  for (const docId of await workspace.listDocuments()) {
    const previewPath = workspace.previewPath(docId);
    if (await exists(previewPath)) {
      resources.push({
        uri: `inksmcp://documents/${docId}/preview.png`,
        name: `${docId} preview PNG`,
        mimeType: "image/png",
      });
    }
  }
  return { resources };
}

export async function readArtifactResource(uri: URL, workspace: Workspace) {
  const match = uri.href.match(/^inksmcp:\/\/documents\/([^/]+)\/(current\.svg|preview\.png)$/);
  if (!match) {
    throw new Error("Unsupported inksmcp resource URI.");
  }
  const [, docId, artifact] = match;
  const filePath = artifact === "current.svg" ? workspace.documentPaths(docId).currentSvg : workspace.previewPath(docId);
  const data = await readFile(filePath);
  if (artifact === "preview.png") {
    return {
      contents: [{ uri: uri.href, blob: data.toString("base64"), mimeType: "image/png" }],
    };
  }
  return {
    contents: [{ uri: uri.href, text: data.toString("utf8"), mimeType: "image/svg+xml" }],
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
