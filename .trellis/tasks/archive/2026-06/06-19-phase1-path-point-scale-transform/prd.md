# Phase 1 Path Point Scale Transform

## Goal

Extend `transform_path_points.transform` with a bounded `scale` transform so agents can scale already-selected editable path endpoints/control handles around an explicit SVG coordinate origin.

This is a Phase 1 path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6. It complements the existing selector expansion work by adding one common deterministic point transform.

## Scope

Add transform shape:

```json
{
  "type": "scale",
  "origin": { "x": 100, "y": 30 },
  "sx": 1.1,
  "sy": 0.9
}
```

The transform applies only to points resolved by the existing `pointSelector` union on one existing path element.

## Requirements

- `origin.x`, `origin.y`, `sx`, and `sy` are finite numbers.
- `sx` and `sy` must be non-zero.
- Scaling uses absolute SVG coordinates: `origin + (point - origin) * scale`.
- The scaled absolute point is mapped back into the existing path storage through the same node edit machinery used by exact absolute placement.
- All existing selectors remain compatible, including explicit, bbox, segment range, segment list, command, point type, nearest, and radius.
- Validation failures must not write `current.svg`, history, operation logs, operation-diff artifacts, or trigger Inkscape refresh.
- Successful writes preserve the target path id and object tree, snapshot first, write diagnostics/log entries through the existing tool path, and direct-sync the active Inkscape window with `object-set-attribute:d`.

## Non-Goals

- No whole-path or element transform attribute editing.
- No implicit bounding-box origin calculation.
- No matrix/skew/rotate transform in this slice.
- No GUI node selection support.
- No unsupported path command expansion.

## Verification

- Schema tests accept `scale` transforms and reject non-finite or zero scale factors.
- Core tests prove scale uses absolute point coordinates and maps correctly for absolute and relative path commands.
- Core tests prove scale works after selector resolution, including `point_type` selectors.
- Core tests prove validation failures do not return mutated SVG.
- Tool-level tests prove successful scale transforms snapshot/log/write diagnostics and use direct active-window `d` sync.
- Tool-level tests prove invalid scale transforms leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
