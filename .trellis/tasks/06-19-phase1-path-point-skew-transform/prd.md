# Phase 1 Path Point Skew Transform

## Goal

Extend `transform_path_points` with a bounded `skew` transform so agents can shear selected editable path points around an explicit SVG origin without replacing the path, depending on GUI selection, or invoking arbitrary Inkscape actions.

This is a Phase 1 path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6. It complements existing translate, exact placement, scale, rotate, and reflect point transforms, and leaves room for later element-level transform tools in Phase 2.

## Requirements

- `transform_path_points.transform` accepts:

```json
{
  "type": "skew",
  "origin": { "x": 100, "y": 30 },
  "axis": "x",
  "angleDegrees": 12
}
```

- `axis: "x"` applies horizontal shear around `origin`:
  - `next.x = origin.x + (x - origin.x) + tan(angle) * (y - origin.y)`
  - `next.y = y`
- `axis: "y"` applies vertical shear around `origin`:
  - `next.x = x`
  - `next.y = origin.y + tan(angle) * (x - origin.x) + (y - origin.y)`
- `origin.x`, `origin.y`, and `angleDegrees` must be finite.
- `angleDegrees` must be non-zero.
- Angles whose tangent is not finite must be rejected.
- Skew operates after resolving the existing `pointSelector` shapes and supports every current selector: explicit points, bbox, segment range, segment list, command, point type, nearest, and radius.
- Skew maps selected absolute coordinates to skewed absolute coordinates, then writes them back through the existing absolute point edit machinery so absolute and relative SVG path commands keep their current storage form.
- Successful writes preserve the target path element id and object tree, snapshot before write, update metadata, write operation diagnostics, append the operation log, and use direct active-window `d` attribute sync like other point transforms.
- Failed validation or unsupported path data leaves `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

## Acceptance Criteria

- Schema tests accept `transform: { type: "skew", axis, origin, angleDegrees }`.
- Schema tests reject invalid axis values, non-finite origin/angle values, and zero angles.
- Core tests prove x-axis and y-axis skew results for absolute and relative path commands.
- Core tests prove existing selectors work with skew through at least one non-explicit selector.
- Tool-level tests prove successful skew snapshots, logs, writes operation diagnostics, returns previous/next `d`, and uses direct active-window `d` sync.
- Tool-level tests prove invalid skew angles leave `current.svg` and history unchanged and do not refresh Inkscape.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
- `npm run typecheck`, focused tests, `npm test`, `npm run build`, extension self-test, and `git diff --check` pass.

## Definition of Done

- Implementation follows existing path transform patterns in `src/core/svg-ops.ts` and validation patterns in `src/core/validation.ts`.
- No new write boundary is introduced.
- No arbitrary Inkscape action is introduced.
- No broad refactor beyond this transform is included.
- Task is committed, archived, journaled, and pushed to GitHub.

## Technical Approach

Add `skew` to the `PathPointTransform` union and Zod discriminated union. Reuse `getSelectedAbsolutePoint`, create `set_point_absolute` edits for selected points, and sort edits by segment index like scale, rotate, and reflect.

Skew is intentionally point-level, not element-level. Later Phase 2 `transform_elements` can handle SVG `transform` attributes, whole-object bbox origins, and matrix composition without changing this path-node editing contract.

## Decision (ADR-lite)

**Context**: The roadmap calls for small geometry helpers for common path edits before broad Inkscape workflow coverage.

**Decision**: Implement path-point skew as a deterministic core transform over already-resolved editable path points.

**Consequences**: Agents gain another precise path deformation primitive while preserving existing safety boundaries. This does not attempt to implement full object transforms, matrix decomposition, or renderer-derived geometry.

## Out of Scope

- No element-level transform attribute updates.
- No matrix transform parsing or composition.
- No arbitrary-angle reflection or perspective transforms.
- No arc, shorthand curve, horizontal, or vertical path command support.
- No Inkscape-backed geometry operation.

## Technical Notes

- Relevant docs:
  - `docs/roadmap/phase-1-stabilize-foundations.md`
  - `.trellis/spec/backend/roadmap-memory.md`
- Relevant files:
  - `src/core/svg-ops.ts`
  - `src/core/validation.ts`
  - `tests/path-validation.test.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `README.md`
