# inksmcp

`inksmcp` is a local, single-user stdio MCP server for AI-assisted Inkscape SVG workflows.

The server treats workspace SVG files as the source of truth. Inkscape is used for PNG preview rendering, export, and optional GUI opening.

## Install

```powershell
npm install
```

## Inkscape Companion Extension

Install the optional Inkscape extension when you want to refresh the already-open Inkscape window without opening another window:

```powershell
npm run install:inkscape-extension
```

Then restart Inkscape. The extension can be used from `Extensions > InkSMCP > Pull Workspace Document` for manual diagnosis.

On Windows, MCP uses direct active-window attribute sync for edits that can be expressed as existing-object attribute updates, such as colors, coordinates, sizes, opacity, transforms, and path data. Structural edits trigger the companion extension after save; if Inkscape cannot finish the refresh before the timeout, the workspace SVG still remains authoritative.

The older experimental refresh path writes the active `docId` into the extension config and triggers Inkscape with:

```text
active-window-start;dev.hydens.inksmcp.pull-workspace-document.noprefs;active-window-end
```

This is different from Inkscape's `file-rebase` action.

The installer copies `inksmcp_pull.inx` and `inksmcp_pull.py` to the Inkscape user extensions directory and writes `inksmcp-extension.json` with the current workspace root. By default the workspace is `./workspace`; override it when needed:

```powershell
npm run install:inkscape-extension -- --workspace D:\path\to\inksmcp\workspace
```

If Inkscape is installed in a non-standard location, pass its binary or the user data directory explicitly:

```powershell
npm run install:inkscape-extension -- --inkscape-bin D:\Software\Scoop\apps\inkscape\current\bin\inkscape.com
npm run install:inkscape-extension -- --user-data-dir C:\Users\you\AppData\Roaming\inkscape
```

Open the Inkscape window from `workspace/drawings/{docId}/current.svg` so the extension can infer the document id when MCP triggers it. The menu item is still useful for manual diagnosis: leave `Document id` empty when the file was opened from the workspace path, or enter the `docId` manually.

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

For MCP client hot reload during development:

```powershell
npm run build
node dist/hot-server.js
```

For continuous rebuilds, keep this running in a separate terminal:

```powershell
npm run build:watch
```

Keep the MCP client connected to `dist/hot-server.js`. After TypeScript rebuilds, the hot proxy watches `dist/`, restarts the internal `server.js` worker, replays MCP initialization, and sends list-changed notifications so hosts can refresh tools/resources without reconnecting.

## Codex MCP Config

After building, configure Codex CLI to start the stdio server from this repository:

```toml
[mcp_servers.inksmcp]
command = "node"
args = ["D:\\Github_repos\\Hydens\\inksmcp\\dist\\server.js"]
```

For development hot reload, point the MCP client at the stable hot proxy instead:

```toml
[mcp_servers.inksmcp]
command = "node"
args = ["D:\\Github_repos\\Hydens\\inksmcp\\dist\\hot-server.js"]
```

If the host supports MCP `notifications/tools/list_changed`, changed tool registrations become visible after rebuild without restarting the client. Hosts that ignore list-changed notifications may still require a reconnect to refresh their cached tool list.

## Configuration

