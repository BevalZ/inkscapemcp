# Phase 1 Path Point Reflect Transform

## Goal

Extend `transform_path_points.transform` with a bounded `reflect` transform so agents can mirror already-selected editable path endpoints/control handles across an explicit horizontal or vertical axis.

This is a Phase 1 path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6. It complements `scale` and `rotate` by adding a common deterministic mirror operation while leaving room for future arbitrary-axis reflection.

## Scope

Add transform shape:

```json
{
  "type": "reflect",
  "axis": "vertical",
  "origin": { "x": 100, "y": 30 }
}
```

Supported axes:

- `vertical`: mirror across the vertical line `x = origin.x`.
- `horizontal`: mirror across the horizontal line `y = origin.y`.

The transform applies only to points resolved by the existing `pointSelector` union on one existing path element.

## Requirements

- `axis` must be `vertical` or `horizontal`.
- `origin.x` and `origin.y` are finite numbers.
- Reflection uses absolute SVG coordinates.
- The reflected absolute point is mapped back into the existing path storage through the same node edit machinery used by exact absolute placement.
- All existing selectors remain compatible, including explicit, bbox, segment range, segment list, command, point type, nearest, and radius.
- Validation failures must not write `current.svg`, history, operation logs, operation-diff artifacts, or trigger Inkscape refresh.
- Successful writes preserve the target path id and object tree, snapshot first, write diagnostics/log entries through the existing tool path, and direct-sync the active Inkscape window with `object-set-attribute:d`.

## Non-Goals

- No arbitrary-angle reflection line in this slice.
- No element `transform` attribute editing.
- No implicit bounding-box origin calculation.
- No GUI node selection support.
- No unsupported path command expansion.

## Verification

- Schema tests accept `reflect` transforms and reject invalid axes or non-finite origins.
- Core tests prove vertical and horizontal reflection use absolute point coordinates and map correctly for absolute and relative path commands.
- Core tests prove reflect works after selector resolution, including `point_type` selectors.
- Core tests prove validation failures do not return mutated SVG.
- Tool-level tests prove successful reflect transforms snapshot/log/write diagnostics and use direct active-window `d` sync.
- Tool-level tests prove invalid reflect transforms leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
