#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addElementSchema,
  applySvgOperationsSchema,
  archiveDocumentSchema,
  createDocumentSchema,
  deleteElementSchema,
  exportDocumentSchema,
  importFontSchema,
  insertSvgFragmentSchema,
  listHistorySchema,
  openInInkscapeSchema,
  pathDifferenceSchema,
  pathGeometryBaseSchema,
  pathGeometryMultiSchema,
  queryDocumentSchema,
  renderPreviewSchema,
  replaceDocumentSvgSchema,
  rollbackDocumentSchema,
  runActionSchema,
  updateElementSchema,
} from "./core/validation.js";
import { toErrorPayload } from "./core/errors.js";
import { createToolContext, jsonResult, runTool } from "./tools/context.js";
import {
  archiveDocument,
  createDocument,
  listHistory,
  queryDocument,
  replaceDocumentSvg,
  rollbackDocument,
} from "./tools/document.js";
import {
  addElement,
  applySvgOperations,
  deleteElement,
  insertSvgFragment,
  updateElement,
} from "./tools/elements.js";
import { exportDocument, openInInkscape, renderPreview } from "./tools/preview.js";
import { importFont } from "./tools/fonts.js";
import { runAllowedAction, runPathDifference, runPathGeometry } from "./tools/geometry.js";
import { listCurrentSvgResources, listPreviewPngResources, readArtifactResource } from "./tools/resources.js";

