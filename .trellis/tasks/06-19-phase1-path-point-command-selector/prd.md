# Phase 1 Path Point Command Selector

## Goal

Extend `transform_path_points` with a deterministic `command` point selector so agents can edit points by SVG path command type, such as moving all cubic curve handles on `C/c` segments or all endpoints on `Q/q` segments. This advances Phase 1 path editing reliability while preserving the existing in-place, snapshot-first, direct `d` attribute sync contract.

## Requirements

* Add `pointSelector.type: "command"` to `transform_path_points`.
* The selector shape is `{ type: "command", commands: ("M" | "m" | "L" | "l" | "C" | "c" | "Q" | "q" | "Z" | "z")[], pointTypes?: ("end" | "c1" | "c2")[] }`.
* `commands` must be non-empty and unique.
* Command matching is case-sensitive so callers can target absolute and relative command storage separately.
* `pointTypes` defaults to `["end", "c1", "c2"]`.
* Resolution must use parsed path command names and segment indexes returned by `query_path_nodes` / `query_document({ includePathNodes: true })`.
* Resolution must be deterministic in path order and within each segment must follow the parser's `availablePoints` order.
* The selector must work with existing `translate`, `set_absolute`, and `set_relative` transforms.
* Unsupported path data, missing path data, no matching command segments, or command matches with no editable points must fail before snapshot/write.
* Successful writes must preserve the target path element id and object tree, snapshot before save, write diagnostics/logs, and use the existing direct active-window `d` sync path.

## Acceptance Criteria

* [ ] Schema validation accepts `command` selectors with defaulted `pointTypes`.
* [ ] Schema validation rejects empty, duplicate, or unsupported `commands`, and empty `pointTypes`.
* [ ] Core SVG tests prove command selection is case-sensitive and resolves in path order.
* [ ] Core SVG tests prove `set_absolute` / `set_relative` count checks happen after selector resolution.
* [ ] Core SVG tests prove no-match and empty-editable-point selectors fail before returning a mutated SVG.
* [ ] Tool-level tests prove successful `command` transforms snapshot, log, write operation diagnostics, and use direct active-window `d` sync.
* [ ] Tool-level tests prove invalid `command` selectors leave `current.svg` and history unchanged and do not refresh Inkscape.
* [ ] README and roadmap memory document the new selector contract.
* [ ] `npm run typecheck`, focused tests, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

* Tests added or updated for validation, core behavior, and tool-level side effects.
* Documentation updated in README and `.trellis/spec/backend/roadmap-memory.md`.
* No full-document replacement path is introduced.
* No GUI selection state is used.
* No new persistence mechanism, database, transport, or arbitrary Inkscape action is introduced.

## Technical Approach

Add one new selector variant beside explicit points, `bbox`, `segment_range`, `segment_list`, `nearest`, and `radius`. Validation belongs in `src/core/validation.ts` for MCP tool input and in `src/core/svg-ops.ts` for direct core callers. Selector resolution should reuse `describeEditablePathData`, match each segment's `cmd` exactly, and iterate parsed segments in natural path order.

## Decision (ADR-lite)

**Context**: Existing selectors support exact points, geometric regions, contiguous/non-contiguous segment indexes, and coordinate-based selection. Agents also need a compact semantic selector for common path-editing tasks like "move all cubic control handles" after path inspection.

**Decision**: Implement a narrow case-sensitive `command` selector for one existing path, using explicit supported path command names and optional point-type filtering.

**Consequences**: This preserves deterministic edit behavior and avoids broad shape recognition while leaving room for future command groups, selector composition, and richer path semantics.

## Out of Scope

* Cross-path selection.
* GUI node selection.
* Command groups such as `"curve"` or `"line"` aliases.
* Selector composition such as command plus bbox.
* Segment creation/deletion.
* Additional path command support beyond current `M`, `L`, `C`, `Q`, and `Z`.
* Full-document replacement or structural refresh changes.

## Technical Notes

* Phase plan: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
* Roadmap memory: `.trellis/spec/backend/roadmap-memory.md`, Phase 1 loops 17-25.
* Existing implementation points:
  * `src/core/svg-ops.ts`
  * `src/core/validation.ts`
  * `src/tools/elements.ts`
* Existing tests to extend:
  * `tests/path-validation.test.ts`
  * `tests/svg-ops.test.ts`
  * `tests/elements.test.ts`
