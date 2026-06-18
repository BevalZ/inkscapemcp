# Phase 1 Relative Path-Node Query

## Goal

Extend the read-only path-node inspection surface with `normalize: "relative"` so agents can inspect editable path points in segment-base-relative coordinates without mutating SVG.

This is a Phase 1 richer query and path editing reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` Workstreams 5 and 6. It complements the existing raw and absolute path-node views and supports later precise editing decisions.

## Scope

Extend:

```json
query_path_nodes({ "docId": "doc", "elementId": "path", "normalize": "relative" })
```

and document-wide:

```json
query_document({
  "docId": "doc",
  "includePathNodes": true,
  "pathNodeNormalize": "relative"
})
```

## Requirements

- `normalize` accepts `"none"`, `"absolute"`, or `"relative"` for `query_path_nodes`.
- `pathNodeNormalize` accepts `"none"`, `"absolute"`, or `"relative"` for document-wide path node queries.
- Relative normalized points are expressed relative to the segment base point used by the path parser.
- Existing raw `segments` remain unchanged for compatibility.
- Existing absolute normalization remains unchanged.
- Read-only behavior is preserved: no `current.svg` writes, no snapshots, no metadata writes, no operation logs, no operation-diff artifacts, and no Inkscape refresh.
- Unsupported path data remains reported through existing structured path query errors or warnings.

## Non-Goals

- No path mutation.
- No edit-side behavior changes.
- No support for additional path commands.
- No renderer-derived geometry or curve sampling.
- No implicit conversion of SVG `d` data to relative commands.

## Verification

- Schema tests accept `normalize: "relative"` and `pathNodeNormalize: "relative"`.
- Schema tests reject unsupported normalization values.
- Core tests prove relative normalized points are segment-base-relative for absolute and relative commands.
- Tool-level tests prove relative query output is returned without snapshots, operation logs, or Inkscape refresh.
- Document-wide query tests prove compact/full relative summaries work and unsupported paths still surface warnings rather than whole-query failure.
- README and `.trellis/spec/backend/roadmap-memory.md` document the contract.
