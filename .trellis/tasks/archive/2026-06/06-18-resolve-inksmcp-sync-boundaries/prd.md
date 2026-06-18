# Resolve Remaining InkSMCP Sync Boundaries

## Goal

Resolve the remaining InkSMCP synchronization and precision-editing boundaries by implementing the recommended options in small, verifiable rounds until no uncertain boundary remains undocumented or unimplemented by design.

## What I Already Know

- The server is a local, single-user stdio MCP server that keeps workspace SVG files authoritative by default.
- Bidirectional GUI sync already exists through `connect_inkscape_window`, `pull_gui_state`, and the Inkscape companion extension.
- Existing bidirectional sync validates connection id, document id, SVG marker identity, revision, and content hash.
- Existing write tools pre-pull active bidirectional GUI state before mutating workspace SVG.
- Existing automatic GUI refresh uses active-window attribute sync or the companion extension, not `file-rebase` by default.
- Completed gaps in this task so far include multi-window identity, explicit background polling, richer conflict reports, conservative non-overlap three-way merge foundations, semantic object re-identification reports, controlled external import/export, bitmap vectorization quality-loop foundations, and GUI automation diagnostic fallback.
- Remaining gaps are limited to deeper future improvements, not unresolved boundary decisions in the original 1-7 recommendation set.

## Requirements

- Add multi-window identity using `docId + connectionId + runtimeDocumentId + windowId`.
- Reject identity ambiguity instead of guessing the active Inkscape window.
- Add explicit lightweight polling tools for bidirectional connections:
  - `start_gui_sync_polling`
  - `stop_gui_sync_polling`
  - `get_gui_sync_status`
- Keep polling disabled by default and active only after an explicit tool call.
- Prevent overlapping GUI pulls for the same polling connection.
- Record polling failures in status instead of crashing the server.
- Return structured conflict reports when GUI pulls detect workspace-vs-baseline conflicts.
- Add conservative non-overlap three-way SVG merge behind an explicit conflict policy.
- Add read-only semantic object re-identification reports for objects whose ids changed after GUI edits.
- Add controlled local SVG import and explicit external export tools.
- Add bitmap vectorization artifact generation and PNG render-diff quality metrics.
- Add read-only GUI integration diagnostics as diagnostic fallback only.
- Preserve the current workspace confinement and snapshot-before-write rules.
- Document later rounds and leave remaining boundaries explicit after each implementation round.

## Acceptance Criteria

- [x] `connect_inkscape_window` accepts and persists `windowId`.
- [x] SVG metadata marker and GUI pull manifest identity validation include `windowId` when present.
- [x] A mismatched `windowId` produces `SYNC_IDENTITY_MISMATCH`.
- [x] Polling can be started, inspected, and stopped through MCP tools.
- [x] Polling repeatedly invokes GUI pull for an active bidirectional connection without overlapping pulls.
- [x] Polling errors are visible through status.
- [x] `pull_gui_state` conflict failures expose a machine-readable conflict report.
- [x] `pull_gui_state` supports `conflictPolicy: "merge_non_overlapping"` for conservative non-overlap three-way merges.
- [x] `query_document` can emit semantic fingerprints and ranked match candidates without mutating SVG.
- [x] `import_svg_document` imports local SVG files as workspace copies.
- [x] `export_document_external` writes exports to explicit local output directories.
- [x] `vectorize_bitmap` runs allowlisted vectorizer engines and writes separate SVG artifacts.
- [x] PNG render-diff metrics are available when source and rendered outputs are comparable.
- [x] `diagnose_inkscape_gui` reports GUI integration state without mutating SVG or using mouse/keyboard automation.
- [x] Typecheck, test, build, and extension self-test pass.

## Recommended Decisions

1. Multi-window identity: use `docId + runtimeDocumentId + windowId + connectionId`.
2. Auto reverse sync: use an explicit lightweight polling daemon, disabled by default.
3. Conflict handling: implement structured conflict reports first, then conservative non-overlap three-way DOM merge.
4. Semantic re-identification: use `id + bbox + path hash + style fingerprint + ancestry` in a later round.
5. Bitmap vectorization: use VTracer/Potrace plus render-diff scoring in a later round.
6. External import/export: use explicit controlled import/export APIs in a later round.
7. GUI automation: keep mouse/keyboard automation as diagnostic fallback only.

## Technical Approach

Round 1 implemented the sync foundation:

