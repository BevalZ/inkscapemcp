# Implement Phase 1 Path Point Radius Selector

## Goal

Extend `transform_path_points.pointSelector` with a deterministic radius selector so agents can transform all editable path points within a circular absolute-coordinate area. This improves fine path editing when a user or agent wants to adjust a small local cluster around a point without enumerating segment indexes or hand-building rectangular bounds.

## Requirements

- Extend `transform_path_points.pointSelector` to support these selector variants:
  - legacy explicit `{ points: Array<{ segmentIndex, point }> }`
  - typed explicit `{ type?: "points", points: Array<{ segmentIndex, point }> }`
  - existing bbox `{ type: "bbox", minX, minY, maxX, maxY, pointTypes? }`
  - existing segment range `{ type: "segment_range", startSegmentIndex, endSegmentIndex, pointTypes? }`
  - existing nearest `{ type: "nearest", x, y, pointTypes?, maxDistance? }`
  - new radius `{ type: "radius", x, y, radius, pointTypes? }`
- Preserve backward compatibility for existing explicit, bbox, segment range, and nearest callers.
- Interpret `x`, `y`, and `radius` as absolute SVG user-unit values.
- Select every editable point whose squared Euclidean distance from `{ x, y }` is less than or equal to `radius ** 2`.
- `pointTypes` defaults to `["end", "c1", "c2"]` and can narrow which editable point kinds are considered.
- Resolve selected points deterministically in path order, using each segment's existing `availablePoints` order.
- Require `radius` to be finite and non-negative.
- Reject radius selectors that resolve to zero candidate points before snapshot/write.
- Reuse existing `translate`, `set_absolute`, and `set_relative` transforms after selection resolution.
- For set transforms, require target count to match the resolved selected point count after radius selection.
- Preserve existing validation for duplicate explicit points, unavailable points, unsupported commands, missing path data, active bidirectional pre-pull, snapshot-first writes, operation diagnostics, operation logs, and direct active-window `d` sync.
- Failure paths must leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts legacy explicit, bbox, segment range, nearest, and new `type: "radius"` selectors.
- [ ] Schema rejects invalid radius coordinates, empty `pointTypes`, and negative/non-finite `radius`.
- [ ] Core SVG operation resolves all editable points within the circular radius from absolute path-node coordinates.
- [ ] Core SVG operation preserves deterministic path/point order.
- [ ] Core SVG operation rejects empty radius matches without changing SVG.
- [ ] Core SVG operation supports radius selection with `translate`, `set_absolute`, and `set_relative`.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid radius input leaves workspace state/history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the selector variant as Phase 1 loop 24.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Extend the existing `PathPointSelector` union in `src/core/svg-ops.ts` and `src/core/validation.ts`. Resolve `radius` selectors inside `resolvePathPointSelector` using `describeEditablePathData()` absolute point summaries, matching the bbox and nearest selector implementation style.

Keep this slice scoped to one existing path and a simple circular selector. Future work can add elliptical regions, count-limited nearest groups, polygon/lasso selection, or preview artifacts without changing transform semantics.

## Decision (ADR-lite)

Context: Agents can now select exact points, rectangular groups, segment ranges, and a single nearest point. For local curve refinement, a circular group selector is often more natural than bbox because it avoids unintentionally selecting diagonal corner points in a rectangle.

Decision: Add `radius` as another `transform_path_points.pointSelector` variant, scoped to one existing path, absolute SVG coordinates, and all editable points within an inclusive distance threshold.

Consequences: Agents gain a compact local group selector while preserving deterministic, testable, snapshot-first path editing. Future multi-nearest and lasso selectors can build on the same selector-resolution boundary.

## Out of Scope

- Cross-path radius selection.
- Ellipse, polygon, lasso, stroke-outline, or rendered-curve hit testing.
- Sorted-by-distance response order; path order remains the contract.
- GUI node selection or Inkscape current selection state.
- Persisted selection artifacts or previews.
- Arc, shorthand curve, `H`, or `V` editing support.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 17 through 23.
- Existing selector implementation: `src/core/svg-ops.ts`.
- Existing path parser/query helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
