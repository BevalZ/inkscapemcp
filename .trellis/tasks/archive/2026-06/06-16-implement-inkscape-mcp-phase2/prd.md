# Implement Inkscape MCP Phase 2

## Goal

Complete the Phase 2 scope from `docs/inkscape-mcp-plan.md`: local font import, Inkscape-backed path geometry tools, MCP artifact resources, and a narrowly allowlisted Inkscape action tool.

The server must remain a local, single-user stdio MCP server. SVG files remain the source of truth, and Inkscape is an adapter for geometry/action/export behavior.

## Requirements

- Preserve all Phase 1 tools and behavior.
- Add `import_font` for local or workspace font files:
  - source path must be local and path-safe.
  - source must be copied into `workspace/fonts/`.
  - no remote font download.
  - no font embedding promise.
  - output returns workspace font path metadata.
- Add explicit path geometry tools executed by Inkscape:
  - `path_union`
  - `path_difference`
  - `path_intersection`
  - `path_exclusion`
  - `path_combine`
  - `path_break_apart`
  - `path_simplify`
- Geometry tools must:
  - operate on existing element ids in one current document.
  - require explicit ids; no hidden global selection state.
  - snapshot before changing `current.svg`.
  - use Inkscape-native replacement semantics.
  - support `autoConvertToPath`, defaulting to `true`.
  - warn when text is converted to path.
  - support optional `resultId`; conflict is an error.
  - return stable result ids, assigning/repairing ids after Inkscape processing when needed.
  - keep input copies only when the caller explicitly duplicates before geometry; no implicit copy retention.
  - make `path_difference` use explicit `baseId` and `cutterIds`.
- Add allowlisted `run_action`:
  - no arbitrary Inkscape action execution.
  - only expose a small safe allowlist required for local document processing.
  - must operate on current workspace document and save the result back through the same snapshot/write pipeline.
- Add optional MCP resources for current SVG and PNG preview artifacts:
  - resource listing should expose workspace document artifacts.
  - resource reads must remain workspace-confined.
  - no prompts, no HTTP transport.
- Extend Inkscape adapter:
  - execute selected-object actions against a temporary SVG file.
  - preserve timeout handling and explicit unavailable errors.
  - parse/write failures do not replace `current.svg`.
  - Inkscape failures do not replace `current.svg`.
- Extend docs and tests.

## Acceptance Criteria

- [x] `npm run typecheck` passes.
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [x] MCP stdio smoke lists Phase 1 plus Phase 2 tools.
- [x] `import_font` copies a local font into `workspace/fonts/` and rejects remote paths.
- [x] Geometry tools reject missing ids and `resultId` conflicts before writing.
- [x] Geometry tools create history snapshots before successful writes.
- [x] Geometry tools return stable result ids.
- [x] `path_difference` requires `baseId` and `cutterIds`.
- [x] Inkscape-dependent geometry/action tools fail with `INKSCAPE_UNAVAILABLE` when Inkscape is unavailable.
- [x] When Inkscape is available, at least one geometry integration test produces a changed SVG and stable result id.
- [x] MCP resources list/read current SVG and preview PNG artifacts without path escape.
- [x] README documents Phase 2 tools and configuration.

## Out Of Scope

- HTTP or Streamable HTTP transport.
- MCP prompts.
- Persistent `inkscape --shell`.
- Automatic GUI synchronization.
- Font download, embedding, or cross-machine visual consistency guarantee.
- External image import.
- Arbitrary Inkscape actions.
- Cross-document geometry operations.
- Custom geometry engine.

## Technical Approach

- Keep MCP registration thin in `src/server.ts`.
- Add `src/tools/fonts.ts`, `src/tools/geometry.ts`, and `src/tools/resources.ts` or equivalent small modules.
- Keep Inkscape process behavior in `src/adapters/inkscape-cli.ts`.
- Keep SVG id inspection/repair in `src/core/`.
- Reuse `Workspace.writeSvgWithSnapshot` for every document-changing operation.
- Use temporary workspace files for Inkscape geometry/action operations, then parse/safety-check before replacing `current.svg`.

## Verification Evidence

- `npm run typecheck` passed.
- `npm test` passed: 8 files, 21 tests.
- `npm run build` passed.
- MCP stdio smoke passed:
  - `toolCount: 23`
  - `import_font` present
  - `path_union` present
  - created `resource-smoke`
  - listed/read `inksmcp://documents/resource-smoke/current.svg`
- Inkscape geometry integration passed locally when Inkscape was available.
