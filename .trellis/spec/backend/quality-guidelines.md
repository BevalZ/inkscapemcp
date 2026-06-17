# Quality Guidelines

> Backend quality standards for the Inkscape MCP server.

## Overview

Implementation should stay small, deterministic, and testable. The project is a local single-user stdio MCP server, so reliability comes from strict schemas, workspace confinement, snapshots, and explicit Inkscape adapter behavior.

## Required Patterns

- Use TypeScript for runtime code.
- Use `@modelcontextprotocol/sdk` for MCP server plumbing.
- Use Zod schemas for every tool input.
- Keep SVG document mutation in `core/`, not in tool registration callbacks.
- Keep filesystem and Inkscape process logic in adapters.
- Snapshot before every write operation.
- Serialize writes per `docId`.
- Return stable element ids after create, raw insert, full replacement, and future geometry operations.
- Treat Codex CLI preview validation as path-based; inline image display is optional.

## Forbidden Patterns

- No arbitrary shell execution.
- No arbitrary Inkscape action execution.
- No workspace path bypasses.
- No network asset download in the MVP.
- No hidden global selection state for edit tools.
- No physical document deletion in the MVP.
- No database introduction without a new PRD.
- No frontend or HTTP server as part of the Phase 1 stdio MCP scope.

## Testing Requirements

Minimum MVP tests:

- Unit tests for safe `docId` validation.
- Unit tests for workspace path confinement.
- Unit tests for raw SVG safety filtering.
- Unit tests for id conflict handling.
- Unit tests for atomic batch failure behavior.
- Integration test for Inkscape CLI discovery when Inkscape is available.
- Integration test for PNG preview export when Inkscape is available.
- A skip path for Inkscape integration tests when the binary is unavailable.

Example test shape:

```typescript
it("rejects script tags in raw SVG fragments", () => {
  expect(() => validateSvgFragment("<script>alert(1)</script>")).toThrow("UNSAFE_SVG");
});
```

## Scenario: Phase 1 MCP Runtime Contract

### 1. Scope / Trigger

- Trigger: the Phase 1 stdio MCP server is implemented as the runtime entry point.
- Scope: TypeScript runtime under `src/`, built to `dist/server.js`.
- Out of scope: HTTP transports, MCP resources, MCP prompts, frontend UI, and database persistence.

### 2. Signatures

- Build command: `npm run build` -> emits `dist/server.js`.
- Type check command: `npm run typecheck`.
- Test command: `npm test`.
- Runtime command: `node dist/server.js`.
- MCP tools:
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

### 3. Contracts

- Workspace env:
  - `INKSMCP_WORKSPACE`: optional workspace root, default `./workspace`.
  - `INKSCAPE_BIN`: optional explicit Inkscape binary.
  - `INKSMCP_INKSCAPE_TIMEOUT_MS`: optional default timeout, default `30000`.
  - `INKSMCP_MAX_TIMEOUT_MS`: optional maximum timeout, default `120000`.
- Workspace paths:
  - `workspace/drawings/{docId}/current.svg`
  - `workspace/drawings/{docId}/metadata.json`
  - `workspace/drawings/{docId}/history/`
  - `workspace/drawings/{docId}/operations.log`
  - `workspace/archive/`
- Tool response shape:
  - Success: `{ "ok": true, ...metadata }`.
  - Failure: `{ "ok": false, "error": { "code": "...", "message": "...", "details": {} } }`.
  - `render_preview` returns JSON path metadata plus optional MCP `image` content.

### 4. Validation & Error Matrix

- Unsafe `docId` -> `INVALID_INPUT`.
- Path escape from workspace -> `PATH_OUTSIDE_WORKSPACE`.
- Missing document -> `DOC_NOT_FOUND`.
- Raw SVG `<script>`, `<foreignObject>`, event handlers, remote refs, `file:`, or `data:` -> `UNSAFE_SVG`.
- Fragment `<svg>` root -> `INVALID_INPUT`.
- Fragment id conflict without `renameConflictingIds` -> `ID_CONFLICT`.
- Full document replacement without `<svg>` root or explicit canvas size -> `INVALID_INPUT`.
- Missing Inkscape binary -> `INKSCAPE_UNAVAILABLE`.
- Inkscape timeout -> `INKSCAPE_TIMEOUT`.
- Inkscape non-zero exit -> `INKSCAPE_FAILED`.

