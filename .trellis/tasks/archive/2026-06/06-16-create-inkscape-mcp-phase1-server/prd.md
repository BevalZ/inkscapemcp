# Create Inkscape MCP Phase 1 Server

## Goal

Create the first runnable implementation of `inksmcp`: a local, single-user stdio MCP server that manages workspace SVG documents and uses Inkscape CLI for preview/export/open workflows.

This task starts the MCP plugin/server implementation. It should implement the confirmed Phase 1 boundary from `docs/inkscape-mcp-plan.md`, keeping the scope focused on a reliable SVG file source of truth and Codex CLI validation.

## Requirements

- Scaffold a TypeScript Node.js project.
- Use `@modelcontextprotocol/sdk` for stdio MCP server plumbing.
- Use Zod schemas for all tool inputs.
- Implement workspace-confined document storage:
  - default workspace: `./workspace`
  - override: `INKSMCP_WORKSPACE`
  - document path: `workspace/drawings/{docId}/current.svg`
  - history path: `workspace/drawings/{docId}/history/`
  - operation log: `workspace/drawings/{docId}/operations.log`
  - archive path: `workspace/archive/`
- Implement safe ids:
  - safe `docId`
  - generated element ids
  - independent document `title`
- Implement Phase 1 MCP tools:
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
- Implement raw SVG support:
  - allow raw fragments
  - allow full document replacement
  - reject `<script>`, `<foreignObject>`, event handler attributes, remote URL references, unsafe local file references, and uncontrolled asset references
  - allow multiple top-level fragment elements
  - reject complete `<svg>` roots in fragments
  - reject id conflicts by default
  - support optional `renameConflictingIds`
  - require full document replacements to include `viewBox` or both `width` and `height`
- Implement failure behavior:
  - parse/safety/write failures do not replace `current.svg`
  - atomic batch failures do not replace `current.svg`
  - valid SVG saves remain even when Inkscape render/export fails, returning a warning
  - all write operations snapshot before modifying `current.svg`
  - rollback also snapshots before changing `current.svg`
- Implement Inkscape CLI adapter:
  - binary discovery order: `INKSCAPE_BIN`, project config if present, PATH, Windows/Scoop known paths
  - default timeout: `30000` ms
  - override: `INKSMCP_INKSCAPE_TIMEOUT_MS`
  - cap: `INKSMCP_MAX_TIMEOUT_MS`
  - dependent tools fail explicitly when Inkscape is unavailable
- Implement export/preview:
  - PNG preview file generation
  - SVG/PNG/PDF export
  - optional text-to-path flag for export
  - result metadata must include file paths usable from Codex CLI
- Implement lightweight operation logs with summaries, not full raw SVG or image payloads.
- Add focused automated tests:
  - safe `docId`
  - workspace path confinement
  - raw SVG safety filtering
  - id conflict handling
  - atomic batch failure behavior
  - Inkscape binary discovery or skip path
  - PNG preview export when Inkscape is available
- Update README with build/test/run instructions and a Codex CLI MCP configuration example if the exact command is known from the implementation.

## Acceptance Criteria

- [x] `npm install` succeeds.
- [x] TypeScript compiles.
- [x] Unit tests pass.
- [x] Inkscape integration tests pass when Inkscape is available, or skip clearly when unavailable.
- [x] The MCP server starts over stdio.
- [x] A caller can create a document and get `current.svg`.
- [x] A caller can add, update, delete, batch-edit, insert raw SVG, and replace full SVG under the documented safety rules.
- [x] Every write operation creates a history snapshot.
- [x] `render_preview` creates a PNG and returns usable path metadata.
- [x] `export_document` supports `svg`, `png`, and `pdf`.
- [x] Inkscape-dependent tools return explicit errors when Inkscape is unavailable.
- [x] No tool can write outside the configured workspace.
- [x] README describes how to run and test the server.

## Verification Evidence

- `npm run typecheck` passed.
- `npm test` passed: 5 files, 14 tests.
- `npm run build` passed and emits `dist/server.js`.
- MCP stdio smoke passed with SDK client: 14 tools listed, including `create_document` and `render_preview`.
- Tool-level smoke passed: created `smoke-doc`, added a rectangle, rendered PNG preview, and returned image content plus preview path metadata.

## Definition of Done

- Code implemented under the planned project structure.
- Tests and typecheck run successfully or documented with precise environment blockers.
- Trellis check performed.
- Spec update considered after implementation.

## Out of Scope

- MCP resources.
- MCP prompts.
- HTTP or Streamable HTTP transport.
- Automatic Inkscape GUI synchronization.
- Full Inkscape layer semantics.
- Object lock or hidden-state management.
- External image import.
- Network assets or remote references.
- `import_font`.
- Path geometry tools.
- Image understanding or aesthetic analysis.
- Physical document deletion.
- Database persistence.
- Frontend UI.

## Technical Approach

Use a small TypeScript backend:

- `src/server.ts` registers stdio MCP tools.
- `src/tools/*` maps MCP tools to core operations.
- `src/core/*` owns SVG parsing, mutation, validation, ids, and typed errors.
- `src/adapters/*` owns workspace and Inkscape CLI behavior.
- `src/logging/operation-log.ts` writes per-document JSONL operation logs.

The server should keep SVG files as the source of truth. Inkscape is an external adapter for render/export/open behavior, not the only state container.

## Decision (ADR-lite)

**Context**: The user wants to start creating the Inkscape MCP plugin/server after confirming Phase 1 boundaries.

**Decision**: Implement the Phase 1 stdio MCP server using TypeScript, workspace-managed SVG files, Zod validation, and Inkscape CLI adapter calls.

**Consequences**: The implementation remains local and deterministic. It does not support HTTP, resources, prompts, path geometry, or GUI synchronization until later tasks.

## Technical Notes

- Product plan: `docs/inkscape-mcp-plan.md`.
- Backend specs: `.trellis/spec/backend/`.
- Current repo is not a git repository.
- Local Node version previously observed: `v26.1.0`.
- Local Inkscape CLI previously observed: `D:\Software\Scoop\apps\inkscape\current\bin\inkscape.com`.
