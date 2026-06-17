# Inkscape MCP Plan

## Goal

Build a local MCP server that lets an AI create, inspect, modify, preview, and export Inkscape-compatible vector drawings in near real time.

The practical first version should not try to simulate mouse and keyboard control. It should treat the SVG document as the source of truth, use Inkscape as the renderer/exporter/editor, and expose a small set of reliable MCP tools.

## Current Local Facts

- Repository directory is currently empty and is not a git repository.
- Node.js is available: `v26.1.0`.
- Python is available: `3.12.10`.
- Inkscape is available through Scoop.
- Preferred Windows CLI entrypoint:

```powershell
D:\Software\Scoop\apps\inkscape\current\bin\inkscape.com
```

- Inkscape version checked locally:

```text
Inkscape 1.4.3 (0d15f75, 2025-12-25)
```

- The installed Inkscape CLI supports the important control surfaces:
  - `--pipe`
  - `--query-*`
  - `--select`
  - `--actions`
  - `--action-list`
  - `--shell`
  - `--active-window`
  - `--export-filename`

## Design Principles

1. Keep SVG as the source of truth.
2. Make every AI operation deterministic and replayable.
3. Prefer SVG document operations over GUI automation.
4. Use Inkscape for operations it already owns well: rendering, export, object queries, selected actions, and GUI display.
5. Expose only a small, safe MCP tool surface at first.
6. Add abstractions only after repeated concrete needs appear.

## Confirmed Boundaries

### Product Boundary

- First target is a local, single-user MCP server.
- First validation client is Codex CLI.
- MCP transport is stdio only for the MVP.
- MCP resources and prompts are out of scope for the MVP.
- HTTP or Streamable HTTP transport is out of scope for the MVP.
- The server may start without Inkscape installed, but Inkscape-dependent tools must fail explicitly.

### Document Boundary

- The workspace is the only editable area.
- Default workspace path is `./workspace`.
- `INKSMCP_WORKSPACE` can override the workspace path.
- External SVG files must be imported into the workspace before editing.
- The server edits workspace copies, not original external files.
- Multiple documents are supported through `docId`.
- Each tool call operates on one document only.
- Cross-document copy, merge, reference, or synchronization is out of scope for the MVP.
- Same-document write operations are serialized.
- Different documents may be processed in parallel.

### Drawing Boundary

- MVP drawing supports basic SVG elements, basic styles, and `group`.
- Supported basic elements are `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `text`, and `g`.
- Supported basic styling includes `fill`, `stroke`, opacity fields, and `transform`.
- Editing coordinates use SVG viewBox/user units.
- Color input accepts standard SVG/CSS color strings; examples should prefer `#RRGGBB` and `#RRGGBBAA`.
- Full Inkscape layer semantics are out of scope for the MVP.
- Object lock and hidden-state management are out of scope for the MVP; ordinary SVG attributes such as `display`, `visibility`, and `opacity` may still exist.
- Advanced definitions such as gradients, markers, clip paths, masks, symbols, and patterns are supported through raw SVG, not through dedicated structured tools in the MVP.

### Raw SVG Boundary

- Raw SVG/XML is allowed in the MVP.
- Dangerous content must still be filtered.
- Rejected content includes `<script>`, `<foreignObject>`, event-handler attributes such as `onclick`, remote URL references, unsafe local file references, and large `data:` payload patterns that bypass asset controls.
- `insert_svg_fragment` inserts raw SVG into a target parent.
- `replace_document_svg` replaces the whole document.
- Full document replacement must create a snapshot first.
- SVG fragments may contain multiple top-level SVG elements.
- SVG fragments may not contain a complete `<svg>` root; full roots belong to `replace_document_svg`.
- Id conflicts are rejected by default.
- `renameConflictingIds: true` may rename conflicts and update internal fragment references such as `url(#id)`.
- Full document replacement requires explicit canvas size: either `viewBox`, or both `width` and `height`.
- XML must be well-formed, the full document root must be `<svg>`, safety filtering must pass, and all paths must remain inside the workspace.

### Preview And Export Boundary

- The real-time MVP means SVG updates followed by PNG preview generation.
- `render_preview` returns PNG content when supported by the host and always returns file path metadata.
- Codex CLI validation treats PNG file creation and correct path metadata as the hard requirement; inline image display is optional.
- Inkscape GUI can be opened through `open_in_inkscape`, but the core loop does not depend on GUI state.
- Automatic Inkscape GUI synchronization prefers direct active-window attribute sync for existing-object attribute updates. Structural changes remain limited to best-effort active-window companion extension refresh after successful workspace writes.
- MVP export formats are `svg`, `png`, and `pdf`.
- Export-time text-to-path is supported as an option for visual consistency.
- Editing keeps text as editable `text` elements.