export function createServer() {
  const ctx = createToolContext();
  const server = new McpServer({
    name: "inksmcp",
    version: "0.1.0",
  });

  server.registerTool(
    "create_document",
    {
      title: "Create SVG document",
      description: "Create a workspace-confined SVG document.",
      inputSchema: createDocumentSchema,
    },
    (input) => runTool("create_document", () => createDocument(input, ctx)),
  );

  server.registerTool(
    "add_element",
    {
      title: "Add SVG element",
      description: "Add one basic SVG element to a document.",
      inputSchema: addElementSchema,
    },
    (input) => runTool("add_element", () => addElement(input, ctx)),
  );

  server.registerTool(
    "apply_svg_operations",
    {
      title: "Apply SVG operations",
      description: "Apply an atomic batch of controlled SVG operations.",
      inputSchema: applySvgOperationsSchema,
    },
    (input) => runTool("apply_svg_operations", () => applySvgOperations(input, ctx)),
  );

  server.registerTool(
    "update_element",
    {
      title: "Update SVG element",
      description: "Update attributes or text for an existing element id.",
      inputSchema: updateElementSchema,
    },
    (input) => runTool("update_element", () => updateElement(input, ctx)),
  );

  server.registerTool(
    "delete_element",
    {
      title: "Delete SVG element",
      description: "Delete an existing element id from a document.",
      inputSchema: deleteElementSchema,
    },
    (input) => runTool("delete_element", () => deleteElement(input, ctx)),
  );

  server.registerTool(
    "insert_svg_fragment",
    {
      title: "Insert SVG fragment",
      description: "Insert a safe raw SVG fragment into the document root or explicit parent id.",
      inputSchema: insertSvgFragmentSchema,
    },
    (input) => runTool("insert_svg_fragment", () => insertSvgFragment(input, ctx)),
  );

  server.registerTool(
    "replace_document_svg",
    {
      title: "Replace SVG document",
      description: "Replace the full SVG document after safety checks and snapshot creation.",
      inputSchema: replaceDocumentSvgSchema,
    },
    (input) => runTool("replace_document_svg", () => replaceDocumentSvg(input, ctx)),
  );

  server.registerTool(
    "query_document",
    {
      title: "Query SVG document",
      description: "Return document metadata and element tree data.",
      inputSchema: queryDocumentSchema,
    },
    (input) => runTool("query_document", () => queryDocument(input, ctx)),
  );

  server.registerTool(
    "render_preview",
    {
      title: "Render PNG preview",
      description: "Render current SVG to PNG through Inkscape and return image content plus path metadata.",
      inputSchema: renderPreviewSchema,
    },
    async (input) => {
      try {
        return await renderPreview(input, ctx);
      } catch (error) {
        return jsonResult({ ok: false, toolName: "render_preview", error: toErrorPayload(error) });
      }
    },
  );

  server.registerTool(
    "export_document",
    {
      title: "Export document",
      description: "Export the current SVG as svg, png, or pdf.",
      inputSchema: exportDocumentSchema,
    },
    (input) => runTool("export_document", () => exportDocument(input, ctx)),
  );

  server.registerTool(
    "open_in_inkscape",
    {
      title: "Open in Inkscape",
      description: "Open the workspace SVG in the Inkscape GUI as a best-effort workflow.",
      inputSchema: openInInkscapeSchema,
    },
    (input) => runTool("open_in_inkscape", () => openInInkscape(input, ctx)),
  );

  server.registerTool(
    "list_history",
    {
      title: "List history",
      description: "List full SVG snapshots for a document.",
      inputSchema: listHistorySchema,
    },
    (input) => runTool("list_history", () => listHistory(input, ctx)),
  );

  server.registerTool(
    "rollback_document",
    {
      title: "Rollback document",
      description: "Restore a prior SVG snapshot after snapshotting the current state.",
      inputSchema: rollbackDocumentSchema,
    },
    (input) => runTool("rollback_document", () => rollbackDocument(input, ctx)),
  );

  server.registerTool(
    "archive_document",
    {
      title: "Archive document",
      description: "Archive a document directory without physically deleting it.",
      inputSchema: archiveDocumentSchema,
    },
    (input) => runTool("archive_document", () => archiveDocument(input, ctx)),
  );

  server.registerTool(
    "import_font",
    {
      title: "Import local font",
      description: "Copy a local font file into the workspace fonts directory.",
      inputSchema: importFontSchema,
    },
    (input) => runTool("import_font", () => importFont(input, ctx)),
  );

  server.registerTool(
    "path_union",
    {
      title: "Path union",
      description: "Run Inkscape path-union on explicit existing element ids.",
      inputSchema: pathGeometryMultiSchema,
    },
    (input) => runTool("path_union", () => runPathGeometry("path_union", input, ctx)),
  );

  server.registerTool(
    "path_difference",
    {
      title: "Path difference",
      description: "Run Inkscape path-difference with an explicit baseId and cutterIds.",
      inputSchema: pathDifferenceSchema,
    },
    (input) => runTool("path_difference", () => runPathDifference(input, ctx)),
  );

  server.registerTool(
    "path_intersection",
    {
      title: "Path intersection",
      description: "Run Inkscape path-intersection on explicit existing element ids.",
      inputSchema: pathGeometryMultiSchema,
    },
    (input) => runTool("path_intersection", () => runPathGeometry("path_intersection", input, ctx)),
  );

  server.registerTool(
    "path_exclusion",
    {
      title: "Path exclusion",
      description: "Run Inkscape path-exclusion on explicit existing element ids.",
      inputSchema: pathGeometryMultiSchema,
    },
    (input) => runTool("path_exclusion", () => runPathGeometry("path_exclusion", input, ctx)),
  );

  server.registerTool(
    "path_combine",
    {
      title: "Path combine",
      description: "Run Inkscape path-combine on explicit existing element ids.",
      inputSchema: pathGeometryMultiSchema,
    },
    (input) => runTool("path_combine", () => runPathGeometry("path_combine", input, ctx)),
  );

  server.registerTool(
    "path_break_apart",
    {
      title: "Path break apart",
      description: "Run Inkscape path-break-apart on explicit existing element ids.",
      inputSchema: pathGeometryBaseSchema,
    },
    (input) => runTool("path_break_apart", () => runPathGeometry("path_break_apart", input, ctx)),
  );

  server.registerTool(
    "path_simplify",
    {
      title: "Path simplify",
      description: "Run Inkscape path-simplify on explicit existing element ids.",
      inputSchema: pathGeometryBaseSchema,
    },
    (input) => runTool("path_simplify", () => runPathGeometry("path_simplify", input, ctx)),
  );

  server.registerTool(
    "run_action",
    {
      title: "Run allowlisted Inkscape action",
      description: "Run a small allowlist of Inkscape actions on explicit existing element ids.",
      inputSchema: runActionSchema,
    },
    (input) => runTool("run_action", () => runAllowedAction(input, ctx)),
  );

  server.registerResource(
    "document-current-svg",
    new ResourceTemplate("inksmcp://documents/{docId}/current.svg", {
      list: () => listCurrentSvgResources(ctx.workspace),
    }),
    {
      title: "Current SVG document",
      mimeType: "image/svg+xml",
    },
    (uri) => readArtifactResource(uri, ctx.workspace),
  );

  server.registerResource(
    "document-preview-png",
    new ResourceTemplate("inksmcp://documents/{docId}/preview.png", {
      list: () => listPreviewPngResources(ctx.workspace),
    }),
    {
      title: "Rendered PNG preview",
      mimeType: "image/png",
    },
    (uri) => readArtifactResource(uri, ctx.workspace),
  );

  return server;
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
