# Phase 1 Path Point Rotate Transform

## Goal

Extend `transform_path_points.transform` with a bounded `rotate` transform so agents can rotate already-selected editable path endpoints/control handles around an explicit SVG coordinate origin.

This is a Phase 1 path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6. It complements `scale` by adding a second common deterministic point transform without changing element-level transforms.

## Scope

Add transform shape:

```json
{
  "type": "rotate",
  "origin": { "x": 100, "y": 30 },
  "angleDegrees": 15
}
```

The transform applies only to points resolved by the existing `pointSelector` union on one existing path element.

## Requirements

- `origin.x`, `origin.y`, and `angleDegrees` are finite numbers.
- `angleDegrees` must not be zero.
- Rotation uses absolute SVG coordinates around the explicit origin.
- The rotated absolute point is mapped back into the existing path storage through the same node edit machinery used by exact absolute placement.
- All existing selectors remain compatible, including explicit, bbox, segment range, segment list, command, point type, nearest, and radius.
- Validation failures must not write `current.svg`, history, operation logs, operation-diff artifacts, or trigger Inkscape refresh.
- Successful writes preserve the target path id and object tree, snapshot first, write diagnostics/log entries through the existing tool path, and direct-sync the active Inkscape window with `object-set-attribute:d`.

## Non-Goals

- No element `transform` attribute editing.
- No implicit bounding-box origin calculation.
- No matrix/skew transform in this slice.
- No GUI node selection support.
- No unsupported path command expansion.

## Verification

- Schema tests accept `rotate` transforms and reject non-finite or zero angles.
- Core tests prove rotate uses absolute point coordinates and maps correctly for absolute and relative path commands.
- Core tests prove rotate works after selector resolution, including `point_type` selectors.
- Core tests prove validation failures do not return mutated SVG.
- Tool-level tests prove successful rotate transforms snapshot/log/write diagnostics and use direct active-window `d` sync.
- Tool-level tests prove invalid rotate transforms leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