### Font And Asset Boundary

- Basic text properties are supported: `font-family`, `font-size`, `font-weight`, `font-style`, and `text-anchor`.
- Remote font download is out of scope.
- Font embedding is not part of the MVP.
- `import_font` is Phase 2.
- External image import is out of scope for the MVP.
- Network assets and remote SVG references are forbidden in the MVP.

### History And Deletion Boundary

- Every write operation creates a full `current.svg` snapshot before modification.
- History supports listing snapshots and rolling back to a snapshot.
- Rollback itself also creates a snapshot first.
- Redo stacks, semantic diffs, branching history, and multiplayer merge are out of scope.
- Physical document deletion is out of scope for the MVP.
- `archive_document` may mark or move documents as archived.
- No default limits are applied to SVG size, raw fragment size, history size, or preview dimensions.

### Runtime Boundary

- Inkscape binary discovery order is:
  1. `INKSCAPE_BIN`
  2. project configuration
  3. `PATH` entries such as `inkscape.com` or `inkscape`
  4. Windows/Scoop known paths as best effort
- Inkscape calls have a default timeout of `30000` ms.
- `INKSMCP_INKSCAPE_TIMEOUT_MS` can override the default timeout.
- `INKSMCP_MAX_TIMEOUT_MS` caps tool-provided timeout values.
- Tool-provided `timeoutMs` values must stay within `[1000, max]`.
- If raw SVG is valid and saved but Inkscape rendering fails, keep the SVG and return a warning.
- If XML parsing, safety filtering, or file writing fails, do not replace `current.svg`.

### Path Geometry Boundary

- Path geometry is required, but not in Phase 1.
- Phase 2 adds explicit tools such as `path_union`, `path_difference`, `path_intersection`, `path_exclusion`, `path_combine`, `path_break_apart`, and `path_simplify`.
- Path geometry is executed by Inkscape, not by a custom geometry engine.
- Path geometry tools operate only on existing element ids in the current document.
- Results use Inkscape-native replacement semantics: selected/input objects are replaced by the result.
- Keeping input copies requires an explicit duplicate operation before geometry.
- `autoConvertToPath` defaults to `true`.
- If text is converted to path, the result must return a warning because the text is no longer editable.
- Difference/subtract tools must use explicit `baseId` and `cutterIds`.
- Geometry tools support optional `resultId`; conflicts are errors.
- The tool must return a stable result id, assigning or repairing one after Inkscape processing when needed.

## Architecture

```text
AI / MCP Host
  -> inksmcp MCP Server
    -> SVG document engine
    -> Inkscape CLI adapter
    -> workspace and history manager
    -> preview/export/query tools
  -> Inkscape GUI
  -> SVG / PNG / PDF outputs
```

The MCP server owns document state. Inkscape is used as a trusted external engine for visualization and export, not as the only state container.

## Recommended Stack

- TypeScript and Node.js
- `@modelcontextprotocol/sdk`
- `zod` for tool input validation
- XML DOM parser for SVG manipulation
- `vitest` for focused tests
- Inkscape CLI for preview/export/query integration tests

TypeScript is a good fit because the MCP TypeScript SDK is the most direct path for a local MCP server, and strict schemas help keep AI tool calls predictable.

## Initial Tool Surface

### `create_document`

Create a new SVG document.

Inputs:

- optional safe `docId`
- optional title
- width
- height
- unit
- optional background

Output:

- document metadata
- path to `current.svg`

`docId` values must be path-safe. Display names belong in a separate `title` field.

### `add_element`

Add one SVG element.

Supported MVP element types:

- `rect`
- `circle`
- `ellipse`
- `line`
- `polyline`
- `polygon`
- `path`
- `text`
- `g`

Inputs:

- document id
- element type
- attributes
- optional parent id

Output:

- created element id
- updated document metadata

### `apply_svg_operations`

Apply a batch of controlled SVG operations.

Inputs:

- document id
- ordered list of supported operations
- optional preview flag

Output:

- operation summary
- changed element ids
- optional preview metadata

The batch is atomic. Operations are applied in a temporary DOM and replace `current.svg` only after every operation succeeds and validation passes.

### `update_element`

Update an existing element by id.

Inputs:

- document id
- element id
- attributes to set
- attributes to remove
- optional transform/style changes

Output:

- updated element summary

### `delete_element`

Delete an element by id.

Inputs:

- document id
- element id

Output:

- deletion result

### `insert_svg_fragment`

Insert raw SVG into an existing parent.

Inputs:

- document id
- parent element id, or root insertion target
- raw SVG fragment
- optional `renameConflictingIds`

Output:

- inserted element ids
- renamed id map, when applicable
- warning list