### 5. Good/Base/Bad Cases

- Good: `create_document` with safe `docId`, explicit canvas size, then `render_preview` produces a PNG path under the document directory.
- Base: Inkscape is unavailable; server still starts, and Inkscape-dependent tools return `INKSCAPE_UNAVAILABLE`.
- Bad: raw fragment includes `onclick` or `href="https://..."`; do not write `current.svg`.

### 6. Tests Required

- Safe `docId`: accepts safe ids and rejects traversal or spaces.
- Workspace confinement: `resolveWithinWorkspace("..", ...)` rejects.
- Raw SVG safety: rejects scripts, event handlers, remote refs, and invalid full document canvas.
- Id conflict: default reject; `renameConflictingIds` renames and updates inserted ids.
- Atomic batch: failed batch leaves `current.svg` byte-identical.
- Inkscape: discovery path or explicit unavailable error; PNG preview file exists when binary is available.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not rely on deprecated xmldom parser options.
new DOMParser({ errorHandler: { error: () => {} } });
```

#### Correct

```typescript
new DOMParser({
  onError: (level, message) => {
    if (level !== "warning") throw new Error(message);
  },
});
```

Do not set `tsconfig.json` `rootDir` to `.` for runtime builds in this project. It emits `dist/src/server.js` and breaks the package `bin` contract. Runtime builds should use `rootDir: "src"` so `node dist/server.js` is the stable MCP entry point.

## Scenario: Phase 2 Geometry, Fonts, And Resources Contract

### 1. Scope / Trigger

- Trigger: Phase 2 adds new MCP tools, Inkscape action execution, workspace font imports, and MCP resources.
- Scope: local stdio MCP only; SVG remains the source of truth.
- Out of scope: HTTP, prompts, persistent Inkscape shell, remote downloads, font embedding, arbitrary actions, and cross-document operations.

### 2. Signatures

- New tools:
  - `import_font({ sourcePath, filename? })`
  - `path_union({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_difference({ docId, baseId, cutterIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_intersection({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_exclusion({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_combine({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_break_apart({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `path_simplify({ docId, elementIds, resultId?, autoConvertToPath?, timeoutMs? })`
  - `run_action({ docId, action, elementIds, resultId?, timeoutMs? })`
- New resources:
  - `inksmcp://documents/{docId}/current.svg`
  - `inksmcp://documents/{docId}/preview.png`

### 3. Contracts

- `import_font` copies local `.ttf`, `.otf`, `.woff`, or `.woff2` files into `workspace/fonts/`.
- `import_font` returns `fontPath`, byte count, and a warning that fonts are not embedded.
- Geometry tools execute Inkscape against workspace temporary files and only replace `current.svg` after the exported SVG parses and passes safety validation.
- Geometry tools must select explicit element ids through action strings such as `select-by-id:id1,id2`; they must not depend on GUI selection state.
- `autoConvertToPath` defaults to `true`.
- Text conversion returns a `TEXT_CONVERTED_TO_PATH` warning.
- `resultId` must not conflict with unrelated existing ids.
- `run_action` is allowlisted. Current allowed actions are `object_to_path`, `selection_group`, `selection_ungroup`, and `path_simplify`.

### 4. Validation & Error Matrix

- Remote, URI, or UNC font source -> `INVALID_INPUT`.
- Unsupported font extension -> `INVALID_INPUT`.
- Missing selected geometry id -> `INVALID_INPUT`.
- `resultId` conflicts with an unrelated existing id -> `ID_CONFLICT`.
- Missing Inkscape binary -> `INKSCAPE_UNAVAILABLE`.
- Inkscape timeout -> `INKSCAPE_TIMEOUT`.
- Inkscape geometry/action failure -> `INKSCAPE_FAILED`.
- Unsupported resource URI -> resource read error; never resolve arbitrary filesystem paths.

### 5. Good/Base/Bad Cases

- Good: `path_union` on two existing rectangles with `resultId: "merged"` returns `resultIds: ["merged"]` and a history snapshot.
- Base: Inkscape is unavailable; the server still starts and Phase 2 Inkscape-dependent tools return `INKSCAPE_UNAVAILABLE`.
- Bad: `run_action` receives an action outside the enum; reject through Zod/tool validation rather than forwarding to Inkscape.

### 6. Tests Required

- Font import copies a local file and rejects remote/URI/UNC sources.
- Geometry helpers reject missing ids and `resultId` conflicts.
- Geometry finalization ignores Inkscape metadata nodes such as `defs` and `sodipodi:namedview`.
- Inkscape integration runs at least one path geometry operation when the binary is available.
- Resource tests list/read current SVG and preview PNG resources.
- MCP stdio smoke verifies the Phase 2 tool count and resource read behavior.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Arbitrary action forwarding is forbidden.
await inkscape.runActionsToSvg(svgPath, { actions: [userInput], outputPath });
```

#### Correct

```typescript
const allowedActionMap = {
  object_to_path: "object-to-path",
  selection_group: "selection-group",
  selection_ungroup: "selection-ungroup",
  path_simplify: "path-simplify",
} as const;
```

Only values from the allowlist may reach Inkscape. Geometry-specific tools should call fixed Inkscape actions such as `path-union` and `path-difference` rather than accepting action strings from callers.

## Scenario: In-Place Edit Contract

### 1. Scope / Trigger

- Trigger: adding or changing MCP tools that modify an existing SVG document.
- Scope: local stdio MCP tools that write `workspace/drawings/{docId}/current.svg`.
- Out of scope: semantic image understanding and GUI mouse/keyboard automation.

### 2. Signatures

- Normal edit tools:
  - `update_element({ docId, elementId, setAttributes?, removeAttributes?, text? })`
  - `apply_svg_operations({ docId, operations })`
  - `draw_path({ docId, parentId?, elementId?, attributes?, d? | segments? })`
  - `replace_path_data({ docId, elementId, d? | segments? })`
  - `append_path_segment({ docId, elementId, d? | segments? })`
  - `edit_path_nodes({ docId, elementId, edits })`
  - `query_path_nodes({ docId, elementId })`
  - `insert_svg_fragment({ docId, parentId?, fragment, renameConflictingIds? })`
  - `replace_attribute_values({ docId, replacements, scopeElementIds? })`
- Full redraw tool:
  - `replace_document_svg({ docId, svg, confirmFullDocumentReplacement })`
- GUI refresh tool:
  - `refresh_in_inkscape({ docId, allowUnstableRebase?, useCompanionExtension?, timeoutMs? })`

### 3. Contracts

- Normal modification requests must preserve the existing SVG object tree unless the user explicitly asks for a full redraw.
- `replace_attribute_values` replaces exact values on existing attributes/style declarations and returns:
  - `editMode: "in_place"`
  - `changedElementIds`
  - `changedElementCount`
  - `changedAttributeCount`
  - `replacementCount`
- `replace_document_svg` is a destructive full-redraw path and must reject calls unless `confirmFullDocumentReplacement: true`.
- Confirmed `replace_document_svg` responses must include `editMode: "full_document_replacement"` and a `FULL_DOCUMENT_REPLACEMENT` warning.
- `refresh_in_inkscape` is best-effort only; `current.svg` remains authoritative.
- Path data tools accept either raw SVG `d` strings or structured segment arrays. Structured segment arrays currently support `M`, `L`, `C`, `Q`, and `Z`. Raw path data must be validated for command/parameter shape before save.
- `edit_path_nodes` applies compact edits to an existing path's `d` attribute. It may move endpoints/control points, insert structured `M`/`L`/`C`/`Q`/`Z` segments, or delete segments. It should reject path data that cannot be safely round-tripped through the supported command set, such as arcs or shorthand curves.
- `query_path_nodes` is read-only. It returns segment indexes, command names, raw point values, absolute point positions, and available point names for the same supported command set used by `edit_path_nodes`. It must not create snapshots, write operation logs, or trigger Inkscape refresh.
- Automatic refresh for existing-object attribute updates should prefer direct active-window attribute sync with Inkscape actions of the form `select-by-id:<id>;object-set-attribute:<name>,<value>`. This applies to `update_element`, `replace_path_data`, `append_path_segment`, `edit_path_nodes`, attribute-only `apply_svg_operations`, and direct attribute changes reported by `replace_attribute_values`.
- Direct active-window attribute sync must only represent attribute setting on existing ids. It must not be used for add/delete/insert operations, text content changes, attribute removal, full-document replacement, or style declaration edits that cannot be mapped back to a single `object-set-attribute` call.
- Structural automatic GUI refresh should invoke the companion extension after a successful save by default, including on Windows. The extension pulls the workspace SVG into the current window without opening another GUI window. If refresh fails or times out, return a warning and keep `current.svg` authoritative.
- `refresh_in_inkscape` should trigger the installed companion extension action `dev.hydens.inksmcp.pull-workspace-document.noprefs` by default.
- `refresh_in_inkscape` must not run Inkscape active-window `file-rebase` by default. On Windows with Inkscape 1.4.x, that action can crash inside `SPDocument::rebase`. Only run it when `allowUnstableRebase: true`.
- MCP write tools may attempt automatic same-window refresh after a successful save when the server context enables auto-refresh. Failures must be returned as warnings and must not roll back the SVG write.

### 4. Validation & Error Matrix

- `replace_document_svg` without `confirmFullDocumentReplacement: true` -> `INVALID_INPUT`.
- `replace_attribute_values` with an empty replacement list -> Zod validation failure.
- `replace_attribute_values` trying to target `id` -> Zod validation failure.
- `replace_path_data` or `append_path_segment` on a non-path element -> `INVALID_INPUT`.
- `edit_path_nodes` on a non-path element, missing `d`, out-of-range segment index, unsupported point, or unsupported path command -> `INVALID_INPUT`.
- `query_path_nodes` on a non-path element, missing `d`, or unsupported path command -> `INVALID_INPUT`.
- `draw_path` with both `d` and `segments`, or neither -> Zod/tool validation failure.
- `refresh_in_inkscape` with default input -> best-effort companion extension active-window action; do not mutate SVG.
- Companion extension action unavailable in the active window -> `INKSCAPE_FAILED` warning/error with guidance to restart Inkscape after installing the extension.
- `refresh_in_inkscape` with `allowUnstableRebase: true` and no compatible active Inkscape window -> Inkscape adapter error; do not mutate SVG.

### 5. Good/Base/Bad Cases

- Good: user asks to make a drawing yellow; call `replace_attribute_values` or `update_element`, preserving ids and geometry.
- Good: user asks to add fin/detail strokes; call `draw_path` or `append_path_segment`, preserving the existing document.
- Good: user asks for precise path tweaks; call `query_path_nodes` first to discover segment indexes and editable points, then call `edit_path_nodes`.
- Good: user asks to move a path node or control handle slightly; call `edit_path_nodes`, preserving the existing path id.
- Base: user explicitly asks to redraw the whole SVG; call `replace_document_svg` with `confirmFullDocumentReplacement: true`.
- Base: user asks to refresh the visible GUI; call `refresh_in_inkscape` and prefer companion extension refresh.
- Bad: user asks to tweak color/position/text and the agent calls `replace_document_svg` with a generated full SVG.
- Bad: agent calls active-window `file-rebase` by default after every edit.

### 6. Tests Required

- Unit test that `replace_attribute_values` updates existing attributes/style while preserving geometry and ids.
- Tool-level test that `replace_document_svg` rejects unconfirmed full replacement and leaves `current.svg` unchanged.
- Tool-level test that confirmed full replacement returns `editMode: "full_document_replacement"` and a warning.
- Tool-level test that `refresh_in_inkscape` does not call unstable active-window rebase by default.
- Tool-level test that attribute-only `update_element` and `apply_svg_operations` use direct active-window attribute sync instead of structural refresh.
- Tool-level test that `replace_path_data` and `append_path_segment` use direct active-window attribute sync for `d`.
- Unit and tool-level tests that `edit_path_nodes` edits supported path segments, rejects unsupported commands, and uses direct active-window attribute sync for `d`.
- Unit and tool-level tests that `query_path_nodes` returns editable segment indexes and does not write or refresh.
- Tool-level test that write tools attach auto-refresh warnings without failing the successful write.
- Packaging test that the Inkscape companion extension declares the expected `.inx` command and passes safe path-resolution self-test.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replaceDocumentSvg({ docId, svg: regeneratedSvg });
```

#### Correct

```typescript
await replaceAttributeValues({
  docId,
  replacements: [{ from: "#ffd5df", to: "#fff4a8" }],
});
```

Use full replacement only after explicit user intent:

```typescript
await replaceDocumentSvg({
  docId,
  svg: regeneratedSvg,
  confirmFullDocumentReplacement: true,
});
```

## Scenario: MCP Hot Reload Proxy Contract

### 1. Scope / Trigger

- Trigger: adding or changing the development hot reload entry point for MCP clients.
- Scope: local stdio MCP only. `dist/hot-server.js` is a stable proxy that keeps the client connection open while restarting an internal `dist/server.js` worker.
- Out of scope: HTTP transports, arbitrary code injection into a running worker, and production-only runtime changes.

### 2. Signatures

- Build command: `npm run build`.
- Hot runtime command: `node dist/hot-server.js`.
- Package bin: `inksmcp-hot`.
- Development script: `npm run start:hot`.
- Environment:
  - `INKSMCP_HOT_WATCH_PATHS`
  - `INKSMCP_HOT_DEBOUNCE_MS`
  - `INKSMCP_HOT_RESTART_GRACE_MS`
  - `INKSMCP_HOT_WORKER_CWD`
  - `INKSMCP_HOT_WORKER_COMMAND`
  - `INKSMCP_HOT_WORKER_ARGS`

### 3. Contracts

- The MCP client connects to the proxy, not directly to the worker, during development.
- The proxy must use newline-delimited JSON-RPC framing compatible with `@modelcontextprotocol/sdk/shared/stdio`.
- On `dist/` changes, the proxy restarts the worker process instead of trying to mutate loaded ES modules.
- After a restart, the proxy must replay the original `initialize` request with an internal id, wait for the worker response, send the saved `notifications/initialized`, then mark the worker ready.
- Client requests received while the worker is not ready must be queued and flushed after initialization.
- If a restart is forced while client requests are in flight, the proxy must return JSON-RPC errors for those request ids instead of leaving the client hanging.
- After successful reload, the proxy sends `notifications/tools/list_changed`, `notifications/resources/list_changed`, and `notifications/prompts/list_changed`.
- The normal `dist/server.js` entrypoint remains the production/simple runtime. Hot reload must not change tool behavior or workspace confinement.
- The hot worker cwd defaults to the package root so default `./workspace` matches the normal runtime. `INKSMCP_HOT_WORKER_CWD` may override it.

### 4. Good/Base/Bad Cases

- Good: MCP host points at `dist/hot-server.js`; after `npm run build`, the same client connection can list newly registered tools.
- Base: a host ignores list-changed notifications; the worker still reloads, but the host may require reconnect to refresh cached tool metadata.
- Bad: the proxy drops the stdio client connection on every rebuild.
- Bad: the proxy changes the workspace root by running the worker from `dist/` by default.
- Bad: hot reload uses arbitrary shell commands from MCP input.

### 5. Tests Required

- Integration-style unit test that starts a temporary worker, lists an initial tool, rewrites the worker, observes `notifications/tools/list_changed`, and lists the updated tool through the same client connection.
- Test workers created outside the project tree must resolve SDK imports from the project root.
- Request timeouts in the test should be short enough to expose proxy/worker handshake failures quickly.

## Scenario: Inkscape Companion Extension Contract

### 1. Scope / Trigger

- Trigger: adding or changing files under `inkscape-extension/` or companion extension installation scripts.
- Scope: optional local Inkscape extension used to pull MCP workspace SVG into the current Inkscape window.
- Out of scope: background services, network listeners, mouse/keyboard automation, and writing Inkscape GUI state back into the MCP workspace.

### 2. Signatures

- Extension files:
  - `inkscape-extension/inksmcp_pull.inx`
  - `inkscape-extension/inksmcp_pull.py`
- Installer:
  - `npm run install:inkscape-extension`
  - optional args: `--workspace`, `--user-data-dir`, `--inkscape-bin`
- Installed config:
  - `<Inkscape user data>/extensions/inksmcp-extension.json`
  - shape: `{ "workspaceRoot": "<absolute path>", "activeDocId"?: "<docId>" }`

### 3. Contracts

- The extension must be pull-based: Inkscape invokes it from the current window and receives the workspace SVG as extension output.
- MCP may invoke the extension automatically through `active-window-start;dev.hydens.inksmcp.pull-workspace-document.noprefs;active-window-end` after a successful workspace write.
- The extension reads only `workspace/drawings/<docId>/current.svg`.
- `docId` validation must match the MCP document id boundary: 1-64 characters, first character alphanumeric, remaining characters letters, numbers, underscores, or hyphens.
- The resolved `current.svg` path must remain inside the configured workspace root.
- Workspace root resolution order is explicit extension UI input, `INKSMCP_WORKSPACE`, then installer-written config.
- If `docId` is empty, the extension may infer it only from a current document path already under `workspace/drawings/<docId>/current.svg`.
- If document-path inference is unavailable during automatic invocation, the extension may read `activeDocId` from the installer config. The MCP adapter must write this field immediately before triggering the active-window action chain.
- The extension must validate that the target file is well-formed XML with an `<svg>` root before handing it back to Inkscape.
- Installed extension actions are loaded into already-open Inkscape windows only after Inkscape restarts. If active-window action lookup fails after installation, report restart guidance.

### 4. Validation & Error Matrix

- Missing workspace root -> extension error with install/config guidance.
- Unsafe `docId` -> extension error; do not read a file.
- Path escape from workspace -> extension error; do not read a file.
- Missing `current.svg` -> extension error.
- Malformed SVG or non-`<svg>` root -> extension error.

### 5. Good/Base/Bad Cases

- Good: MCP edits `workspace/drawings/fish/current.svg` in place and reports whether GUI refresh was attempted, skipped, or failed without rolling back the SVG write.
- Base: user can still run `Extensions > InkSMCP > Pull Workspace Document` manually for diagnosis.
- Base: current document path is not an InkSMCP file; manual extension use requires `docId`, but MCP-triggered refresh should rely on the active document path/config and require no user input when the window was opened from `current.svg`.
- Bad: extension reads an arbitrary path typed by the user or writes GUI changes back into `workspace/drawings/<docId>/current.svg`.

### 6. Tests Required

- `.inx` declares `Extensions > InkSMCP > Pull Workspace Document` and references `inksmcp_pull.py` with the Python interpreter.
- Python script self-test covers safe `docId`, inferred `docId`, workspace confinement, and missing/unsafe paths.
- Installer test copies files to an explicit temporary user data directory and writes the workspace config.

### 7. Wrong vs Correct

#### Wrong

```python
# Do not let the extension read arbitrary paths supplied through the UI.
svg_path = Path(self.options.svg_path)
```

#### Correct

```python
workspace_root = resolve_workspace_root(self.options.workspace_root, config)
current_svg = resolve_current_svg_path(workspace_root, doc_id)
```

The extension must derive `current.svg` from a validated workspace root plus safe `docId`, never from a free-form file path.

## Code Review Checklist

- Does every tool have a Zod input schema?
- Does every write path snapshot first?
- Does every path resolve inside the workspace?
- Are Inkscape calls routed through `adapters/inkscape-cli.ts`?
- Do timeout values respect `INKSMCP_MAX_TIMEOUT_MS`?
- Are raw SVG and XML errors reported before replacing `current.svg`?
- Are operation logs summaries, not payload dumps?
- Do normal edit requests preserve the existing SVG object tree instead of using full-document replacement?

## Common Mistakes

- Building the full MCP server before the SVG edit/preview loop is testable.
- Treating Inkscape GUI state as the source of truth.
- Adding abstractions for future transports before stdio tools work.
- Returning success when preview generation failed without a warning.
