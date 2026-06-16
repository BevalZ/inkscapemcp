# inksmcp

`inksmcp` is a local, single-user stdio MCP server for AI-assisted Inkscape SVG workflows.

The server treats workspace SVG files as the source of truth. Inkscape is used for PNG preview rendering, export, and optional GUI opening.

## Install

```powershell
npm install
```

## Build And Test

```powershell
npm run typecheck
npm test
npm run build
```

Inkscape integration tests render a PNG preview when Inkscape is available. If no binary is found, Inkscape-dependent paths report `INKSCAPE_UNAVAILABLE`.

## Run

```powershell
npm run build
node dist/server.js
```

For development:

```powershell
npm run dev
```

## Codex MCP Config

After building, configure Codex CLI to start the stdio server from this repository:

```toml
[mcp_servers.inksmcp]
command = "node"
args = ["D:\\Github_repos\\Hydens\\inksmcp\\dist\\server.js"]
```

## Configuration

- `INKSMCP_WORKSPACE`: workspace root. Defaults to `./workspace`.
- `INKSCAPE_BIN`: explicit Inkscape binary path.
- `INKSMCP_INKSCAPE_TIMEOUT_MS`: default Inkscape command timeout. Defaults to `30000`.
- `INKSMCP_MAX_TIMEOUT_MS`: maximum allowed tool-provided timeout. Defaults to `120000`.

The workspace layout is:

```text
workspace/
  drawings/
    {docId}/
      current.svg
      metadata.json
      operations.log
      history/
      preview.png
  archive/
  fonts/
```

## Tools

Phase 1 document and preview tools:

- `create_document`
- `add_element`
- `apply_svg_operations`
- `update_element`
- `delete_element`
- `insert_svg_fragment`
- `replace_document_svg`
- `query_document`
- `render_preview`
- `export_document`
- `open_in_inkscape`
- `list_history`
- `rollback_document`
- `archive_document`

Phase 2 tools:

- `import_font`
- `path_union`
- `path_difference`
- `path_intersection`
- `path_exclusion`
- `path_combine`
- `path_break_apart`
- `path_simplify`
- `run_action`

Raw SVG fragments are parsed and safety-filtered before save. Dangerous elements, event handlers, remote references, local file references, and data references are rejected. Full document replacement requires an `<svg>` root with `viewBox` or both `width` and `height`.

Every document write snapshots `current.svg` before replacement. Rollback also snapshots the current state before restoring history. Physical deletion is not supported; use `archive_document`.

## Phase 2 Notes

`import_font` copies a local `.ttf`, `.otf`, `.woff`, or `.woff2` file into `workspace/fonts/`. It does not download remote fonts, embed fonts into SVG files, or guarantee cross-machine font availability.

Path geometry tools run Inkscape actions on explicit element ids in the current document. They do not use hidden GUI selection state. `autoConvertToPath` defaults to `true`; when selected text is converted, the tool returns a warning because the text may no longer be editable.

`path_difference` uses an explicit `baseId` and `cutterIds`. Geometry tools support optional `resultId`; conflicts with unrelated existing ids are rejected before writing.

`run_action` is allowlisted. Current actions are:

- `object_to_path`
- `selection_group`
- `selection_ungroup`
- `path_simplify`

## Resources

The server exposes artifact resources for hosts that support MCP resources:

- `inksmcp://documents/{docId}/current.svg`
- `inksmcp://documents/{docId}/preview.png`

Resources are read from the configured workspace only. The server still returns file path metadata from tools for Codex CLI workflows.
