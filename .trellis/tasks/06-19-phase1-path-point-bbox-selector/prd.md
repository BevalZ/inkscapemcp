# Implement Phase 1 Path Point Bbox Selector

## Goal

Extend `transform_path_points` with a bounded absolute-coordinate bounding-box point selector so agents can transform groups of path endpoints/control handles without manually enumerating every point. This improves precision-editing ergonomics while preserving the existing one-path, explicit, snapshot-first transform boundary.

## Requirements

- Extend `transform_path_points.pointSelector` to support two selector variants:
  - `{ type?: "points", points: Array<{ segmentIndex, point }> }` for the existing explicit behavior.
  - `{ type: "bbox", minX, minY, maxX, maxY, pointTypes? }` for selecting editable points whose absolute coordinates fall inside the box.
- Preserve backward compatibility for existing callers that omit `pointSelector.type` and pass `points`.
- Interpret bbox coordinates as absolute SVG user-unit coordinates.
- Include points on bbox edges.
- `pointTypes` defaults to `["end", "c1", "c2"]` and can narrow which editable point kinds are selected.
- Reject bbox selectors where `minX > maxX`, `minY > maxY`, or any coordinate is non-finite.
- Reject bbox selectors that select zero points before snapshot/write.
- Reuse existing `translate`, `set_absolute`, and `set_relative` transforms after selection resolution.
- For set transforms, require target point count to equal the resolved selected point count.
- Preserve existing validation for duplicate explicit points, unavailable points, unsupported commands, missing path data, and active bidirectional pre-pull.
- Successful writes must preserve the target path element id and object tree, snapshot before writing, update metadata, write operation diagnostics, append a compact operation log, and use direct active-window `d` attribute sync.
- Failure paths must leave `current.svg`, history, operation logs, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts legacy explicit `points` selectors and new `type: "bbox"` selectors.
- [ ] Schema rejects invalid bbox bounds.
- [ ] Core SVG operation resolves bbox-selected points from absolute path-node coordinates.
- [ ] Core SVG operation supports bbox selection with `translate`, including relative path commands.
- [ ] Core SVG operation supports bbox selection with set transforms when target counts match.
- [ ] Core SVG operation rejects bbox selections that match no points without changing SVG.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid bbox input leaves workspace state and history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the selector variant as Phase 1 loop 21.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Add a discriminated selector union in `src/core/svg-ops.ts` and `src/core/validation.ts` while keeping the legacy `{ points }` shape valid. Resolve bbox selectors inside `transformPathPointsInSvg` after loading the path element's current `d`, using `describeEditablePathData` absolute point summaries. Then pass the resolved point list into the existing path-order transform edit pipeline.

For schema compatibility, keep `pointSelector.points` accepted without `type`; normalize behavior in core rather than requiring clients to change. For bbox selectors, validate shape at schema level and reject empty resolved selections in core with `INVALID_INPUT`.

## Decision (ADR-lite)

Context: Fine edits often target multiple nearby path points. Requiring agents to enumerate every segment index and point name increases token use and error risk.

Decision: Add bbox point selection to `transform_path_points`, scoped to one existing path and absolute path-node coordinates.

Consequences: Agents can perform small group edits without relying on hidden GUI selection state. The selector remains deterministic and testable. Future selectors such as path segment ranges, nearest-point, or dependency-aware selectors can extend `pointSelector.type` without changing the transform variants.

## Out of Scope

- Multi-path or document-wide bbox selection.
- Renderer hit testing, stroke outline hit testing, or visual selection.
- GUI selection state or mouse/keyboard automation.
- Arc, shorthand curve, `H`, or `V` editing support.
- Segment creation/deletion.
- Selection previews or persisted selection artifacts.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15 through 20.
- Existing transform implementation: `src/core/svg-ops.ts`.
- Existing path parser/query helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
