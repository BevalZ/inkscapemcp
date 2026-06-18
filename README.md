# inksmcp

`inksmcp` is a local, single-user stdio MCP server for AI-assisted Inkscape SVG workflows.

The server treats workspace SVG files as the default source of truth. When a document is explicitly connected in bidirectional mode, MCP pulls the current unsaved Inkscape GUI state before current-state reads and writes.

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

The installer copies `inksmcp_pull.inx`, `inksmcp_push_gui_state.inx`, and `inksmcp_pull.py` to the Inkscape user extensions directory and writes `inksmcp-extension.json` with the current workspace root. By default the workspace is `./workspace`; override it when needed:

```powershell
npm run install:inkscape-extension -- --workspace D:\path\to\inksmcp\workspace
```

If Inkscape is installed in a non-standard location, pass its binary or the user data directory explicitly:

```powershell
npm run install:inkscape-extension -- --inkscape-bin D:\Software\Scoop\apps\inkscape\current\bin\inkscape.com
npm run install:inkscape-extension -- --user-data-dir C:\Users\you\AppData\Roaming\inkscape
```

Open the Inkscape window from `workspace/drawings/{docId}/current.svg` so the extension can infer the document id when MCP triggers it. The menu item is still useful for manual diagnosis: leave `Document id` empty when the file was opened from the workspace path, or enter the `docId` manually.

## Bidirectional GUI Sync

Bidirectional sync is explicit and off by default. Use it when user edits inside Inkscape should become authoritative even before the file is saved:

1. Install the companion extension and restart Inkscape.
2. Open `workspace/drawings/{docId}/current.svg` in Inkscape.
3. Call `connect_inkscape_window({ "docId": "...", "syncMode": "bidirectional" })`.
4. MCP tools that read or write current SVG state will pre-pull the GUI state through the extension.
5. Optionally call `start_gui_sync_polling({ "docId": "...", "connectionId": "..." })` to keep pulling GUI state in the background.

The pull path is file-based and identity-checked. The extension writes `workspace/gui-pull/{requestId}.svg` plus `workspace/gui-pull/{requestId}.json`; MCP validates the manifest, the SVG metadata marker, the connection id, and revision/hash metadata before replacing `current.svg`.

Use `pull_gui_state` for an explicit manual pull, `start_gui_sync_polling` / `stop_gui_sync_polling` for explicit lightweight background polling, `get_gui_sync_status` to inspect polling errors, and `disconnect_inkscape_window` to end a connection. Polling is disabled by default. `start_gui_sync_polling` can persist a polling preference with `persist: true`; persisted entries are reloaded by later server contexts only when the connection is still active. If more than one active bidirectional connection targets the same document, current-state tools reject unless the operation provides a specific `connectionId`; MCP never guesses based on the active window alone.

For multi-window workflows, pass `windowId` and/or `runtimeDocumentId` to `connect_inkscape_window`. Those values are persisted in the connection sidecar, SVG marker, companion-extension config, and GUI pull manifest when available. If a connection supplied either value, a missing or mismatched value on a later GUI pull rejects with `SYNC_IDENTITY_MISMATCH`.

When a GUI pull detects that the workspace changed since the connection baseline, `SYNC_CONFLICT` includes a `conflictReport` with baseline metadata, current workspace metadata, GUI candidate hash, id diff, and policy suggestions. Use `conflictPolicy: "prefer_gui"` only when GUI state should replace newer workspace edits. Use `conflictPolicy: "merge_non_overlapping"` to attempt a conservative three-way merge for element ids changed on only one side; overlapping element changes, text conflicts, deletes, reparenting, sibling-order changes, dependency-sensitive changes, and concurrent adds with the same id still reject with structured merge conflict classes.

