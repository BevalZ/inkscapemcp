# Implement Phase 1 Path Point Segment Range Selector

## Goal

Extend `transform_path_points.pointSelector` with a deterministic segment-range selector so agents can transform all editable points of contiguous path segments without enumerating each `{ segmentIndex, point }`. This improves fine path-edit ergonomics while preserving the existing one-path, snapshot-first, direct `d` sync boundary.

## Requirements

- Extend `transform_path_points.pointSelector` to support three selector variants:
  - legacy explicit `{ points: Array<{ segmentIndex, point }> }`
  - typed explicit `{ type?: "points", points: Array<{ segmentIndex, point }> }`
  - existing bbox `{ type: "bbox", minX, minY, maxX, maxY, pointTypes? }`
  - new range `{ type: "segment_range", startSegmentIndex, endSegmentIndex, pointTypes? }`
- Preserve backward compatibility for existing explicit callers that omit `pointSelector.type`.
- Interpret segment range indexes as inclusive path segment indexes from the current parsed path.
- `pointTypes` defaults to `["end", "c1", "c2"]` and can narrow which editable point kinds are selected.
- Select points in path order, and within each segment use the parser's existing point order.
- Reject invalid ranges where either index is negative/non-integer or `startSegmentIndex > endSegmentIndex`.
- Reject ranges that resolve to zero editable points before snapshot/write.
- Reuse existing `translate`, `set_absolute`, and `set_relative` transforms after selection resolution.
- For set transforms, require target point count to equal the resolved selected point count.
- Preserve existing validation for duplicate explicit points, unavailable points, unsupported commands, missing path data, active bidirectional pre-pull, snapshot-first writes, operation diagnostics, operation logs, and direct active-window `d` sync.
- Failure paths must leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts legacy explicit, typed explicit, bbox, and new `type: "segment_range"` selectors.
- [ ] Schema rejects invalid range bounds and defaults `pointTypes`.
- [ ] Core SVG operation resolves range-selected points in path/point order.
- [ ] Core SVG operation supports range selection with `translate`, including relative path commands.
- [ ] Core SVG operation supports range selection with set transforms when target counts match.
- [ ] Core SVG operation rejects ranges that resolve to no editable points without changing SVG.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid range input leaves workspace state/history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the selector variant as Phase 1 loop 22.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Extend the existing `PathPointSelector` union in `src/core/svg-ops.ts` and `src/core/validation.ts`. Resolve `segment_range` selectors inside `transformPathPointsInSvg` after loading the path element's current `d`, using `describeEditablePathData` so point availability and unsupported-command behavior remain shared with `query_path_nodes` and bbox selection. Then pass the resolved point list into the existing transform edit pipeline.

Keep the selector extensible by using a named `type` rather than adding transform-specific arguments. Do not add a new MCP tool.

## Decision (ADR-lite)

Context: Fine edits often target adjacent path segments, especially when adjusting a mouth, fin, outline section, or local contour. Bbox selection works when coordinates are known, but agents often already know segment index ranges from `query_path_nodes`.

Decision: Add `segment_range` as another `transform_path_points.pointSelector` variant, scoped to one existing path and inclusive segment indexes.

Consequences: Agents can cheaply transform contiguous portions of a path while keeping the mutation path deterministic, testable, and snapshot-first. Future selectors such as nearest-point, segment kind filters, or dependency-aware selectors can extend `pointSelector.type` without changing transform variants.

## Out of Scope

- Multi-path or document-wide segment range selection.
- GUI node selection or Inkscape current selection state.
- Range selection by visual length, percentage, or renderer hit testing.
- Arc, shorthand curve, `H`, or `V` editing support.
- Segment creation/deletion or range extraction.
- Persisted selection artifacts or previews.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15 through 21.
- Existing selector implementation: `src/core/svg-ops.ts`.
- Existing path parser/query helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
