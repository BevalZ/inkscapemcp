# Phase 1 Arc Endpoint Editing

## Goal

Allow safe, bounded endpoint edits for SVG `A/a` arc path segments so agents can make precise arc-position adjustments after querying path nodes, while preserving arc radii, rotation, and flags until a later task implements broader arc geometry editing.

## Requirements

- Treat arc endpoints as editable points only for endpoint movement and exact endpoint placement.
- Keep arc raw parameters intact during endpoint edits:
  - `rx`
  - `ry`
  - `xAxisRotation`
  - `largeArcFlag`
  - `sweepFlag`
- Preserve command case and storage form:
  - Uppercase `A` stores absolute endpoint coordinates.
  - Lowercase `a` stores segment-base-relative endpoint coordinates.
- Extend `edit_path_nodes` to allow `move_point`, `set_point_absolute`, and `set_point_relative` on arc `end` points.
- Extend `transform_path_points` selectors and transforms so they may select and transform arc endpoints.
- Keep arc control point names unavailable:
  - `c1` and `c2` on arcs must reject before snapshot/write.
- Keep structured `draw_path` / `replace_path_data` / `append_path_segment` segment arrays unchanged for this task.
- Keep arc-to-cubic conversion, radius/rotation/flag edits, center parameterization, and shape-preserving arc solving out of scope.
- Preserve existing write invariants: pre-pull active bidirectional GUI state, validate before snapshot where supported, snapshot before write, operation diff/log on success, and direct active-window `d` attribute sync after successful path data writes.

## Acceptance Criteria

- [ ] `edit_path_nodes` can move uppercase and lowercase arc endpoints.
- [ ] `edit_path_nodes` can set arc endpoints by absolute and segment-relative coordinates.
- [ ] `transform_path_points` can translate, set, scale, rotate, reflect, reflect-line, and skew selected arc endpoints through the existing point transform pipeline.
- [ ] Selector types that rely on `availablePoints` can include arc endpoints when `pointTypes` includes `end`.
- [ ] Selecting `c1` or `c2` on an arc rejects with `INVALID_INPUT` before snapshot/write.
- [ ] Query responses still expose `queryPoints` and `availablePoints` consistently for arcs after the edit contract changes.
- [ ] Unit/tool tests prove successful arc endpoint writes snapshot/log/diff/sync, and invalid arc point selections leave workspace/history/GUI untouched.
- [ ] Typecheck, test suite, build, extension self-test, and whitespace checks pass.

## Definition of Done

- Tests added or updated for core parser/edit behavior, tool-level write behavior, and schema/selector behavior where needed.
- No new tool is introduced.
- No new dependency or external service is introduced.
- Roadmap memory is updated with the arc endpoint edit contract.

## Technical Approach

- Promote `A/a` from query-only endpoint exposure to editable endpoint exposure while keeping other arc parameters immutable.
- Reuse the existing `QueryPathSegment` / `EditablePathSegment` split carefully:
  - Add arcs to the editable parser only when raw path data is being parsed for edit operations.
  - Keep type names and summaries clear enough to preserve the `queryPoints` versus `availablePoints` distinction.
- Extend assignment/move logic to support only `end` for `A/a`.
- Reuse existing absolute/relative target mapping so uppercase and lowercase storage behavior stays deterministic.
- Reuse the existing transform pipeline instead of adding arc-specific transform code paths.

## Decision (ADR-lite)

Context: Phase 1 loop 41 made arcs inspectable but intentionally not editable. The next useful precision-editing step is endpoint mutation, because it can be represented by changing only the final `x y` pair while preserving arc parameters.

Decision: Implement arc endpoint editing as a bounded extension of existing point-edit semantics. Do not edit radii, rotation, or flags in this task.

Consequences: Agents can adjust arc endpoints safely. Some visual shape changes may occur because SVG arc rendering depends on endpoint plus fixed parameters; broader arc solving remains a future explicit task.

## Out of Scope

- Editing `rx`, `ry`, `xAxisRotation`, `largeArcFlag`, or `sweepFlag`.
- Arc center/radius solving to preserve visual center or sweep.
- Arc-to-cubic conversion.
- Structured segment-array support for `A/a`.
- New selector types or GUI node-selection integration.
- Changes to automatic refresh policy.

## Technical Notes

- Phase reference: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Memory references:
  - `.trellis/spec/backend/roadmap-memory.md`, Phase 1 loop 41.
  - `.trellis/spec/backend/roadmap-memory.md`, Arc Path Read-Only Query Contract.
- Likely modules:
  - `src/core/path-data.ts`
  - `src/core/svg-ops.ts`
  - `src/core/path-node-summary.ts`
  - `src/core/validation.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `tests/query-document.test.ts`

