# Phase 1 Path H/V Command Support

## Goal

Extend the structured path parser/editing boundary to support SVG horizontal and vertical line commands (`H`, `h`, `V`, `v`) as editable endpoint segments. This improves compatibility with real-world SVG paths while keeping Phase 1 path editing deterministic and avoiding arc/shorthand curve complexity.

## Requirements

- Add `H`, `h`, `V`, and `v` to `EditablePathSegment`.
- Preserve raw command storage form when editing:
  - `H`/`h` stores only the x component.
  - `V`/`v` stores only the y component.
- Describe H/V segments with an editable `end` point.
  - `H`/`h` end y is the segment base y.
  - `V`/`v` end x is the segment base x.
- Support `query_path_nodes` and document-wide path-node summaries for H/V segments.
- Support `edit_path_nodes` moving or setting H/V endpoints where the editable endpoint can still be represented by the original command.
- Support `transform_path_points` transforms on H/V endpoints only when the transformed endpoint remains representable by the same command:
  - H/h transformed y must remain the segment base y.
  - V/v transformed x must remain the segment base x.
- Reject transforms or exact sets that would require converting H/V to L/l before snapshot/write.
- Keep unsupported commands such as A/S/T unsupported.
- Update validation summary wording/docs from `M/L/C/Q/Z` to include H/V where relevant.

## Acceptance Criteria

- [x] Raw path validation and summaries accept H/V commands as supported editable path commands.
- [x] `query_path_nodes` returns H/V segments with end points, absolute points, and normalized absolute/relative views.
- [x] `edit_path_nodes` can move/set representable H/V endpoints and preserves H/V command case.
- [x] `transform_path_points` can translate representable H/V endpoints.
- [x] Non-representable H/V edits reject before snapshot/write and leave current SVG/history/logs/GUI refresh untouched.
- [x] Existing unsupported command tests for arcs/shorthand curves remain valid.
- [x] README and roadmap memory document the expanded command boundary and representability guard.
- [x] Focused tests, typecheck, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

- Tests added/updated for validation, core path parsing/editing, and tool-level no-side-effect rejection.
- TypeScript typecheck and full test suite pass.
- Documentation and Trellis memory updated in English.
- Work is committed, task archived, journaled, and pushed.

## Technical Approach

Model H/V as endpoint-only segments in `path-data.ts`. The parser already recognizes H/V parameter counts, so implementation should expand the editable segment union, serialization, segment description, endpoint assignment, and command validation.

When setting an endpoint on an H/V command, reject non-representable targets instead of silently converting to L/l. Conversion can be added later as an explicit normalization/refactor tool.

## Decision (ADR-lite)

**Context**: Phase 1 path tooling has strong contracts for M/L/C/Q/Z. The roadmap says arc support should wait for robust parsing and round-trip tests. H/V is simpler and common in SVG output.

**Decision**: Add endpoint support for H/V while preserving command storage and rejecting edits that would require changing command type.

**Consequences**: Agents can inspect and perform safe axis-preserving edits on more real-world paths. General command conversion remains out of scope.

## Out of Scope

- Arc (`A/a`) support.
- Shorthand curve (`S/s`, `T/t`) support.
- Converting H/V to L/l automatically.
- Segment normalization tools.
- Renderer-backed geometry validation.
- Multi-path path transformations.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Durable contracts: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant implementation areas:
  - `src/core/path-data.ts`
  - `src/core/validation.ts`
  - `src/core/svg-ops.ts`
  - `tests/path-validation.test.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `tests/query-document.test.ts`
  - `README.md`
