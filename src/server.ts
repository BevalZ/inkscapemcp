#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addElementSchema,
  appendPathSegmentSchema,
  applySvgOperationsSchema,
  archiveDocumentSchema,
  connectInkscapeWindowSchema,
  createDocumentSchema,
  deleteElementSchema,
  disconnectInkscapeWindowSchema,
  drawPathSchema,
  editPathNodesSchema,
  exportDocumentSchema,
  importFontSchema,
  insertSvgFragmentSchema,
  listHistorySchema,
  nudgePathElementSchema,
  openInInkscapeSchema,
  pathDifferenceSchema,
  pathGeometryBaseSchema,
  pathGeometryMultiSchema,
  pullGuiStateSchema,
  queryPathNodesSchema,
  queryDocumentSchema,
  refreshInInkscapeSchema,
  renderPreviewSchema,
  replaceAttributeValuesSchema,
  replaceDocumentSvgSchema,
  replacePathDataSchema,
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
  appendPathSegment,
  applySvgOperations,
  deleteElement,
  drawPath,
  editPathNodes,
  insertSvgFragment,
  nudgePathElement,
  queryPathNodes,
  replaceAttributeValues,
  replacePathData,
  updateElement,
} from "./tools/elements.js";
import { exportDocument, openInInkscape, refreshInInkscape, renderPreview } from "./tools/preview.js";
import { importFont } from "./tools/fonts.js";
import { runAllowedAction, runPathDifference, runPathGeometry } from "./tools/geometry.js";
import { listCurrentSvgResources, listPreviewPngResources, readArtifactResource } from "./tools/resources.js";
import { connectInkscapeWindow, disconnectInkscapeWindow, pullGuiState } from "./tools/sync.js";

export function createServer() {
  const ctx = createToolContext();
  const server = new McpServer({
    name: "inksmcp",
    version: "0.1.0",
  });

  server.registerTool(
    "connect_inkscape_window",
    {
      title: "Connect Inkscape window",
      description: "Create an explicit InkSMCP connection for display-only or bidirectional GUI synchronization.",
      inputSchema: connectInkscapeWindowSchema,
    },
    (input) => runTool("connect_inkscape_window", () => connectInkscapeWindow(input, ctx)),
  );

  server.registerTool(
    "disconnect_inkscape_window",
    {
      title: "Disconnect Inkscape window",
      description: "Disconnect an explicit InkSMCP GUI synchronization connection by connection id or document id.",
      inputSchema: disconnectInkscapeWindowSchema,
    },
    (input) => runTool("disconnect_inkscape_window", () => disconnectInkscapeWindow(input, ctx)),
  );

  server.registerTool(
    "pull_gui_state",
    {
      title: "Pull GUI state",
      description: "Pull the current unsaved Inkscape GUI document state into the workspace for a bidirectional connection.",
      inputSchema: pullGuiStateSchema,
    },
    (input) => runTool("pull_gui_state", () => pullGuiState(input, ctx)),
  );

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
      description: "Add one basic SVG element to the existing document without replacing the SVG object tree.",
      inputSchema: addElementSchema,
    },
    (input) => runTool("add_element", () => addElement(input, ctx)),
  );

  server.registerTool(
    "apply_svg_operations",
    {
      title: "Apply SVG operations",
      description:
        "Apply an atomic batch of controlled in-place SVG operations. Prefer this for normal edits to existing drawings.",
      inputSchema: applySvgOperationsSchema,
    },
    (input) => runTool("apply_svg_operations", () => applySvgOperations(input, ctx)),
  );

  server.registerTool(
    "update_element",
    {
      title: "Update SVG element",
      description: "Update attributes or text for an existing element id without rebuilding the document.",
      inputSchema: updateElementSchema,
    },
    (input) => runTool("update_element", () => updateElement(input, ctx)),
  );

  server.registerTool(
    "nudge_path_element",
    {
      title: "Nudge SVG path element",
      description:
        "Move one existing path by dx/dy or half its width in one call. Use this for quick repeated path nudges with compact output.",
      inputSchema: nudgePathElementSchema,
    },
    (input) => runTool("nudge_path_element", () => nudgePathElement(input, ctx)),
  );

  server.registerTool(
    "draw_path",
    {
      title: "Draw SVG path",
      description:
        "Create a new path from raw SVG path data or structured path segments without replacing the document.",
      inputSchema: drawPathSchema,
    },
    (input) => runTool("draw_path", () => drawPath(input, ctx)),
  );

  server.registerTool(
    "replace_path_data",
    {
      title: "Replace path data",
      description: "Replace the d attribute of an existing path from raw SVG path data or structured path segments.",
      inputSchema: replacePathDataSchema,
    },
    (input) => runTool("replace_path_data", () => replacePathData(input, ctx)),
  );

  server.registerTool(
    "append_path_segment",
    {
      title: "Append path segment",
      description: "Append raw SVG path data or structured path segments to an existing path's d attribute.",
      inputSchema: appendPathSegmentSchema,
    },
    (input) => runTool("append_path_segment", () => appendPathSegment(input, ctx)),
  );

  server.registerTool(
    "edit_path_nodes",
    {
      title: "Edit path nodes",
      description:
        "Move, insert, or delete M/L/C/Q/Z path segments on an existing path without replacing the document.",
      inputSchema: editPathNodesSchema,
    },
    (input) => runTool("edit_path_nodes", () => editPathNodes(input, ctx)),
  );

  server.registerTool(
    "query_path_nodes",
    {
      title: "Query path nodes",
      description:
        "Return editable M/L/C/Q/Z path segment indexes, raw points, and absolute points for precise node edits.",
      inputSchema: queryPathNodesSchema,
    },
    (input) => runTool("query_path_nodes", () => queryPathNodes(input, ctx)),
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
      description: "Insert a safe raw SVG fragment into the existing document root or explicit parent id.",
      inputSchema: insertSvgFragmentSchema,
    },
    (input) => runTool("insert_svg_fragment", () => insertSvgFragment(input, ctx)),
  );

  server.registerTool(
    "replace_attribute_values",
    {
      title: "Replace attribute values in-place",
      description:
        "Replace exact attribute/style values on existing SVG elements while preserving geometry, ids, ordering, and the object tree. Use this for color/style/attribute changes instead of replace_document_svg.",
      inputSchema: replaceAttributeValuesSchema,
    },
    (input) => runTool("replace_attribute_values", () => replaceAttributeValues(input, ctx)),
  );

  server.registerTool(
    "replace_document_svg",
    {
      title: "Replace SVG document (full redraw)",
      description:
        "Destructive full-document replacement. Requires confirmFullDocumentReplacement=true and should only be used when the user explicitly asks to redraw/replace the whole SVG. Normal edits must use object-level tools.",
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
      description:
        "Open the workspace SVG in the Inkscape GUI as a best-effort workflow. This may open a new window; use refresh_in_inkscape after in-place edits to try updating the active window.",
      inputSchema: openInInkscapeSchema,
    },
    (input) => runTool("open_in_inkscape", () => openInInkscape(input, ctx)),
  );

  server.registerTool(
    "refresh_in_inkscape",
    {
      title: "Refresh active Inkscape window",
      description:
        "Refresh the active Inkscape window through the installed InkSMCP companion extension by default. This avoids unstable file-rebase actions that can crash Inkscape on Windows; set allowUnstableRebase=true only for manual experiments.",
      inputSchema: refreshInInkscapeSchema,
    },
    (input) => runTool("refresh_in_inkscape", () => refreshInInkscape(input, ctx)),
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
