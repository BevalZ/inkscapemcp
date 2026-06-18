# Implement Phase 1 Path Point Absolute Set Transform

## Goal

Extend `transform_path_points` with a narrow absolute-coordinate point-setting mode so agents can move specific path endpoints or control handles to exact coordinates after inspecting normalized path nodes. This supports finer path editing without introducing broad geometry transforms or replacing the SVG document.

## Requirements

- Add a new `transform_path_points` transform variant named `set_absolute`.
- Preserve the existing `translate` transform behavior and response shape.
- Keep explicit point selection through `pointSelector.points`, using `{ segmentIndex, point }` entries for `end`, `c1`, and `c2`.
- For `set_absolute`, accept `transform.points`, an array of `{ x, y }` absolute target coordinates in the same order as `pointSelector.points`.
- Require `transform.points.length` to equal `pointSelector.points.length`.
- Support existing editable path commands only: `M`, `L`, `C`, `Q`, and `Z`, including relative variants.
- For relative path commands, convert the requested absolute target coordinate back to the segment's relative stored coordinate while preserving the command's relative form.
- Reject empty selections, duplicate selections, non-finite target coordinates, unavailable points, out-of-range segments, missing/non-path elements, missing `d`, and unsupported path commands before snapshot/write.
- Successful writes must preserve the target path element id and object tree, snapshot before writing, update metadata, write operation diagnostics, append a compact operation log, and use direct active-window `d` attribute sync.
- Failure paths must leave `current.svg`, history, operation logs, and Inkscape refresh untouched.

## Acceptance Criteria

- [ ] Schema accepts both `translate` and `set_absolute` transforms.
- [ ] Schema rejects `set_absolute` when target coordinate count does not match selected point count.
- [ ] Core SVG operation sets absolute targets on absolute and relative path commands without changing command case.
- [ ] Core SVG operation recomputes later relative coordinates correctly when earlier endpoints are changed.
- [ ] Core SVG operation rejects duplicate, unavailable, and out-of-range point selections without changing SVG.
- [ ] Tool-level behavior snapshots/logs/diagnostics on success and directly syncs the updated `d` attribute.
- [ ] Tool-level invalid input leaves workspace state and history unchanged and does not call Inkscape sync/refresh.
- [ ] README and roadmap memory document the new transform variant as Phase 1 loop 19.

## Definition of Done

- `npx vitest run tests/path-validation.test.ts tests/svg-ops.test.ts tests/elements.test.ts` passes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- Task work is committed separately from Trellis archive and journal bookkeeping.

## Technical Approach

Reuse the existing `transform_path_points` surface instead of adding a new MCP tool. Extend the transform schema with a discriminated `set_absolute` variant. In `src/core/path-data.ts`, add a path-node edit variant that sets a selected point to an absolute coordinate; for relative commands, derive the segment base from the current editable segment summary and store `target - base`.

The write path remains unchanged: `src/core/svg-ops.ts` maps the transform to path-node edits, `src/tools/elements.ts` keeps the existing pre-pull, snapshot-first write, operation diagnostics, compact log entry, and direct active-window `d` sync.

## Decision (ADR-lite)

Context: Precise human-like path editing needs exact coordinate placement after `query_path_nodes({ normalize: "absolute" })`, not only relative deltas.

Decision: Add `set_absolute` as a second `transform_path_points` variant using ordered `pointSelector.points` plus ordered `transform.points` target coordinates.

Consequences: The existing transform tool stays the single point-transform boundary. Ordered targets are compact and easy for agents to generate, but callers must keep selection and target arrays aligned. Future transform variants such as `set_relative`, `scale`, `rotate`, or matrix transforms can extend the same discriminated union with their own validation contracts.

## Out of Scope

- Rotating, scaling, skewing, matrix transforms, or bounding-box-relative transforms.
- Multi-path point transforms.
- Arc, shorthand curve, `H`, or `V` editing support.
- Rewriting relative commands to absolute commands.
- Creating or deleting path segments.
- Renderer-backed geometry validation.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15, 16, 17, and 18.
- Existing transform implementation: `src/core/svg-ops.ts`.
- Existing path parser/edit helper: `src/core/path-data.ts`.
- Existing schema: `src/core/validation.ts`.
