# Implement Phase 1 Path Point Relative Set Transform

## Goal

Extend `transform_path_points` with a bounded `set_relative` transform so agents can set selected path endpoints or control handles using coordinates relative to each segment's current base point. This complements `set_absolute` and makes both raw and normalized `query_path_nodes` outputs actionable without broadening into rotation, scale, or path normalization.

## Requirements

- Add a new `transform_path_points` transform variant named `set_relative`.
- Preserve existing `translate` and `set_absolute` behavior and response shapes.
- Keep explicit point selection through `pointSelector.points`, using `{ segmentIndex, point }` entries for `end`, `c1`, and `c2`.
- For `set_relative`, accept `transform.points`, an array of `{ x, y }` target coordinates in the same order as `pointSelector.points`.
- Interpret `set_relative` target coordinates relative to the selected segment's current base point.
- For relative path commands, store the provided target coordinates directly.
- For absolute path commands, store `current segment base + target`.
- Preserve the original path command case and do not normalize or rewrite unrelated segments.
- Apply point edits in path order so later segment bases account for earlier endpoint changes.
- Require `transform.points.length` to equal `pointSelector.points.length`.
- Reject empty selections, duplicate selections, non-finite target coordinates, unavailable points, out-of-range segments, missing/non-path elements, missing `d`, and unsupported path commands before snapshot/write.
- Successful writes must preserve the target path element id and object tree, snapshot before writing, update metadata, write operation diagnostics, append a compact operation log, and use direct active-window `d` attribute sync.
- Failure paths must leave `current.svg`, history, operation logs, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts `translate`, `set_absolute`, and `set_relative` transforms.
- [ ] Schema rejects `set_relative` when target coordinate count does not match selected point count.
- [ ] Core SVG operation sets relative targets on relative commands by storing the provided values.
- [ ] Core SVG operation sets relative targets on absolute commands by adding the current segment base.
- [ ] Core SVG operation recomputes later segment bases correctly when earlier endpoints are changed.
- [ ] Core SVG operation rejects duplicate, unavailable, and out-of-range point selections without changing SVG.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid input leaves workspace state and history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the new transform variant as Phase 1 loop 20.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Reuse the existing `transform_path_points` surface and the path-order edit mechanism added for `set_absolute`. Add a path-node edit variant that sets a selected point from a target coordinate relative to the current segment base. The existing segment summary can derive the base from `absolutePoint - rawPoint`.

`src/core/svg-ops.ts` maps `set_relative` into ordered path-node edits. The write path in `src/tools/elements.ts` remains unchanged: pre-pull active bidirectional GUI state, snapshot before save, write diagnostics, append operation log, and direct-sync the `d` attribute.

## Decision (ADR-lite)

Context: `query_path_nodes` exposes both raw segment coordinates and absolute normalized coordinates. `set_absolute` made normalized coordinates directly editable; raw relative coordinates still require callers to compute deltas or absolute targets.

Decision: Add `set_relative` as a third `transform_path_points` variant using ordered target coordinates relative to each selected segment's current base point.

Consequences: The transform tool now supports delta movement, absolute placement, and segment-base-relative placement under one validation and write boundary. The meaning of `set_relative` is geometric-relative rather than "raw attribute write"; this allows absolute commands to participate while preserving command case. Future matrix or bbox-relative transforms can still extend the discriminated union without changing this contract.

## Out of Scope

- Rotating, scaling, skewing, matrix transforms, or bounding-box-relative transforms.
- Multi-path point transforms.
- Arc, shorthand curve, `H`, or `V` editing support.
- Rewriting relative commands to absolute commands or absolute commands to relative commands.
- Creating or deleting path segments.
- Renderer-backed geometry validation.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15, 16, 17, 18, and 19.
- Existing transform implementation: `src/core/svg-ops.ts`.
- Existing path parser/edit helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
