# Phase 1 Path Point Segment List Selector

## Goal

Extend `transform_path_points` with a deterministic `segment_list` point selector so agents can edit non-contiguous path sections without enumerating every point manually. This advances Phase 1 path editing reliability while preserving the current in-place, snapshot-first, same-window `d` attribute sync contract.

## Requirements

* Add `pointSelector.type: "segment_list"` to `transform_path_points`.
* The selector shape is `{ type: "segment_list", segmentIndexes: number[], pointTypes?: ("end" | "c1" | "c2")[] }`.
* `segmentIndexes` must be non-empty, unique, non-negative integers.
* `pointTypes` defaults to `["end", "c1", "c2"]`.
* Resolution must use parsed path segment indexes from `query_path_nodes` / `query_document({ includePathNodes: true })`.
* Resolution must be deterministic in path order, not caller array order.
* The selector must work with existing `translate`, `set_absolute`, and `set_relative` transforms.
* Out-of-range indexes, unsupported path data, missing path data, and empty editable-point matches must fail before snapshot/write.
* Successful writes must preserve the target path element id and object tree, snapshot before save, write diagnostics/logs, and use the existing direct active-window `d` sync path.

## Acceptance Criteria

* [ ] Schema validation accepts `segment_list` with defaulted `pointTypes`.
* [ ] Schema validation rejects empty, duplicate, negative, or non-integer `segmentIndexes`, and empty `pointTypes`.
* [ ] Core SVG tests prove unordered `segmentIndexes` resolve in path order.
* [ ] Core SVG tests prove `set_absolute` / `set_relative` count checks happen after selector resolution.
* [ ] Core SVG tests prove out-of-range and empty-match selectors fail before returning a mutated SVG.
* [ ] Tool-level tests prove successful `segment_list` transforms snapshot, log, write operation diagnostics, and use direct active-window `d` sync.
* [ ] Tool-level tests prove invalid `segment_list` selectors leave `current.svg` and history unchanged and do not refresh Inkscape.
* [ ] README and roadmap memory document the new selector contract.
* [ ] `npm run typecheck`, focused tests, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

* Tests added or updated for validation, core behavior, and tool-level side effects.
* Documentation updated in README and `.trellis/spec/backend/roadmap-memory.md`.
* No full-document replacement path is introduced.
* No GUI selection state is used.
* No new persistence mechanism, database, transport, or arbitrary Inkscape action is introduced.

## Technical Approach

Add one new selector variant beside `bbox`, `segment_range`, `nearest`, and `radius`. Validation belongs in `src/core/validation.ts` for MCP tool input and in `src/core/svg-ops.ts` for direct core callers. Selector resolution should reuse `describeEditablePathData` and the existing `availablePoints` order. For deterministic output, convert `segmentIndexes` to a set for membership tests, iterate parsed segments in natural path order, and then iterate each segment's `availablePoints`.

## Decision (ADR-lite)

**Context**: Existing selectors support exact points, rectangles, contiguous ranges, nearest point, and circular regions. Agents still need a compact way to target non-contiguous known segment indexes after inspecting a path.

**Decision**: Implement a narrow `segment_list` selector for one existing path, using explicit segment indexes and optional point-type filtering.

**Consequences**: This keeps the Phase 1 path editing surface deterministic and testable while leaving room for future command-based, lasso, multi-nearest, and cross-path selectors.

## Out of Scope

* Cross-path selection.
* GUI node selection.
* Lasso, polygon, curve-projection, stroke-outline, or rendered hit testing.
* Segment creation/deletion.
* Additional path command support beyond current `M`, `L`, `C`, `Q`, and `Z`.
* Full-document replacement or structural refresh changes.

## Technical Notes

* Phase plan: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
* Roadmap memory: `.trellis/spec/backend/roadmap-memory.md`, Phase 1 loops 17-24.
* Existing implementation points:
  * `src/core/svg-ops.ts`
  * `src/core/validation.ts`
  * `src/tools/elements.ts`
* Existing tests to extend:
  * `tests/path-validation.test.ts`
  * `tests/svg-ops.test.ts`
  * `tests/elements.test.ts`
