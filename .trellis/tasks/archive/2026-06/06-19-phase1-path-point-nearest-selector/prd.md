# Implement Phase 1 Path Point Nearest Selector

## Goal

Extend `transform_path_points.pointSelector` with a deterministic nearest-point selector so agents can transform the editable path point closest to an absolute SVG coordinate without manually enumerating segment indexes. This improves precision editing from inspected or estimated coordinates while preserving the existing one-path, snapshot-first, direct `d` sync boundary.

## Requirements

- Extend `transform_path_points.pointSelector` to support these selector variants:
  - legacy explicit `{ points: Array<{ segmentIndex, point }> }`
  - typed explicit `{ type?: "points", points: Array<{ segmentIndex, point }> }`
  - existing bbox `{ type: "bbox", minX, minY, maxX, maxY, pointTypes? }`
  - existing segment range `{ type: "segment_range", startSegmentIndex, endSegmentIndex, pointTypes? }`
  - new nearest `{ type: "nearest", x, y, pointTypes?, maxDistance? }`
- Preserve backward compatibility for existing explicit, bbox, and segment range callers.
- Interpret `x` and `y` as absolute SVG user-unit coordinates.
- Select exactly one editable point, the point with minimum squared Euclidean distance to `{ x, y }`.
- `pointTypes` defaults to `["end", "c1", "c2"]` and can narrow which editable point kinds are considered.
- Tie-break deterministically by path order: lower segment index wins; within a segment, the parser's existing `availablePoints` order wins.
- If `maxDistance` is provided, require it to be finite and non-negative; reject when the nearest candidate is farther than `maxDistance`.
- Reject nearest selectors that resolve to zero candidate points before snapshot/write.
- Reuse existing `translate`, `set_absolute`, and `set_relative` transforms after selection resolution.
- For set transforms, require exactly one target point for nearest selection after resolution.
- Preserve existing validation for duplicate explicit points, unavailable points, unsupported commands, missing path data, active bidirectional pre-pull, snapshot-first writes, operation diagnostics, operation logs, and direct active-window `d` sync.
- Failure paths must leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts legacy explicit, bbox, segment range, and new `type: "nearest"` selectors.
- [ ] Schema rejects invalid nearest coordinates, empty `pointTypes`, and negative `maxDistance`.
- [ ] Core SVG operation resolves the nearest editable point from absolute path-node coordinates.
- [ ] Core SVG operation uses deterministic path-order tie-breaks.
- [ ] Core SVG operation rejects no-candidate and out-of-threshold nearest selectors without changing SVG.
- [ ] Core SVG operation supports nearest selection with `translate`, `set_absolute`, and `set_relative`.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid nearest input leaves workspace state/history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the selector variant as Phase 1 loop 23.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Extend the existing `PathPointSelector` union in `src/core/svg-ops.ts` and `src/core/validation.ts`. Resolve `nearest` selectors inside `transformPathPointsInSvg` after loading the path element's current `d`, using `describeEditablePathData` absolute point summaries so point availability and unsupported-command behavior remain shared with `query_path_nodes`, bbox, and segment range selectors.

Keep the selector single-point in this slice. Future work can add `count`, radius selection, sorted candidates, or preview artifacts without changing transform variants.

## Decision (ADR-lite)

Context: Agents often know an approximate coordinate from a query, rendered view, or user instruction such as "move the point near x/y", but not the exact segment index. Explicit selectors are exact but verbose; bbox/range selectors are useful for groups but not ideal for one nearby point.

Decision: Add `nearest` as another `transform_path_points.pointSelector` variant, scoped to one existing path, one resolved editable point, and absolute SVG coordinates.

Consequences: Agents can cheaply perform coordinate-targeted point edits while keeping selection deterministic, testable, and snapshot-first. Future nearest-multiple and threshold-preview workflows can extend `pointSelector.type` or add read-only preview tools without changing transform semantics.

## Out of Scope

- Multi-point nearest selection or `count`.
- Renderer hit testing, stroke-outline distance, path-curve projection distance, or visual snapping.
- GUI node selection or Inkscape current selection state.
- Cross-path nearest selection.
- Arc, shorthand curve, `H`, or `V` editing support.
- Persisted selection artifacts or previews.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15 through 22.
- Existing selector implementation: `src/core/svg-ops.ts`.
- Existing path parser/query helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
