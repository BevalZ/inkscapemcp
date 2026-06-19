# Phase 1 Smooth Quadratic Path Query Support

## Goal

Extend the Phase 1 path inspection surface so SVG path data with smooth quadratic `T/t` commands can be queried and validated without making those commands editable yet. This continues the incremental path reliability work after smooth cubic `S/s` support and preserves room for a later reflection-aware edit contract.

## Requirements

- Recognize uppercase and lowercase smooth quadratic `T/t` commands in read-only path parsing.
- Expose raw segment data for `T/t` as `{ cmd, x, y }`.
- Expose query-only endpoint data through `queryPoints: ["end"]`, `points.end`, and `absolutePoints.end`.
- Include `T/t` endpoint coordinates in normalized absolute and relative query views.
- Keep `availablePoints: []` for `T/t` so edit selectors cannot mutate them before shorthand quadratic edit semantics are explicitly designed.
- Ensure `query_path_nodes`, `query_document({ includePathNodes: true })`, and `validate_path_data` accept valid `T/t` path data.
- Ensure `edit_path_nodes` and `transform_path_points` continue to reject paths containing `T/t` before snapshot, write, operation log, operation diff, or GUI refresh.
- Preserve existing behavior for all supported editable path commands and for read-only `S/s` support.

## Acceptance Criteria

- [ ] Core path-node tests cover uppercase and lowercase `T/t` raw segments, endpoint query points, absolute endpoints, and empty `availablePoints`.
- [ ] Normalized path-node tests cover absolute and relative endpoint views for `T/t`.
- [ ] Document-query tests cover compact and standard/full path summaries containing `T/t` without unsupported-path warnings.
- [ ] Validation tests prove valid `T/t` syntax succeeds and malformed parameter sets fail with the existing path validation error shape.
- [ ] Mutation guard tests prove `edit_path_nodes` and `transform_path_points` reject `T/t` paths before write-side effects.
- [ ] Typecheck, unit tests, full test suite, build, and extension self-test pass.

## Definition Of Done

- The implementation remains read-only for `T/t`.
- Query tools remain side-effect free: no snapshots, metadata writes, operation logs, operation-diff artifacts, or GUI refresh.
- Write tools continue to snapshot only after all validation succeeds.
- Roadmap memory records the new contract.
- Work is committed, archived, journaled, and pushed after verification.

## Technical Approach

Add a `SmoothQuadraticPathSegment` branch beside the existing segment families in `src/core/path-data.ts`. It should follow the smooth cubic `S/s` read-only pattern: parse command parameters, expose query points and normalized views, but keep editable points empty. Tests should mirror the recently completed smooth cubic query task while using the narrower smooth quadratic endpoint shape.

## Decision (ADR-lite)

**Context**: `T/t` commands have implicit reflected quadratic control points. Editing endpoints or exposing reflected controls without a dedicated contract could surprise users or require silent command conversion.

**Decision**: Support `T/t` for read-only query and validation only in this task. Do not expose reflected control points and do not make endpoints editable yet.

**Consequences**: Agents can inspect and validate paths containing smooth quadratic commands, improving planning and document understanding. Later tasks can add reflection-aware editing or explicit conversion rules without being constrained by accidental behavior shipped here.

## Out Of Scope

- Editing `T/t` endpoints or implicit reflected control points.
- Converting `T/t` into `Q/q`.
- Structured segment-array input for `T/t`.
- GUI node-selection integration.
- Renderer-accurate reflected-control visualization.

## Technical Notes

- Relevant roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Persistent memory: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant specs: `.trellis/spec/backend/index.md`, `.trellis/spec/backend/quality-guidelines.md`, `.trellis/spec/backend/error-handling.md`, `.trellis/spec/backend/database-guidelines.md`, `.trellis/spec/backend/logging-guidelines.md`.
- Expected code areas: `src/core/path-data.ts`, path-related tool tests, document-query tests, and validation tests.
