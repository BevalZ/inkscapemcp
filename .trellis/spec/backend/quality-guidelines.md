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

## Code Review Checklist

- Does every tool have a Zod input schema?
- Does every write path snapshot first?
- Does every path resolve inside the workspace?
- Are Inkscape calls routed through `adapters/inkscape-cli.ts`?
- Do timeout values respect `INKSMCP_MAX_TIMEOUT_MS`?
- Are raw SVG and XML errors reported before replacing `current.svg`?
- Are operation logs summaries, not payload dumps?

## Common Mistakes

- Building the full MCP server before the SVG edit/preview loop is testable.
- Treating Inkscape GUI state as the source of truth.
- Adding abstractions for future transports before stdio tools work.
- Returning success when preview generation failed without a warning.