Fragments may contain multiple top-level SVG elements, but not a complete `<svg>` root.

### `replace_document_svg`

Replace the whole SVG document.

Inputs:

- document id
- full SVG document

Output:

- replacement result
- snapshot path
- document metadata

The replacement document must have an `<svg>` root and an explicit canvas size through `viewBox`, or both `width` and `height`.

### `query_document`

Return document structure and object data.

Inputs:

- document id
- optional element id filter
- optional include bounding boxes flag

Output:

- page size
- element tree summary
- ids
- styles
- transforms
- optional bounding boxes from Inkscape `--query-*`

### `render_preview`

Render the current SVG to PNG.

Inputs:

- document id
- width or dpi
- optional background

Output:

- preview PNG path or MCP image result
- render metadata

Codex CLI validation only requires the PNG file and path metadata to be correct. Inline image display is a bonus.

### `open_in_inkscape`

Open the SVG document in the Inkscape GUI.

Inputs:

- document id

Output:

- process/window launch result

### `export_document`

Export the document through Inkscape.

Inputs:

- document id
- output type: `svg`, `png`, `pdf`
- export options
- optional text-to-path export flag

Output:

- output file path
- export metadata

### `list_history`

List document snapshots.

Inputs:

- document id

Output:

- snapshot metadata

### `rollback_document`

Restore a previous snapshot.

Inputs:

- document id
- snapshot id

Output:

- rollback result
- snapshot path created before rollback

### `archive_document`

Archive a document without physically deleting it.

Inputs:

- document id

Output:

- archive result
- archived document path

### Phase 2 Tool Surface

These tools are explicitly not part of Phase 1:

- `import_font`
- `run_action` with a stronger allowlist
- `path_union`
- `path_difference`
- `path_intersection`
- `path_exclusion`
- `path_combine`
- `path_break_apart`
- `path_simplify`

`run_action` must never become arbitrary shell execution. It should only allow known-safe Inkscape actions.

## Workspace Layout

```text
inksmcp/
  package.json
  src/
    server.ts
    tools/
      document.ts
      elements.ts
      preview.ts
      inkscape-actions.ts
      export.ts
    core/
      svg-document.ts
      svg-ops.ts
      validation.ts
      ids.ts
    adapters/
      inkscape-cli.ts
      workspace.ts
  workspace/
    fonts/
    drawings/
      {docId}/
        current.svg
        preview.png
        operations.log
        history/
    archive/
  tests/
    svg-ops.test.ts
    inkscape-cli.integration.test.ts
```

## Real-Time Strategy

### Level 1: Stable Preview Loop

The AI calls MCP tools. The server modifies `current.svg`, runs Inkscape export to create `preview.png`, and returns the preview.

This is the MVP path because it is deterministic and easy to test.

### Level 2: Visible Inkscape Loop

The server opens the SVG in Inkscape when requested.

This is useful for the user but should not be required for the core loop. Automatic window refresh, active-window synchronization, and focus management are out of scope for the MVP.

### Level 3: Persistent Inkscape Shell

The server keeps an `inkscape --shell` process alive and sends actions through it.

This should be added only after the file-based loop works, because process lifetime and recovery add complexity.

## Safety Boundaries

1. Restrict all document read/write paths to the project workspace.
2. Validate every tool input with schemas.
3. Generate stable ids for every created element.
4. Allow raw SVG only after XML parsing and safety filtering.
5. Deny SVG scripts, `foreignObject`, event attributes, remote references, unsafe local file references, and uncontrolled asset references.
6. Maintain full-file history snapshots before every write operation.
7. Add timeouts around every Inkscape process call.
8. Cap tool-provided timeout values with `INKSMCP_MAX_TIMEOUT_MS`.
9. Keep `run_action` behind an allowlist when it is introduced.
10. Return explicit errors instead of silently repairing ambiguous input.
11. Do not apply default SVG, fragment, history, or preview size limits in the MVP.

## Failure Semantics

- XML parse failures do not replace `current.svg`.
- Safety filter failures do not replace `current.svg`.
- File write failures do not replace `current.svg`.
- Atomic batch failures do not replace `current.svg`.
- Inkscape render/export failures after a valid save keep the SVG and return a warning.
- All write operations, including rollback and full document replacement, create a snapshot before changing `current.svg`.
- Lightweight operation logs record timestamp, `docId`, tool name, input summary, snapshot path, result status, and preview path when available.
- Logs should not duplicate full raw SVG or large preview payloads; history snapshots hold the complete SVG content.

## Implementation Phases

### Phase 1: Confirmed MVP

Deliver:

