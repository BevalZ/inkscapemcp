# Phase 1 Path Point Reflect-Line Transform

## Goal

Extend `transform_path_points` with a bounded arbitrary-line reflection transform for editable path endpoints/control points. This continues Phase 1 path editing reliability work by supporting precise geometric edits without broadening into element-level transforms, GUI node selection, or full-document replacement.

## Requirements

- Add a new transform variant:
  - `transform: { "type": "reflect_line", "origin": { "x": number, "y": number }, "angleDegrees": number }`
- Reflect already-resolved editable path points across the infinite line passing through `origin` at `angleDegrees` in SVG user units.
- Preserve existing point selector behavior for explicit, bbox, segment range, segment list, command, point type, nearest, and radius selectors.
- Preserve path command storage form by mapping transformed absolute coordinates back through the existing point edit machinery.
- Accept finite angles including `0`, `90`, and negative values.
- Reject non-finite origin coordinates or angle values before snapshot/write.
- Preserve existing write contracts:
  - pre-pull active bidirectional GUI state before current-state writes
  - validate before snapshot/write
  - snapshot before successful mutation
  - write operation diff diagnostics
  - append compact operation log entry
  - use direct active-window `d` attribute sync when possible
- Document the new transform in README and roadmap memory.

## Acceptance Criteria

- [x] Validation accepts `reflect_line` with finite `origin` and `angleDegrees`.
- [x] Validation rejects non-finite `origin` or `angleDegrees`.
- [x] Core SVG operation tests prove horizontal (`0` degree), vertical (`90` degree), and oblique reflection behavior.
- [x] Tool-level tests prove successful writes snapshot/log/write diagnostics and use direct active-window `d` sync.
- [x] Tool-level tests prove invalid `reflect_line` inputs leave `current.svg`, history, operation logs, operation-diff artifacts, and GUI refresh untouched.
- [x] README documents the new transform and its coordinate semantics.
- [x] Roadmap memory records the durable Phase 1 contract.
- [x] Focused tests, typecheck, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

- Tests added/updated for validation, core path geometry, and tool-level side effects.
- TypeScript typecheck and full test suite pass.
- Documentation and Trellis memory updated in English.
- Work is committed, task archived, journaled, and pushed.

## Technical Approach

Use a new `reflect_line` transform type instead of overloading existing `reflect.axis`. Existing `reflect` remains limited to `"vertical" | "horizontal"` for compatibility, while `reflect_line` leaves room for future matrix-level transforms without changing the current schema shape.

Reflection formula:

- Translate point to origin: `dx = x - origin.x`, `dy = y - origin.y`.
- Unit line direction: `ux = cos(theta)`, `uy = sin(theta)`.
- Projection: `dot = dx * ux + dy * uy`.
- Reflected offset: `x = 2 * dot * ux - dx`, `y = 2 * dot * uy - dy`.
- Translate back to absolute coordinates.

## Decision (ADR-lite)

**Context**: Phase 1 already has transform-side point editing primitives for translate, exact set, scale, rotate, axis-aligned reflect, and skew. Arbitrary-angle reflection was explicitly left as a future extension after the axis-aligned reflect loop.

**Decision**: Add a separate `reflect_line` transform variant with explicit origin and angle. Keep selectors, write path, diagnostics, and direct `d` sync unchanged.

**Consequences**: This adds precise geometry coverage without introducing a general matrix transform yet. A later matrix or element-transform tool can reuse the same absolute-point transform helper patterns.

## Out of Scope

- Element-level transforms or matrix tools.
- GUI node selection or renderer hit testing.
- Multi-path transforms.
- Full-document replacement.
- Arbitrary Inkscape action execution.
- New path command parser support such as arcs.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Durable contracts: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant implementation areas:
  - `src/core/validation.ts`
  - `src/core/svg-ops.ts`
  - `src/tools/elements.ts`
  - `tests/path-validation.test.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `README.md`