- `INKSMCP_WORKSPACE`: workspace root. Defaults to `./workspace`.
- `INKSCAPE_BIN`: explicit Inkscape binary path.
- `INKSMCP_INKSCAPE_TIMEOUT_MS`: default Inkscape command timeout. Defaults to `30000`.
- `INKSMCP_MAX_TIMEOUT_MS`: maximum allowed tool-provided timeout. Defaults to `120000`.
- `INKSMCP_AUTO_REFRESH_INKSCAPE`: set to `0` to disable automatic active-window refresh after successful write tools. Existing-object attribute updates use direct active-window attribute sync; structural edits trigger companion-extension refresh.
- `INKSMCP_AUTO_REFRESH_TIMEOUT_MS`: timeout for automatic active-window attribute sync or companion-extension refresh. Defaults to `10000`.
- `INKSMCP_ENABLE_UNSAFE_ACTIVE_WINDOW_REFRESH`: Windows-only escape hatch for manual experiments with active-window companion refresh. Defaults to disabled because it can target the wrong document or crash Inkscape.
- `INKSMCP_HOT_WATCH_PATHS`: paths watched by `dist/hot-server.js`. Defaults to the build output directory.
- `INKSMCP_HOT_DEBOUNCE_MS`: debounce before restarting the hot worker. Defaults to `300`.
- `INKSMCP_HOT_RESTART_GRACE_MS`: time to wait for in-flight requests before forcing worker restart. Defaults to `2000`.
- `INKSMCP_HOT_WORKER_CWD`: working directory for the hot worker. Defaults to the package root.

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
- `nudge_path_element`
- `draw_path`
- `replace_path_data`
- `append_path_segment`
- `edit_path_nodes`
- `query_path_nodes`
- `delete_element`
- `insert_svg_fragment`
- `replace_attribute_values`
- `replace_document_svg`
- `query_document`
- `render_preview`
- `export_document`
- `open_in_inkscape`
- `refresh_in_inkscape`
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

Raw SVG fragments are parsed and safety-filtered before save. Dangerous elements, event handlers, remote references, local file references, and data references are rejected. Full document replacement requires an `<svg>` root with `viewBox` or both `width` and `height`, plus `confirmFullDocumentReplacement: true`.

For normal edits, prefer in-place tools such as `update_element`, `apply_svg_operations`, `draw_path`, `replace_path_data`, `append_path_segment`, `edit_path_nodes`, `insert_svg_fragment`, and `replace_attribute_values`. Use `query_path_nodes` before fine path edits when you need segment indexes and editable points. `replace_document_svg` is a full redraw path and intentionally rejects calls that do not explicitly confirm full document replacement.

Every document write snapshots `current.svg` before replacement. Rollback also snapshots the current state before restoring history. Physical deletion is not supported; use `archive_document`.

For automatic GUI refresh, `update_element`, `nudge_path_element`, `replace_path_data`, `append_path_segment`, `edit_path_nodes`, attribute-only `apply_svg_operations`, and direct attribute changes from `replace_attribute_values` use Inkscape's active-window `object-set-attribute` action against existing element ids. Edits that add, delete, insert, remove attributes, or change text trigger companion-extension refresh after save; failures return warnings and do not roll back the workspace SVG.

`refresh_in_inkscape` uses the companion extension by default and does not open another Inkscape window. It does not run Inkscape's active-window `file-rebase` action unless `allowUnstableRebase: true` is explicitly supplied; keep that path for manual experiments only.

## Phase 2 Notes

`draw_path`, `replace_path_data`, and `append_path_segment` accept either raw SVG `d` strings or structured segments. Structured segments currently support `M`, `L`, `C`, `Q`, and `Z`; raw `d` strings are validated for SVG path command/parameter shape before save.

`edit_path_nodes` applies compact node-level edits to an existing path's `d` attribute. It can move endpoints/control points, insert structured segments, and delete segments. For safe round-tripping it supports paths made from `M`, `L`, `C`, `Q`, and `Z` commands; use `replace_path_data` for more complex SVG path commands such as arcs.

`query_path_nodes` is read-only and returns the same editable segment boundary used by `edit_path_nodes`, including segment indexes, raw point values, absolute point positions, and available point names. It does not create snapshots or refresh Inkscape.

Example:

```json
{
  "docId": "fish",
  "elementId": "fin-detail",
  "segments": [
    { "cmd": "M", "x": 10, "y": 10 },
    { "cmd": "C", "x1": 20, "y1": 5, "x2": 30, "y2": 5, "x": 40, "y": 10 }
  ],
  "attributes": {
    "fill": "none",
    "stroke": "#166534",
    "stroke-width": 2
  }
}
```

Node edit example:

```json
{
  "docId": "fish",
  "elementId": "fish-mouth",
  "edits": [
    { "type": "move_point", "segmentIndex": 1, "point": "c1", "dx": -2, "dy": 1 },
    { "type": "move_point", "segmentIndex": 1, "point": "end", "dx": -4, "dy": 0 }
  ]
}
```

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
