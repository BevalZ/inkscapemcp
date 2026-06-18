# Phase 1 Path Point Type Selector

## Goal

Extend `transform_path_points.pointSelector` with a focused `point_type` selector so agents can transform every editable point of one or more point kinds on a single existing path without enumerating segment indexes.

This is a Phase 1 path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6. It builds on the existing explicit, bbox, segment range, segment list, command, nearest, and radius selector contracts.

## Scope

Add selector shape:

```json
{
  "type": "point_type",
  "pointTypes": ["end", "c1", "c2"]
}
```

The selector applies to one existing path element and supports the existing `translate`, `set_absolute`, and `set_relative` transforms.

## Requirements

- `pointTypes` is required, non-empty, and contains unique values from `end`, `c1`, and `c2`.
- Resolution is deterministic and path-order based.
- Within each segment, point order follows the existing parser `availablePoints` order.
- The selector matches only editable points exposed by the current `M/m`, `L/l`, `C/c`, `Q/q`, and `Z/z` parser boundary.
- Empty matches fail before snapshot/write.
- `set_absolute` and `set_relative` target counts are checked after selector resolution.
- Validation failures must not write `current.svg`, history, operation logs, operation-diff artifacts, or trigger Inkscape refresh.
- Successful writes preserve the target path id and object tree, snapshot first, write diagnostics/log entries through the existing tool path, and direct-sync the active Inkscape window with `object-set-attribute:d`.
- Existing selector shapes remain compatible.

## Non-Goals

- No GUI node selection support.
- No cross-path selection.
- No lasso/polygon selection.
- No unsupported path command expansion.
- No changes to automatic refresh mechanics beyond preserving the existing direct `d` attribute sync behavior.

## Verification

- Schema tests accept `point_type` selectors and reject empty, duplicate, or invalid point type arrays.
- Schema tests defer set-transform target count validation for `point_type` selectors until selector resolution.
- Core tests prove path-order selection, parser point-order selection, relative command handling, and `set_relative` behavior.
- Core tests prove empty matches and target-count mismatches fail before returning a mutated SVG.
- Tool-level tests prove successful transforms snapshot/log/write diagnostics and use direct active-window `d` sync.
- Tool-level tests prove invalid selectors leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