- local single-user MCP server over stdio
- workspace-managed documents under `./workspace` or `INKSMCP_WORKSPACE`
- safe `docId` plus independent `title`
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
- safety filtering for raw SVG
- full-file snapshots before writes
- lightweight operation logs
- Inkscape binary discovery
- Inkscape timeout handling
- clear errors for Inkscape-dependent tools when Inkscape is unavailable

Verification:

- create an SVG with basic elements, group, text, and raw SVG content
- update and delete objects by explicit id
- apply an atomic batch edit and confirm partial failures do not land
- replace a full document only when it has an explicit canvas size
- reject dangerous SVG content
- render PNG preview and return path metadata usable from Codex CLI
- export SVG, PNG, and PDF
- open the SVG in Inkscape as an optional user workflow
- list history and roll back to a prior snapshot
- run minimum automated tests for SVG operations and Inkscape CLI integration

Out of scope:

- MCP resources
- MCP prompts
- HTTP or Streamable HTTP transport
- automatic Inkscape GUI synchronization
- full Inkscape layer semantics
- object lock or hidden-state management
- external image import
- network assets or remote references
- `import_font`
- path geometry
- image understanding or aesthetic analysis
- physical document deletion

### Phase 2: Geometry, Fonts, And Resources

Deliver:

- `import_font` for local or workspace font files
- path geometry tools executed by Inkscape:
  - `path_union`
  - `path_difference`
  - `path_intersection`
  - `path_exclusion`
  - `path_combine`
  - `path_break_apart`
  - `path_simplify`
- optional `resultId` handling for path geometry
- stable id recovery after Inkscape geometry operations
- `autoConvertToPath`, defaulting to `true`
- warnings when text is converted to path
- optional MCP resources for SVG and PNG artifacts
- stronger allowlisted `run_action`

Verification:

- import a local font without network access
- export text-to-path output for visual consistency
- run path boolean operations on existing element ids
- confirm difference/subtract uses explicit `baseId` and `cutterIds`
- confirm geometry results return stable ids
- confirm geometry failures can be recovered through history rollback
- expose document artifacts as resources only if resources are added

### Phase 3: Inkscape GUI And Persistent Process Enhancements

Deliver:

- best-effort active-window action support that avoids unstable `file-rebase` by default
- direct active-window attribute sync for existing-object attribute updates through `object-set-attribute`
- optional Inkscape companion extension that pulls the workspace SVG into the current window without launching another GUI window, and can be triggered automatically by MCP write tools
- optional persistent `inkscape --shell` process
- improved process recovery and health checks

Verification:

- open a document in Inkscape
- change SVG through MCP
- confirm existing-object attribute changes become visible in the already-open Inkscape window without a reload or extra window
- confirm the user can refresh or see structural changes through the GUI workflow, preferably through the companion extension instead of unstable `file-rebase`
- confirm persistent process failures recover cleanly

### Phase 4: Higher-Level Drawing Features

Deliver as needed:

- layers
- templates
- palette helpers
- symbols
- richer layout helpers
- reusable drawing recipes

Verification:

- complete realistic vector tasks such as icons, logos, flowcharts, and poster drafts

## MVP Success Criteria

The first useful version is complete when:

1. An AI can create a new SVG document.
2. An AI can add, update, delete, and batch-edit basic vector elements.
3. An AI can insert raw SVG fragments and replace a full SVG document under the confirmed safety rules.
4. Each operation can produce a PNG preview path usable from Codex CLI.
5. The user can open the result in Inkscape.
6. The server can export SVG, PNG, and PDF.
7. File access is confined to the configured workspace.
8. Every write operation creates a recoverable snapshot.
9. Rollback restores a previous snapshot and snapshots the pre-rollback state.
10. Inkscape-dependent tools fail explicitly when Inkscape is unavailable.
11. Inkscape CLI integration is covered by at least one integration test.

## Open Decisions

These decisions can wait until after Phase 1 is implemented:

- Whether persistent `inkscape --shell` is needed for acceptable latency.
- Whether a custom Inkscape extension is worth adding.
- Whether Python `inkex` should be used internally, or whether TypeScript XML manipulation is enough.
- Whether direct manipulation of user-opened Inkscape documents is worth supporting beyond best-effort GUI opening.
- Whether the MCP server should later support Streamable HTTP in addition to stdio.
- Whether Phase 2 MCP resources are useful in Codex CLI or should wait for another host.
- Whether history needs pruning once large real documents appear.

## References

- MCP tools concept: https://modelcontextprotocol.io/docs/concepts/tools
- MCP transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP TypeScript SDK: https://ts.sdk.modelcontextprotocol.io/
- Inkscape command line interface: https://gitlab.com/inkscape/inkscape/-/raw/master/man/inkscape.pod.in
- Inkscape extension documentation: https://inkscape.gitlab.io/extensions/documentation/
