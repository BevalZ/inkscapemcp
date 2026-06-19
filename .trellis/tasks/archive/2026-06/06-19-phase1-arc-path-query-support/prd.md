# Phase 1 Arc Path Query Support

## Goal

Add read-only SVG arc (`A`/`a`) path segment query support so agents can inspect arc geometry as part of precision path workflows, while keeping arc editing guarded until a later task implements safe endpoint/radius/flag mutation semantics.

## Requirements

- Recognize `A` and `a` path commands in the path query parser.
- Return arc segment details from `query_path_nodes` and from `query_document({ includePathNodes: true })`.
- Preserve the existing raw query behavior for supported editable commands.
- Include arc endpoint coordinates and arc parameters in standard/full query responses:
  - `rx`
  - `ry`
  - `xAxisRotation`
  - `largeArcFlag`
  - `sweepFlag`
  - `x`
  - `y`
- Support normalized `absolute` and `relative` read-only query views for arc endpoints.
- Keep arc segments non-editable for now:
  - `edit_path_nodes` must continue rejecting arc-containing paths.
  - `transform_path_points` must continue rejecting arc-containing paths.
- Keep malformed arc validation actionable, including missing parameters and invalid arc flags.
- Preserve read-only query invariants: no snapshots, no metadata writes, no operation logs, no operation-diff artifacts, and no Inkscape refresh.

## Acceptance Criteria

- [ ] `query_path_nodes` reports uppercase and lowercase arc segments with endpoint and parameter details.
- [ ] `query_path_nodes({ normalize: "absolute" })` reports absolute arc endpoints without mutating the source path.
- [ ] `query_path_nodes({ normalize: "relative" })` reports segment-base-relative arc endpoints without mutating the source path.
- [ ] `query_document({ includePathNodes: true })` includes arc summaries and normalized arc details when requested.
- [ ] Editing and point-transform tools reject arc-containing paths with an `INVALID_INPUT` error that explains arc commands are recognized for query but not editable.
- [ ] Unit tests cover uppercase arc, relative arc, document-wide path-node query, malformed arc input, and continued edit rejection.
- [ ] Typecheck, test suite, build, extension self-test, and whitespace checks pass.

## Definition of Done

- Tests added or updated for query, validation, and editing guard behavior.
- No new write path is introduced.
- No new dependency or external service is introduced.
- Existing query response modes remain token-conscious.
- Relevant roadmap memory is updated if this establishes a durable contract.

## Technical Approach

Extend the current path-data parser in a narrow way:

- Split path parsing into query-capable segment parsing and editable-command validation where needed.
- Treat `A/a` as query-recognized but not part of the editable point set.
- Add arc endpoint coordinates to segment summaries and normalized path-node views.
- Preserve the existing editable command guard for mutation tools.

## Decision (ADR-lite)

Context: Phase 1 Workstream 6 calls for arc support only after robust parsing and round-trip tests. Query support is a lower-risk step than mutation support because it helps agents understand geometry before editing it.

Decision: Add read-only arc parsing and reporting now, but keep edit and transform paths guarded.

Consequences: Agents can inspect arc-heavy SVGs without whole-query failure. Arc mutation remains a future task that can reuse the parser additions and add explicit tests for endpoint, radius, rotation, and flag editing.

## Out of Scope

- Editing arc endpoints, radii, rotation, or flags.
- Converting arcs to cubic curves.
- Rendering-accurate arc center/radius normalization.
- Expanding support for `S`, `T`, or other currently unsupported commands.
- Changing automatic refresh or GUI sync behavior.

## Technical Notes

- Phase reference: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Memory reference: `.trellis/spec/backend/roadmap-memory.md`.
- Likely modules:
  - `src/core/path-data.ts`
  - `src/core/path-node-summary.ts`
  - `src/core/svg-ops.ts`
  - `src/core/validation.ts`
  - `src/tools/elements.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`

