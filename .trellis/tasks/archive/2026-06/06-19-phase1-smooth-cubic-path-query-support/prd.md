# Phase 1 Smooth Cubic Path Query Support

## Goal

Add read-only support for SVG smooth cubic `S/s` path commands so agents can inspect paths created by Inkscape without treating the command as editable before reflection-aware edit semantics are designed.

## Requirements

- Extend raw path query parsing to recognize `S/s` commands.
- Preserve existing structured path segment arrays unchanged for this task.
- Expose raw smooth cubic parameters:
  - `x2`
  - `y2`
  - `x`
  - `y`
- Expose `queryPoints: ["c2", "end"]` for `S/s`.
- Keep `availablePoints: []` for `S/s` in this task so edit selectors do not mutate smooth cubic segments by accident.
- Compute `points` and `absolutePoints` for `c2` and `end`.
- Compute normalized absolute and relative query views for `S/s`.
- Count `S/s` query points in `queryPointCount` and normalized point summaries.
- Keep `editablePointCount` excluding `S/s` points until edit semantics are implemented.
- Keep `edit_path_nodes` and `transform_path_points` rejecting paths that contain `S/s` before snapshot/write.
- Keep read-only query invariants: no snapshots, no metadata writes, no operation logs, no operation-diff artifacts, no GUI refresh.

## Acceptance Criteria

- [ ] `query_path_nodes` returns uppercase and lowercase `S/s` segment summaries with raw parameters and absolute `c2`/`end` points.
- [ ] `query_path_nodes({ normalize: "absolute" })` reports absolute `S/s` `c2` and endpoint coordinates.
- [ ] `query_path_nodes({ normalize: "relative" })` reports segment-base-relative `S/s` `c2` and endpoint coordinates, including for uppercase `S`.
- [ ] `query_document({ includePathNodes: true })` compact and standard/full responses summarize `S/s` paths without unsupported-path warnings.
- [ ] `validate_path_data` accepts syntactically valid `S/s` and reports query/editable point counts consistently.
- [ ] `edit_path_nodes` and `transform_path_points` reject `S/s` paths before snapshot/write.
- [ ] Tool-level tests prove `S/s` queries do not write history or call Inkscape sync/refresh.
- [ ] Typecheck, targeted tests, full test suite, build, extension self-test, and whitespace checks pass.

## Definition of Done

- Tests added or updated for core parser/query behavior, document query summaries, validation output, and mutation guards.
- No new tool is introduced.
- No new dependency or external service is introduced.
- Roadmap memory is updated with the smooth cubic read-only query contract.

## Technical Approach

- Add a `SmoothCubicPathSegment` query-only segment type for `S/s`.
- Keep `EditablePathSegment` unchanged for `S/s`.
- Extend `assertQueryPathCommand`, query segment construction, and `describePathSegments`.
- Use `queryPoints` for read-only inspection and `availablePoints` for edit selectors.
- Keep the future edit extension point explicit: later work may compute reflected `c1` and expose bounded endpoint/`c2` edits only after round-trip tests exist.

## Decision (ADR-lite)

Context: Path reliability is the next Phase 1 frontier after arc endpoint support. `S/s` appears in real Inkscape path data and is currently rejected by query tooling even though it can be inspected safely.

Decision: Add `S/s` as query-recognized but not editable. Do not synthesize an implicit reflected `c1` as an editable point in this task.

Consequences: Agents can inspect smooth cubic paths and plan future edits. Editing remains guarded until reflection-aware mutation semantics are specified.

## Out of Scope

- Editing `S/s` endpoints or control handles.
- Computing and exposing reflected implicit `c1` as an editable point.
- Converting `S/s` to `C/c`.
- Structured segment-array `S/s` support.
- Adding shorthand quadratic `T/t`.
- GUI node-selection integration.

## Technical Notes

- Phase reference: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Memory references:
  - `.trellis/spec/backend/roadmap-memory.md`, Phase 1 loop 42.
  - `.trellis/spec/backend/roadmap-memory.md`, Arc Endpoint Editing Contract.
- Likely modules:
  - `src/core/path-data.ts`
  - `src/core/path-node-summary.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `tests/query-document.test.ts`
  - `tests/path-validation.test.ts`