- Extended schemas, connection sidecars, SVG markers, extension config, and GUI pull manifests with optional `windowId` and `runtimeDocumentId`.
- Validated `windowId` / `runtimeDocumentId` consistently when a connection supplies them.
- Added polling state in-process in the MCP server context. Polling calls reuse `pull_gui_state` with `conflictPolicy: "reject"` and a configurable interval.
- Added status objects with counters, timestamps, and the last structured error.
- Added conflict-report helpers so rejected pulls include baseline, current workspace metadata, candidate GUI metadata, id diff, and policy suggestions.

Round 2 implemented conservative merge foundations:

- Saved connection baseline SVGs beside connection sidecars.
- Added `conflictPolicy: "merge_non_overlapping"`.
- Added `src/core/svg-merge.ts` for explicit-id non-overlap merging.
- Rejected overlapping element changes, reparenting, missing parents, and concurrent adds with the same id.

Round 3 implemented semantic re-identification foundations:

- Added `src/core/semantic-fingerprint.ts`.
- Added read-only `query_document` fields:
  - `includeFingerprints`
  - `matchElementFingerprint`
  - `matchLimit`
- Ranked candidates by id, type, parent chain, sibling index, attribute/style hash, geometry/path hash, text hash, and approximate bounding box.
- Kept id rewrite and automatic object remapping out of scope.

Round 4 implemented controlled file boundaries:

- Added `import_svg_document`.
- Added `export_document_external`.
- Rejected remote, URI, UNC, and non-SVG imports.
- Kept original external source files immutable by editing workspace copies only.

Round 5 implemented vectorization quality-loop foundations:

- Added `src/adapters/vectorizer.ts`.
- Added `src/core/png-diff.ts`.
- Added `vectorize_bitmap`.
- Allowed only `vtracer` and `potrace` engines.
- Wrote vectorized output as separate review artifacts under `workspace/drawings/{docId}/vectorized/`.
- Added PNG render-diff metrics for comparable PNGs.

Round 6 implemented GUI automation diagnostic fallback:

- Added `diagnose_inkscape_gui`.
- Inspects binary availability, user data directory, extension directory, and extension install state.
- Keeps mouse/keyboard automation out of the primary path.

Later rounds can deepen these foundations:

- Automatic id repair/remapping using semantic candidates.
- Broader structural merge beyond same-id non-overlap cases.
- Multi-pass vectorizer parameter search and editable vector structure optimization.
- Optional screenshot-based GUI diagnostics if plugin/action paths cannot prove visible behavior.

## Out Of Scope For Round 1

- Broad automatic three-way DOM merge beyond conservative same-id non-overlap cases.
- Semantic object re-identification.
- Raster vectorization.
- Controlled external import/export.
- Mouse/keyboard GUI automation.
- Arbitrary Inkscape actions.
- HTTP transport or database persistence.

## Definition Of Done

- Tests added or updated for the changed sync contracts.
- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- `python inkscape-extension/inksmcp_pull.py --self-test` passes.
- README/spec notes updated for user-facing tool and behavior changes.

## Remaining Boundary Register

- Background polling: implemented.
- Multi-window sync identity: implemented.
- Conflict report: implemented.
- Three-way SVG DOM merge: conservative non-overlap foundation implemented; broad semantic/structural merge remains unresolved.
- Semantic object re-identification: read-only candidate reports implemented; automatic id repair/remapping remains unresolved.
- Raster vectorization and render-diff quality loop: foundation implemented; near-1:1 automatic multi-pass tuning and editable structure optimization remain unresolved.
- Controlled external import/export: implemented for local SVG import and explicit external export; directory sync and remote sources remain out of scope by design.
- GUI automation diagnostics: read-only integration diagnostics implemented; screenshot/mouse-keyboard automation remains out of scope by design unless explicitly requested for diagnosis.

## Technical Notes

- Relevant runtime files:
  - `src/tools/sync.ts`
  - `src/tools/context.ts`
  - `src/core/validation.ts`
  - `src/core/sync-metadata.ts`
  - `src/adapters/workspace.ts`
  - `src/adapters/inkscape-cli.ts`
  - `src/server.ts`
  - `inkscape-extension/inksmcp_pull.py`
- Relevant tests:
  - `tests/sync.test.ts`
  - `tests/inkscape-extension.test.ts`
- Workspace writes must remain confined under `INKSMCP_WORKSPACE` or `./workspace`.
- Extension writes GUI state only to `workspace/gui-pull/`, never directly to `workspace/drawings/{docId}/current.svg`.