Use `conflictPolicy: "preview_only"` to validate and inspect a GUI pull without replacing `current.svg`. When the pull is clean, or a conservative non-overlapping merge candidate can be computed, MCP writes a review artifact under `workspace/drawings/{docId}/merge-previews/` and returns `pullStatus: "clean"` or `"previewable"`. If no safe candidate exists, it returns `pullStatus: "conflict_only"` with structured conflict classes and no preview SVG. Use `list_merge_previews` and `read_merge_preview` to rediscover and inspect saved merge preview artifacts later; both tools are read-only and include SVG content only when `includeSvg: true`.

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
- `INKSMCP_GUI_PRE_PULL_TTL_MS`: default cache window for automatic GUI pre-pull. Defaults to `1000`.
- `INKSMCP_GUI_POLL_INTERVAL_MS`: default interval for explicit GUI sync polling. Defaults to `1000`.
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
      operation-diffs/
      operation-previews/
      merge-previews/
      preview.png
  archive/
  connections/
  fonts/
  gui-pull/
```

## Tools

Phase 1 document and preview tools:

- `connect_inkscape_window`
- `disconnect_inkscape_window`
- `pull_gui_state`
- `start_gui_sync_polling`
- `stop_gui_sync_polling`
- `get_gui_sync_status`
- `list_merge_previews`
- `read_merge_preview`
- `create_document`
- `import_svg_document`
- `create_checkpoint`
- `add_element`
- `apply_svg_operations`
- `update_element`
- `nudge_path_element`
- `draw_path`
- `replace_path_data`
- `append_path_segment`
- `validate_path_data`
- `edit_path_nodes`
- `transform_path_points`
- `query_path_nodes`
- `delete_element`
- `insert_svg_fragment`
- `replace_attribute_values`
- `replace_document_svg`
- `query_document`
- `preview_svg_operations`
- `replay_operations`
- `list_operation_previews`
- `read_operation_preview`
- `apply_operation_preview`
- `render_preview`
- `export_document`
- `export_document_external`
- `open_in_inkscape`
- `refresh_in_inkscape`
- `diagnose_inkscape_gui`
- `list_history`
- `diff_document_snapshots`
- `propose_id_repairs`
- `apply_id_repairs`
- `recover_document`
- `rollback_document`
- `archive_document`

Phase 2 tools:

- `import_font`
- `vectorize_bitmap`
- `path_union`
- `path_difference`
- `path_intersection`
- `path_exclusion`
- `path_combine`
- `path_break_apart`
- `path_simplify`
- `run_action`

Raw SVG fragments are parsed and safety-filtered before save. Dangerous elements, event handlers, remote references, local file references, and data references are rejected. Full document replacement requires an `<svg>` root with `viewBox` or both `width` and `height`, plus `confirmFullDocumentReplacement: true`.

External SVG files must be imported before editing. `import_svg_document` accepts a local `.svg` file and creates a workspace copy; later edits do not mutate the original file. `export_document_external` writes an export to an explicit local output directory with a safe filename. Remote URLs, `file:` URIs, and UNC paths are rejected for these controlled file-boundary tools.

For normal edits, prefer in-place tools such as `update_element`, `apply_svg_operations`, `draw_path`, `replace_path_data`, `append_path_segment`, `edit_path_nodes`, `transform_path_points`, `insert_svg_fragment`, and `replace_attribute_values`. Use `query_path_nodes` before fine path edits when you need segment indexes and editable points. `replace_document_svg` is a full redraw path and intentionally rejects calls that do not explicitly confirm full document replacement.

`query_document` supports `responseMode: "compact" | "standard" | "full"`. Compact mode returns document metadata, target summary, and counts instead of the full element tree. `includeDependencies: true` adds read-only summaries for internal `url(#id)` / `href="#id"` references and definitions. `includeResolvedStyle: true` adds read-only effective style summaries for presentation attributes and inline style declarations, including inheritance and local override source tracking; it reports unsupported CSS features such as variables, `!important`, and stylesheet cascade as limitations rather than claiming full renderer-computed style. `includePathNodes: true` adds document-wide path-node summaries using the same supported `M`, `L`, `C`, `Q`, and `Z` boundary as `query_path_nodes`; compact mode returns counts and per-path command/point summaries, while standard/full mode includes segment details. Set `pathNodeNormalize: "absolute"` with `includePathNodes` to add absolute normalized path-node summaries; compact mode keeps this token-conscious, while standard/full mode includes normalized segment point details. Unsupported path data is reported as per-path warnings without failing the whole query. `query_document` can also include semantic fingerprints with `includeFingerprints: true`, and can rank current-document candidates with `matchElementFingerprint`. The matching uses type, ancestry, sibling position, attribute/style hashes, geometry/path fingerprints, text hash, and approximate bounding boxes. These helpers do not automatically rewrite ids or merge objects.

Every document write snapshots `current.svg` before replacement and writes a compact JSON diff artifact under `workspace/drawings/{docId}/operation-diffs/` when possible. Diff artifact failures are warnings and do not roll back a successful SVG write. Use `create_checkpoint` to create an explicit named history snapshot before risky edits; it leaves `current.svg` byte-identical and does not refresh Inkscape. Use `diff_document_snapshots` to compare two history snapshots without mutating `current.svg`; compact mode returns summary counts and changed ids, while full mode includes attribute, text, and structure change arrays. Use `propose_id_repairs` to compare a baseline history snapshot with the current SVG and return read-only semantic id remapping proposals. It pre-pulls active bidirectional GUI state before comparison, accepts only unique candidates above `minConfidence`, reports low-confidence or ambiguous rejected candidates when `includeRejected: true`, and never snapshots, logs, writes artifacts, or refreshes Inkscape. Use `apply_id_repairs` only after reviewing explicit mappings; it requires `confirmApplyRepairs: true`, renames current element ids from `toElementId` to `fromElementId`, rewrites conservative internal references, validates conflicts before snapshotting, snapshots and writes diagnostics on success, logs a compact summary, and uses structural companion-extension refresh. Use `preview_svg_operations` to dry-run a controlled `apply_svg_operations` batch against the current document and return the same structured diff shape without writing `current.svg`, creating snapshots, updating metadata, appending operation logs, writing operation-diff artifacts, or refreshing Inkscape. Like other current-state read tools, it pre-pulls active bidirectional GUI state by default and can return a stale-read warning with `allowStaleRead: true`. Set `savePreview: true` on `preview_svg_operations` or dry-run `replay_operations` to save a review artifact under `operation-previews/`; `list_operation_previews` returns compact metadata and `read_operation_preview` returns metadata plus the full diff, with SVG content included only when `includeSvg: true`. Use `apply_operation_preview` to apply a saved preview artifact after review. It requires `confirmApplyPreview: true`, verifies the artifact belongs to the requested `docId`, pre-pulls active bidirectional GUI state before baseline comparison, rejects unguarded or stale baselines, snapshots before replacing `current.svg` with the candidate SVG, writes operation diagnostics, logs a compact entry, and uses structural companion-extension refresh rather than active-window attribute sync. Use `replay_operations` to re-apply a controlled operation batch only against an explicit `{ revision, contentHash }` baseline. Write mode rejects stale baselines, requires deterministic add operations with explicit `attributes.id`, snapshots before save, writes operation diagnostics, logs a summary, and refreshes the GUI through the same attribute-sync or companion-extension path as `apply_svg_operations`; dry-run mode returns the diff without workspace writes. Use `recover_document` to restore from an explicit history snapshot or checkpoint after snapshotting the current state; active bidirectional GUI sync blocks recovery unless `confirmDiscardGuiState: true`. Rollback also snapshots the current state before restoring history. Physical deletion is not supported; use `archive_document`.

For automatic GUI refresh, `update_element`, `nudge_path_element`, `replace_path_data`, `append_path_segment`, `edit_path_nodes`, `transform_path_points`, attribute-only `apply_svg_operations`, and direct attribute changes from `replace_attribute_values` use Inkscape's active-window `object-set-attribute` action against existing element ids. Edits that add, delete, insert, remove attributes, or change text trigger companion-extension refresh after save; failures return warnings and do not roll back the workspace SVG.

`refresh_in_inkscape` uses the companion extension by default and does not open another Inkscape window. It does not run Inkscape's active-window `file-rebase` action unless `allowUnstableRebase: true` is explicitly supplied; keep that path for manual experiments only.

`diagnose_inkscape_gui` inspects the Inkscape binary, user extension directory, and InkSMCP companion extension files without mutating SVG state and without mouse/keyboard automation. It returns capability readiness and remediation hints for same-window refresh and bidirectional GUI pull. GUI automation remains diagnostic fallback only; the primary path is companion extension refresh or allowlisted active-window actions.

## Phase 2 Notes

`draw_path`, `replace_path_data`, and `append_path_segment` accept either raw SVG `d` strings or structured segments. Structured segments currently support `M`, `L`, `C`, `Q`, and `Z`; raw `d` strings are validated for SVG path command/parameter shape before save.

`validate_path_data` is a read-only preflight helper for raw SVG path `d` strings. It returns compact segment counts, command counts, unsupported-command count, relative/absolute command counts, and editable point summaries without requiring `docId`, reading workspace files, creating snapshots, writing logs, or refreshing Inkscape. Set `requireMoveTo: false` to validate append-style fragments such as `L10 10`.

`edit_path_nodes` applies compact node-level edits to an existing path's `d` attribute. It can move endpoints/control points, insert structured segments, and delete segments. For safe round-tripping it supports paths made from `M`, `L`, `C`, `Q`, and `Z` commands; use `replace_path_data` for more complex SVG path commands such as arcs.

`transform_path_points` transforms endpoint/control-point selections on an existing path. Query first with `query_path_nodes`, then pass explicit `pointSelector.points` entries such as `{ "segmentIndex": 2, "point": "c1" }`, a bounded selector such as `{ "type": "bbox", "minX": 10, "minY": 10, "maxX": 40, "maxY": 30, "pointTypes": ["end", "c1"] }`, a segment range selector such as `{ "type": "segment_range", "startSegmentIndex": 1, "endSegmentIndex": 3, "pointTypes": ["end"] }`, a segment list selector such as `{ "type": "segment_list", "segmentIndexes": [1, 3, 5], "pointTypes": ["end"] }`, a command selector such as `{ "type": "command", "commands": ["C", "c"], "pointTypes": ["c1", "c2"] }`, a nearest-point selector such as `{ "type": "nearest", "x": 118, "y": 34, "pointTypes": ["c1", "end"], "maxDistance": 6 }`, or a radius selector such as `{ "type": "radius", "x": 118, "y": 34, "radius": 8, "pointTypes": ["c1", "c2"] }`. Bbox, nearest, and radius coordinates are absolute SVG user units; bbox includes edge points, segment ranges are inclusive path segment indexes, segment lists target non-contiguous segment indexes, command selectors target case-sensitive supported path command names, nearest selects exactly one editable point, and radius selects every editable point within the inclusive circular distance. Selector `pointTypes` defaults to `["end", "c1", "c2"]`, and resolved selectors use deterministic path-order tie-breaks/order. Use `transform: { "type": "translate", "dx": -2, "dy": 1 }`, `transform: { "type": "set_absolute", "points": [{ "x": 116, "y": 36 }] }`, or `transform: { "type": "set_relative", "points": [{ "x": 16, "y": 6 }] }`. Set-transform target points are matched to resolved selections by array order; `set_absolute` uses absolute SVG coordinates, while `set_relative` uses coordinates relative to each selected segment's current base point. The tool preserves path command case, element id, and object tree, snapshots before successful writes, returns previous/next `d`, and uses direct active-window `d` sync.

`query_path_nodes` is read-only and returns the same editable segment boundary used by `edit_path_nodes`, including segment indexes, raw point values, absolute point positions, and available point names. It accepts `normalize: "none" | "absolute"`; the default keeps the existing raw segment response, while `normalize: "absolute"` adds an explicit normalized segment view whose point values are absolute coordinates. It does not create snapshots or refresh Inkscape.

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

`vectorize_bitmap` runs an allowlisted local bitmap vectorizer (`vtracer` or `potrace`) and writes a separate SVG artifact under `workspace/drawings/{docId}/vectorized/`. It does not insert or replace artwork automatically. For PNG sources, it can render the result through Inkscape and report basic pixel-diff metrics such as mean absolute error, RMSE, and exact pixel match ratio. Configure vectorizer binaries with `VTRACER_BIN` or `POTRACE_BIN`, or put them on `PATH`.

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
