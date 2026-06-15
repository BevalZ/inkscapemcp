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

Raw SVG fragments are parsed and safety-filtered before save. Dangerous elements, event handlers, remote references, local file references, and data references are rejected. Full document replacement requires an `<svg>` root with `viewBox` or both `width` and `height`.

Every document write snapshots `current.svg` before replacement. Rollback also snapshots the current state before restoring history. Physical deletion is not supported; use `archive_document`.
