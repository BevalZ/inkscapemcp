# InkSMCP Roadmap Memory

> Persistent project memory for the recommended three-phase roadmap toward precise Inkscape operation coverage and near-1:1 bitmap vectorization.

## Scope

This document is the short, durable memory entry. Detailed phase plans live in:

- `docs/roadmap/phase-1-stabilize-foundations.md`
- `docs/roadmap/phase-2-advanced-svg-inkscape-workflows.md`
- `docs/roadmap/phase-3-near-1-1-vectorization.md`

Debug and hardening loop plans live in:

- `docs/roadmap/debug-hardening-phase-1.md`
- `docs/roadmap/debug-hardening-phase-2.md`
- `docs/roadmap/debug-hardening-phase-3.md`

Future agents should read this memory before proposing or implementing major InkSMCP roadmap work.

## Guiding Decision

Recommended path:

1. Stabilize the current synchronization, refresh, query, path editing, diff, and recovery foundations.
2. Expand into advanced SVG and Inkscape workflows through typed tools and allowlisted actions.
3. Build near-1:1 vectorization as an artifact-first quality loop with visual scoring and editability optimization.

Do not skip directly to broad vectorization or arbitrary GUI automation. The project should keep workspace confinement, snapshot-before-write, explicit bidirectional sync, and same-window refresh as its core safety boundaries.

## Scenario: Three-Phase Advanced InkSMCP Roadmap

### 1. Scope / Trigger

- Trigger: planning or implementing significant InkSMCP capability expansion beyond the current sync-boundary work.
- Scope: MCP tools, workspace artifacts, Inkscape companion extension behavior, vectorization workflows, and project documentation.
- Out of scope by default: arbitrary shell execution, arbitrary Inkscape action execution, default `file-rebase`, direct extension writes to `current.svg`, remote asset download, database persistence, and HTTP transport.

### 2. Signatures

Phase 1 candidate tool families:

- identity and extension self-check
- persistent explicit GUI polling
- id repair proposal/apply
- conflict preview and stronger conservative merge
- richer query modes
- path editing reliability
- operation diff, dry-run, replay, and recovery

Phase 2 candidate tool families:

- layers and groups
- defs, gradients, patterns, markers, clips, masks, symbols
- text and fonts
- local raster asset import and image placement
- transforms, bounding boxes, alignment, distribution, and z-order
- broader allowlisted Inkscape actions
- visual regression and preview comparison
- compact response modes and performance telemetry
- checkpoints and operation groups

Phase 3 candidate tool families:

- multi-pass vectorization pipeline
- SSIM, edge, alpha, and color quality metrics
- SVG editability analysis
- vector structure optimization
- segmentation and semantic reconstruction
- OCR and editable text reconstruction
- screenshot-based GUI diagnostics
- agent edit planning and verification
- human-operation capability matrix

### 3. Contracts

- Workspace SVG remains authoritative by default.
- Bidirectional GUI sync remains explicit and identity-checked.
- GUI state may become authoritative only through connected bidirectional mode and validated pull artifacts.
- Same-window refresh should run automatically after supported write operations.
- Refresh failures are warnings unless the requested operation was specifically a refresh/diagnostic operation.
- Default behavior must not use Inkscape `file-rebase`.
- The companion extension must not write directly to `workspace/drawings/{docId}/current.svg`.
- Vectorization must write reviewable artifacts first and must not replace or insert into the current document unless a separate explicit apply operation is called.
- Query and diagnostic tools must be read-only and must not snapshot, write operation logs, or refresh Inkscape unless explicitly documented.
- Heavy tools should support compact responses and resource/artifact references to reduce token use.
- Phase 1 loop 1 established compact query responses, read-only dependency summaries, operation-diff artifacts after successful writes, persisted explicit polling preferences, identity/capability summaries, and GUI diagnostic readiness/remediation output. Future loops should build on these artifacts instead of inventing parallel status or diff formats.
- Phase 1 loop 2 established `pull_gui_state` `conflictPolicy: "preview_only"`, workspace-confined `merge-previews/` artifacts, and stable merge conflict classes. Future merge/id-repair work should reuse these preview artifacts and conflict class names instead of replacing `current.svg` for review.
- Phase 1 loop 3 established read-only `diff_document_snapshots` over history snapshots, using the same structured diff engine as operation-diff artifacts with compact/full response modes. Future replay/recovery work should use this inspection contract before applying any mutation.
- Phase 1 loop 4 established `query_document({ includePathNodes: true })` as a document-wide, read-only path inspection surface. Compact mode returns counts and per-path command/point summaries; standard/full modes include the same supported segment details as `query_path_nodes`. Unsupported path data is returned as structured per-path warnings, not as whole-query failure. Future normalized path views, broader command support, path editing, and replay/recovery tools should reuse this inspection boundary instead of adding parallel parsers.
- Phase 1 loop 5 established `create_checkpoint` as an explicit recovery anchor that copies the current workspace SVG into history without changing `current.svg`, touching document metadata, producing operation diffs, or refreshing Inkscape. Checkpoints currently reuse history snapshot ids instead of introducing a parallel checkpoint store. Future `recover_document`, dry-run, replay, and operation-group tools should build on this history-based checkpoint contract.
- Phase 1 loop 6 established `recover_document` as a recovery-oriented wrapper over the snapshot-first rollback mechanics. It restores only from an explicit snapshot/checkpoint id, rejects unsafe or missing snapshot ids, preserves the active bidirectional GUI discard guard unless `confirmDiscardGuiState: true`, logs a compact recovery entry, and uses the existing structural refresh path after a successful replacement. Future strategy-based recovery should preserve these guardrails.
- Phase 1 loop 7 established `preview_svg_operations` as a read-only dry-run surface for controlled `apply_svg_operations` batches. It uses current-state read pre-pull behavior, applies operations only in memory, reuses the shared SVG diff engine, returns compact or full structured diff output, and must not write `current.svg`, metadata, history, operation logs, operation-diff artifacts, or trigger Inkscape refresh. Future replay, operation-group, and saved-preview tools should build on this envelope instead of adding a parallel preview model.
- Phase 1 loop 8 established `replay_operations` for deterministic controlled operation replay. Write mode requires an explicit `{ revision, contentHash }` baseline, pre-pulls active bidirectional GUI state before baseline comparison, rejects stale baselines before snapshot/write, rejects generated-id add operations, snapshots on success, writes operation diagnostics, logs a summary, and refreshes via the same attribute-sync or structural path as `apply_svg_operations`. Dry-run mode reuses the preview/diff envelope without workspace writes and may return stale-read warnings like other current-state read tools.
- Phase 1 loop 9 established saved operation preview artifacts under `workspace/drawings/{docId}/operation-previews/`. `preview_svg_operations` and dry-run `replay_operations` may save candidate SVG plus JSON metadata/diff when `savePreview: true`, without mutating `current.svg`, document metadata, history, operation logs, operation-diff artifacts, or Inkscape GUI state. `list_operation_previews` returns compact metadata and `read_operation_preview` returns metadata plus full diff, with SVG content included only on request. Future apply-from-preview, operation groups, retention, and resource exposure should build on this artifact identity.
- Phase 1 loop 10 established `apply_operation_preview` for explicitly applying saved operation preview artifacts. It requires `confirmApplyPreview: true`, accepts an explicit baseline or artifact baseline, rejects unguarded or stale applies before snapshot/write, pre-pulls active bidirectional GUI state before baseline comparison, snapshots before replacing `current.svg` with the candidate SVG, writes operation-diff diagnostics, appends a compact operation log, and always uses structural companion-extension refresh instead of active-window attribute sync.
- Phase 1 loop 11 established `propose_id_repairs` as a read-only id remapping proposal surface. It compares an explicit history snapshot/checkpoint to the current SVG after current-state read pre-pull, reuses semantic fingerprints and scoring, accepts only unique top candidates at or above `minConfidence`, reports low-confidence/ambiguous/no-candidate rejections when requested, and must not snapshot, update metadata, log operations, write artifacts, or refresh Inkscape.
- Phase 1 loop 12 established `apply_id_repairs` as the explicit mutation boundary for reviewed id remappings. It requires `confirmApplyRepairs: true`, applies only caller-supplied mappings, validates unsafe ids, duplicates, missing ids, and target conflicts before snapshotting, pre-pulls active bidirectional GUI state before current-state writes, rewrites conservative internal references, snapshots before save, writes operation-diff diagnostics, appends a compact operation log, and uses structural companion-extension refresh.
- Phase 1 loop 13 established read-only merge preview artifact inspection. `list_merge_previews` and `read_merge_preview` expose saved `pull_gui_state({ conflictPolicy: "preview_only" })` artifacts without GUI pre-pull, snapshots, metadata writes, operation logs, operation-diff artifacts, or Inkscape refresh. SVG content is returned only when `includeSvg: true`.
- Phase 1 loop 14 established `query_document({ includeResolvedStyle: true })` as a read-only effective SVG style summary. It resolves presentation attributes plus inline `style` declarations with inheritance and local override source tracking, supports compact and standard/full response modes, and reports unsupported stylesheet cascade, CSS variables, and `!important` as limitations instead of pretending to compute renderer CSS.
- Phase 1 loop 15 established `query_path_nodes({ normalize: "absolute" })` as an explicit read-only normalized path-node view. The default remains `normalize: "none"` for compatibility; absolute mode adds normalized segment point data derived from the existing path parser without rewriting SVG or changing edit semantics. Future document-wide normalized path summaries and edit-side normalization should reuse this contract.
- Phase 1 loop 16 established `query_document({ includePathNodes: true, pathNodeNormalize: "absolute" })` as the document-wide counterpart to the single-path normalized query. The default remains `pathNodeNormalize: "none"`; absolute mode adds token-conscious compact normalized summaries and full normalized segment point details without mutating SVG or changing unsupported-path warning behavior.
- Phase 1 loop 17 established `transform_path_points` as the first bounded transform-side path editing primitive. It translates explicit `end`/`c1`/`c2` selections on one existing path, rejects empty, duplicate, non-finite, zero, unavailable, or out-of-range point edits before writing, snapshots only after validation succeeds, logs and writes operation diagnostics, and uses direct active-window `d` attribute sync.
- Phase 1 loop 18 established `validate_path_data` as a read-only raw path preflight surface. It validates one `d` string without `docId`, returns compact command/segment/editable-point summaries on success, returns typed `ok: false` validation errors on malformed or unsupported path data, supports append-style validation with `requireMoveTo: false`, and must not touch workspace files, snapshots, logs, metadata, GUI sync, or Inkscape.
- Phase 1 loop 19 extended `transform_path_points` with `set_absolute` for exact endpoint/control-handle placement after normalized path inspection. It keeps the existing explicit point-selection boundary, maps ordered absolute target coordinates back into absolute or relative segment storage as needed, rejects selection/target mismatches before snapshot/write, and preserves the same pre-pull, snapshot, diagnostics, log, and direct `d` sync contract as translate.
- Phase 1 loop 20 extended `transform_path_points` with `set_relative` for segment-base-relative endpoint/control-handle placement. It complements raw and absolute path-node query views, stores targets directly on relative commands, maps targets to `base + target` for absolute commands, applies edits in path order, and preserves the same validation, snapshot, diagnostics, log, and direct `d` sync boundary as other point transforms.
- Phase 1 loop 21 extended `transform_path_points.pointSelector` with `{ type: "bbox" }` selection over absolute path-node coordinates. It keeps legacy explicit `{ points }` selectors valid, selects edge-inclusive `end`/`c1`/`c2` points from one existing path, rejects invalid or empty bbox selections before snapshot/write, and reuses the existing translate, `set_absolute`, `set_relative`, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 22 extended `transform_path_points.pointSelector` with `{ type: "segment_range" }` selection over inclusive path segment indexes. It keeps legacy explicit and bbox selectors valid, selects editable `end`/`c1`/`c2` points in path order, rejects invalid, out-of-range, or empty ranges before snapshot/write, and reuses the existing transform, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 23 extended `transform_path_points.pointSelector` with `{ type: "nearest" }` selection over absolute path-node coordinates. It keeps legacy explicit, bbox, and segment range selectors valid, selects exactly one editable `end`/`c1`/`c2` point by squared Euclidean distance with path-order tie-breaks, supports optional `maxDistance`, rejects no-candidate or out-of-threshold selectors before snapshot/write, and reuses the existing transform, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 24 extended `transform_path_points.pointSelector` with `{ type: "radius" }` selection over absolute path-node coordinates. It keeps legacy explicit, bbox, segment range, and nearest selectors valid, selects every editable `end`/`c1`/`c2` point within an inclusive circular distance in path order, rejects invalid or empty radius selections before snapshot/write, and reuses the existing transform, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 25 extended `transform_path_points.pointSelector` with `{ type: "segment_list" }` selection over explicit non-contiguous segment indexes. It keeps legacy explicit, bbox, segment range, nearest, and radius selectors valid, requires non-empty unique non-negative integer segment indexes, resolves selected editable `end`/`c1`/`c2` points in path order instead of caller array order, rejects out-of-range or empty matches before snapshot/write, and reuses the existing transform, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 26 extended `transform_path_points.pointSelector` with `{ type: "command" }` selection over case-sensitive supported path command names. It keeps legacy explicit, bbox, segment range, segment list, nearest, and radius selectors valid, requires non-empty unique commands from the current `M/m/L/l/C/c/Q/q/Z/z` parser set, resolves selected editable `end`/`c1`/`c2` points in path order, rejects no-match or close-path-only empty matches before snapshot/write, and reuses the existing transform, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 27 extended `transform_path_points.pointSelector` with `{ type: "point_type" }` selection over one or more required editable point kinds. It keeps legacy explicit, bbox, segment range, segment list, command, nearest, and radius selectors valid, requires non-empty unique `pointTypes`, resolves all matching `end`/`c1`/`c2` points in deterministic path order and parser `availablePoints` order, rejects empty matches before snapshot/write, and reuses the existing translate, `set_absolute`, `set_relative`, pre-pull, diagnostics, operation log, and direct `d` sync contracts after resolving the selector.
- Phase 1 loop 28 extended `transform_path_points.transform` with `{ type: "scale" }` for scaling already-resolved editable path points around an explicit absolute SVG origin. It requires finite origin coordinates and non-zero finite `sx`/`sy`, maps scaled absolute coordinates back through the existing absolute point edit machinery so relative and absolute commands keep their storage form, supports every existing selector, rejects invalid scale factors before snapshot/write, and preserves the same pre-pull, diagnostics, operation log, and direct `d` sync contracts as other point transforms.
- Phase 1 loop 29 extended `transform_path_points.transform` with `{ type: "rotate" }` for rotating already-resolved editable path points around an explicit absolute SVG origin. It requires finite origin coordinates and non-zero finite `angleDegrees`, maps rotated absolute coordinates back through the existing absolute point edit machinery so relative and absolute commands keep their storage form, supports every existing selector, rejects invalid angles before snapshot/write, and preserves the same pre-pull, diagnostics, operation log, and direct `d` sync contracts as other point transforms.
- Phase 1 loop 30 extended `transform_path_points.transform` with `{ type: "reflect" }` for mirroring already-resolved editable path points across explicit horizontal or vertical SVG axes. It requires axis values `vertical` or `horizontal`, finite origin coordinates, maps reflected absolute coordinates back through the existing absolute point edit machinery so relative and absolute commands keep their storage form, supports every existing selector, rejects invalid axes or origins before snapshot/write, and preserves the same pre-pull, diagnostics, operation log, and direct `d` sync contracts as other point transforms. Arbitrary-angle reflection remains a future extension.
- Phase 1 loop 31 extended `query_path_nodes` and `query_document({ includePathNodes: true })` with relative normalized path-node views. `normalize: "relative"` and `pathNodeNormalize: "relative"` are read-only and report editable point coordinates relative to the parser's segment base point, including for absolute commands. Raw `segments`, absolute normalization, unsupported-path warning behavior, and the no-snapshot/no-log/no-refresh query boundary remain unchanged.
- Phase 1 loop 32 extended `transform_path_points.transform` with `{ type: "skew" }` for shearing already-resolved editable path points around an explicit absolute SVG origin. It supports `axis: "x"` for horizontal shear and `axis: "y"` for vertical shear, requires finite origin and non-zero finite `angleDegrees` with a finite tangent, maps skewed absolute coordinates back through the existing absolute point edit machinery so relative and absolute commands keep their storage form, supports every existing selector, and preserves the same pre-pull, diagnostics, operation log, and direct `d` sync contracts as other point transforms.
- Phase 1 loop 33 extended `transform_path_points.transform` with `{ type: "reflect_line" }` for mirroring already-resolved editable path points across an arbitrary infinite line through an explicit absolute SVG origin. It requires finite origin coordinates and finite `angleDegrees`, accepts zero, right-angle, negative, and oblique angles, maps reflected absolute coordinates back through the existing absolute point edit machinery so relative and absolute commands keep their storage form, supports every existing selector, and preserves the same pre-pull, diagnostics, operation log, and direct `d` sync contracts as other point transforms.
- Phase 1 loop 34 extended `recover_document` with `strategy: "last_snapshot"` as the first bounded strategy-based recovery helper. It remains mutually exclusive with explicit `snapshotId`, resolves the newest history snapshot by `createdAt` with a stable id tie-break, rejects empty history before snapshot/write, preserves the active bidirectional GUI discard guard, reuses snapshot-first rollback mechanics, logs the resolved strategy and snapshot id, and uses the existing structural refresh path after successful recovery.
- Phase 1 loop 35 extended `recover_document` with `strategy: "last_successful_write"` as an undo-last-write recovery helper. It scans the document operation log from newest to oldest, selects the first successful entry with a snapshot path under the document history directory, skips malformed/error/no-snapshot/out-of-document entries, resolves the snapshot id from that pre-write snapshot, rejects missing recoverable logs before snapshot/write, preserves the active bidirectional GUI discard guard, reuses snapshot-first rollback mechanics, logs the resolved strategy and snapshot id, and uses the existing structural refresh path after successful recovery.
- Phase 1 loop 36 extended the raw editable path parser/query/edit boundary with `H/h` and `V/v` command support. `query_path_nodes`, `query_document({ includePathNodes: true })`, `edit_path_nodes`, and `transform_path_points` now expose H/V endpoints while preserving command storage form. H/h endpoints may change only when the resulting y remains representable by the horizontal command, and V/v endpoints may change only when the resulting x remains representable by the vertical command; non-representable edits reject before snapshot/write, operation logs, operation-diff artifacts, or GUI refresh.
- Phase 1 loop 37 added exact failure diagnostics to `validate_path_data`. Malformed or unsupported raw path data now reports actionable details when available, including command, command index, command token index, segment index, expected/actual/missing parameter counts, token index, source offset, and invalid text snippets. The tool remains read-only, no-`docId`, no-workspace, no-log, no-refresh, and append-style diagnostics use segment indexes local to the supplied fragment.
- Phase 1 loop 38 strengthened `diagnose_inkscape_gui` with a read-only companion extension self-check. Diagnostics now report installed file presence for both `.inx` files, `inksmcp_pull.py`, and `inksmcp-extension.json`; validate pull/push extension ids, derived active-window action ids, hidden action parameters, Python command declarations, config JSON shape, and configured `workspaceRoot`; and compare the configured root to the current MCP workspace. Missing files, stale declarations, invalid config, missing roots, and mismatched workspace roots produce structured warnings/remediation while preserving the no-snapshot/no-log/no-refresh diagnostic boundary.
- Phase 1 loop 39 added an in-process monotonic `generation` to explicit GUI sync polling. `start_gui_sync_polling` and restored persisted polling entries assign a positive runtime generation, `get_gui_sync_status` exposes it for diagnostics, and timer callbacks carry their creation generation and no-op if the current registry entry is missing, stopped, or from a newer generation. Generation is not written to `.polling.json`; it only guards the current MCP server process against stale queued callbacks after stop/restart/reload.
- Phase 1 loop 40 established `apply_merge_preview` as the explicit mutation boundary for saved GUI merge preview artifacts. It requires `confirmApplyPreview: true`, applies only artifacts under `workspace/drawings/{docId}/merge-previews/`, records/uses artifact baselines when available, rejects unguarded or stale applies before snapshot/write, pre-pulls active bidirectional GUI state before baseline comparison, snapshots before replacing `current.svg`, writes operation-diff diagnostics, appends a compact operation log, and uses structural companion-extension refresh. `list_merge_previews` and `read_merge_preview` remain read-only inspection tools.
- Phase 1 loop 41 extended `query_path_nodes`, `query_document({ includePathNodes: true })`, and `validate_path_data` with read-only `A/a` arc path command recognition. Arc segments expose raw arc parameters plus `queryPoints: ["end"]`, absolute endpoint coordinates, and absolute/relative normalized endpoint views. Loop 42 supersedes the original read-only edit boundary by making arc endpoints editable through `availablePoints: ["end"]`; arc flag validation still rejects non-0/1 large-arc and sweep flags with actionable diagnostics.
- Phase 1 loop 42 extended `edit_path_nodes`, `transform_path_points`, selector schemas, and path validation summaries with bounded `A/a` arc endpoint editing. Arc endpoints are now editable `end` points; `rx`, `ry`, `xAxisRotation`, `largeArcFlag`, and `sweepFlag` are preserved; uppercase `A` stores absolute endpoint coordinates; lowercase `a` stores segment-base-relative endpoint coordinates; and arc `c1`/`c2` selections still reject before snapshot/write. Existing write invariants remain coupled: pre-pull active bidirectional GUI state, validate before snapshot, snapshot before write, operation diff/log on success, and direct active-window `d` attribute sync after successful path data writes.
- Phase 1 loop 43 extended `query_path_nodes`, `query_document({ includePathNodes: true })`, and `validate_path_data` with read-only `S/s` smooth cubic command recognition. Smooth cubic segments expose raw `x2`, `y2`, `x`, and `y`, `queryPoints: ["c2", "end"]`, absolute/relative normalized `c2` and endpoint coordinates, and `availablePoints: []` so edit selectors continue rejecting smooth cubic paths before snapshot/write until reflection-aware mutation semantics are specified.

### 4. Validation & Error Matrix

- Ambiguous or mismatched GUI identity -> `SYNC_IDENTITY_MISMATCH`.
- Missing bidirectional connection -> `SYNC_NOT_CONNECTED`.
- Workspace-vs-GUI overlap conflict -> `SYNC_CONFLICT`.
- Unsafe or ambiguous id repair -> `INVALID_INPUT` or conflict-specific rejection.
- Unsupported path command for a path-edit tool -> `INVALID_INPUT`.
- Broken defs/reference update -> reject unless explicit confirmed policy exists.
- Remote, URI, or UNC asset import -> `INVALID_INPUT`.
- Unsupported or uninstalled vectorizer/OCR dependency -> explicit unavailable error.
- Metric cannot compare images -> non-comparable result with reason, not false success.
- Inkscape unavailable for Inkscape-backed operations -> `INKSCAPE_UNAVAILABLE`.
- Inkscape timeout -> `INKSCAPE_TIMEOUT`.
- Inkscape non-zero exit -> `INKSCAPE_FAILED`.

### 5. Good/Base/Bad Cases

- Good: improve color, position, path nodes, layer placement, or defs through in-place typed tools and automatic same-window refresh.
- Good: generate vectorization candidates as separate artifacts, score them, optimize structure, then explicitly apply the chosen candidate.
- Good: use screenshot diagnostics only to explain visible GUI mismatch.
- Base: an advanced operation cannot be represented safely; return a clear unsupported error and leave SVG unchanged.
- Base: a vectorizer dependency is missing; report dependency configuration and leave workspace state unchanged.
- Bad: call `replace_document_svg` for ordinary color/path/layer edits.
- Bad: expose arbitrary Inkscape action strings to an agent.
- Bad: use mouse/keyboard automation as the primary edit path.
- Bad: silently overwrite unsaved GUI changes without a validated pre-pull.

### 6. Tests Required

- Identity handshake and extension capability tests.
- Polling lifecycle, persistence, backoff, and no-overlap tests.
- Id repair proposal, ambiguity rejection, and explicit apply tests.
- Merge preview and conflict class tests.
- Query compact/full response tests.
- Path round-trip and unsupported-command tests.
- Defs dependency and reference repair tests.
- Layer/group/text/asset/transform tool tests.
- Inkscape-backed action integration tests with clear skip paths.
- Preview comparison and image metric tests.
- Vectorization pipeline artifact and scoring tests.
- Structure optimization visual-delta tests.
- OCR and screenshot diagnostic read-only tests where dependencies are available.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not make vectorization destructive by default.
await replaceDocumentSvg({ docId, svg: tracedSvg, confirmFullDocumentReplacement: true });
```

#### Correct

```typescript
const candidates = await vectorizeBitmapPipeline({ docId, sourcePath, maxCandidates: 8 });
const best = await scoreVectorCandidate({ docId, sourceImagePath: sourcePath, candidateSvgPath: candidates[0].svgPath, metrics: ["ssim", "edge"] });
// A separate explicit apply/insert operation is required after review.
```

#### Wrong

```typescript
// Do not forward arbitrary actions.
await runInkscapeAction({ docId, action: userSuppliedAction });
```

#### Correct

```typescript
await runAction({ docId, action: "path_simplify", elementIds });
```

Only allowlisted action enum values may reach the Inkscape adapter.

## Scenario: Saved Operation Preview Apply Contract

### 1. Scope / Trigger

- Trigger: applying a saved dry-run operation preview artifact to `workspace/drawings/{docId}/current.svg`.
- Scope: `apply_operation_preview` and operation preview artifacts produced by `preview_svg_operations` or dry-run `replay_operations`.
- Out of scope: operation groups, apply-all, preview retention/deletion, cross-document apply, applying unsaved preview payloads, arbitrary SVG replacement, and active-window attribute sync.

### 2. Signatures

- Tool: `apply_operation_preview({ docId, previewId, baseline?, confirmApplyPreview, responseMode? })`
- `baseline`: `{ revision: number, contentHash: string }`
- `responseMode`: `"compact" | "full"`, default `"compact"`

### 3. Contracts

- `confirmApplyPreview` must be `true` before any GUI pre-pull or write work begins.
- The artifact must exist under the requested document's `operation-previews/` directory and its metadata `docId` / `previewId` must match the request.
- The artifact must be a dry-run preview from `preview_svg_operations` or `replay_operations`.
- Baseline selection is `explicit baseline` when supplied, otherwise `artifact baseline`.
- If both explicit and artifact baselines exist, they must match each other and the current document metadata.
- If neither baseline exists, reject rather than applying an unguarded preview.
- Active bidirectional GUI state must be pre-pulled before comparing the selected baseline to current metadata.
- Baseline rejection must happen before snapshot/write, including inside the write lock through a pre-snapshot guard.
- Successful apply snapshots current SVG first, replaces `current.svg` with the candidate SVG, updates metadata, writes an operation-diff artifact, appends a compact operation log entry, and triggers structural companion-extension refresh.
- Compact responses return summary counts plus added/removed/changed ids. Full responses include the structured diff.

### 4. Validation & Error Matrix

- Missing `confirmApplyPreview: true` -> `INVALID_INPUT`, no pre-pull and no write.
- Unsafe or missing `previewId` -> `INVALID_INPUT` or `DOC_NOT_FOUND`, no write.
- Artifact metadata `docId` / `previewId` mismatch -> `INVALID_INPUT`, no write.
- Missing explicit and artifact baseline -> `INVALID_INPUT`, no write.
- Explicit baseline differs from artifact baseline -> `INVALID_INPUT`, no write.
- Selected baseline differs from current metadata after pre-pull -> `SYNC_CONFLICT`, no snapshot/write.
- Companion extension refresh failure after a successful write -> warning only; keep `current.svg` authoritative.

### 5. Good/Base/Bad Cases

- Good: dry-run `replay_operations` saves a baseline-protected preview, then `apply_operation_preview` applies it with confirmation, snapshots, logs, writes diagnostics, and refreshes the GUI structurally.
- Base: an older `preview_svg_operations` artifact has no baseline; callers may still apply it only by supplying an explicit current baseline.
- Bad: applying a preview artifact by calling `replace_document_svg` or by passing the candidate SVG through an unguarded raw write.
- Bad: using active-window attribute sync for apply-preview, because the saved artifact is a candidate document replacement rather than a known set of existing-object attribute updates.

### 6. Tests Required

- Missing confirmation rejects before GUI pre-pull and leaves workspace state unchanged.
- Unsafe or missing preview ids reject without workspace changes.
- Unguarded preview artifacts reject unless an explicit baseline is supplied.
- Explicit baseline and artifact baseline mismatch rejects.
- Stale current metadata rejects before snapshot/write.
- Successful compact apply snapshots, writes `current.svg`, updates metadata, writes operation-diff diagnostics, logs `apply_operation_preview`, triggers companion refresh, and omits full diff arrays.
- Full mode includes the structured diff from the shared diff engine.
- Active bidirectional GUI state is pre-pulled before baseline comparison.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replaceDocumentSvg({
  docId,
  svg: previewArtifact.svg,
  confirmFullDocumentReplacement: true,
});
```

#### Correct

```typescript
await applyOperationPreview({
  docId,
  previewId,
  confirmApplyPreview: true,
  baseline: { revision, contentHash },
});
```

Use the apply-preview tool so artifact identity, bidirectional pre-pull, stale baseline rejection, snapshot-first write, operation diagnostics, and structural refresh all run through one guarded path.

## Scenario: Id Repair Proposal Contract

### 1. Scope / Trigger

- Trigger: proposing likely element id remappings after ids changed or disappeared between a known baseline snapshot and current workspace SVG.
- Scope: `propose_id_repairs` and the semantic fingerprint scoring it reuses.
- Out of scope: applying repairs, proposal artifact persistence, automatic id rewriting, dependency/reference rewrites, visual scoring, and cross-document repair.

### 2. Signatures

- Tool: `propose_id_repairs({ docId, baselineSnapshotId, minConfidence?, includeRejected?, responseMode?, skipPrePull?, allowStaleRead? })`
- `minConfidence`: integer `1..200`, default `70`.
- `responseMode`: `"compact" | "full"`, default `"compact"`.

### 3. Contracts

- The tool is read-only: it must not create snapshots, update metadata, append operation logs, create operation-diff artifacts, save preview/proposal artifacts, or refresh Inkscape.
- `baselineSnapshotId` is required and must resolve through the existing history snapshot reader under `workspace/drawings/{docId}/history/`.
- Active bidirectional GUI state is pre-pulled through current-state read semantics before reading and comparing current SVG.
- Baseline ids missing from current SVG are matched only against current ids that did not exist in the baseline.
- Matching reuses semantic fingerprints and scoring signals: type, geometry, attributes, style, text, parent chain, sibling index, and approximate bbox.
- A proposal is accepted only when the top candidate score is at least `minConfidence` and no other candidate has the same top score.
- Rejected proposals are classified as `low_confidence`, `ambiguous_top_score`, or `no_candidate`.
- Compact mode returns summary counts and accepted proposal summaries without full fingerprint payloads.
- Full mode returns candidate and fingerprint details. `includeRejected` controls whether rejected proposal details are returned.

### 4. Validation & Error Matrix

- Unsafe `baselineSnapshotId` -> `INVALID_INPUT`, no write.
- Missing `baselineSnapshotId` file -> `DOC_NOT_FOUND`, no write.
- Active bidirectional pre-pull failure with stale reads disallowed -> sync/InkScape error, no write.
- Active bidirectional pre-pull failure with `allowStaleRead: true` -> stale-read warning and current workspace comparison.
- Top score below `minConfidence` -> rejected proposal with `low_confidence`.
- More than one top candidate with the same score -> rejected proposal with `ambiguous_top_score`.
- No current candidate with positive score -> rejected proposal with `no_candidate`.

### 5. Good/Base/Bad Cases

- Good: baseline has `body`, current has equivalent `renamed-body`; the tool returns one accepted proposal with evidence reasons and no workspace mutation.
- Base: current has two equally plausible renamed bodies; the tool returns an ambiguous rejection for later human/agent review.
- Bad: automatically rewriting ids from proposal output without an explicit future `apply_id_repairs` tool.
- Bad: matching missing baseline ids against unchanged current ids that already existed in the baseline.

### 6. Tests Required

- Core proposal test for strong renamed-id matches.
- Core proposal test for low-confidence threshold rejection.
- Core proposal test for tied top candidate ambiguity.
- Tool test proving compact response omits full fingerprints/candidates.
- Tool test proving full response includes candidate evidence/fingerprints.
- Tool test proving `includeRejected` controls rejected output.
- Tool test proving unsafe/missing snapshot ids reject without mutation.
- Tool test proving bidirectional pre-pull happens before current comparison.
- Tool test proving no snapshots, metadata changes, logs, operation diffs, preview artifacts, or refresh calls occur.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not repair ids directly from semantic matches.
await replaceAttributeValues({
  docId,
  replacements: [{ attributeNames: ["id"], from: "renamed-body", to: "body" }],
});
```

#### Correct

```typescript
const proposals = await proposeIdRepairs({
  docId,
  baselineSnapshotId,
  minConfidence: 70,
  includeRejected: true,
});
```

Use proposal output for review and planning only. A future `apply_id_repairs` tool must own snapshot-first mutation, id conflict policy, and dependency/reference rewrites.

## Scenario: Id Repair Apply Contract

### 1. Scope / Trigger

- Trigger: applying reviewed element id remappings to the current workspace SVG after proposal, human, or agent review.
- Scope: `apply_id_repairs` and conservative internal reference rewrite for repaired ids.
- Out of scope: automatic proposal selection, proposal artifact persistence, cross-document repair, broad dependency graph normalization, visual scoring, and non-reject conflict policies.

### 2. Signatures

- Tool: `apply_id_repairs({ docId, repairs, confirmApplyRepairs, responseMode? })`
- Repair: `{ fromElementId, toElementId, confidence?, reasons? }`
- `fromElementId` is the desired repaired id.
- `toElementId` is the current element id to rename.
- `responseMode`: `"compact" | "full"`, default `"compact"`.

### 3. Contracts

- `confirmApplyRepairs` must be `true` before any GUI pre-pull or write work begins.
- The tool applies only caller-supplied repairs. It must not select proposals automatically.
- Active bidirectional GUI state must be pre-pulled through current-state write semantics before validating the current SVG for mutation.
- Validation must happen before snapshot creation and reject unsafe ids, the reserved InkSMCP metadata id, duplicate `fromElementId`, duplicate `toElementId`, self-repairs, missing current ids, duplicate current ids, and target id conflicts.
- Successful apply renames each current `toElementId` element to `fromElementId`.
- Successful apply rewrites conservative internal references from old ids to new ids, including `url(#id)`, `href="#id"`, `xlink:href="#id"`, `aria-labelledby`, and `aria-describedby`.
- Successful apply snapshots current SVG first, writes the repaired SVG, updates metadata, writes an operation-diff artifact when possible, appends a compact operation log entry, and triggers structural companion-extension refresh.
- Compact mode returns summary counts, applied repair summaries, repaired ids, rewritten reference count, and changed ids.
- Full mode also returns the structured diff from the shared diff engine.

### 4. Validation & Error Matrix

- Missing `confirmApplyRepairs: true` -> `INVALID_INPUT`, no pre-pull and no write.
- Unsafe id or reserved InkSMCP metadata id -> `INVALID_INPUT`, no snapshot/write.
- Duplicate `fromElementId` or `toElementId` -> `INVALID_INPUT`, no snapshot/write.
- `fromElementId === toElementId` -> `INVALID_INPUT`, no snapshot/write.
- Missing or duplicate current `toElementId` -> `INVALID_INPUT`, no snapshot/write.
- Existing unrelated `fromElementId` -> `ID_CONFLICT`, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.
- Companion extension refresh failure after successful write -> warning only; keep `current.svg` authoritative.

### 5. Good/Base/Bad Cases

- Good: current has `renamed-body`, caller confirms `{ fromElementId: "body", toElementId: "renamed-body" }`; the tool restores `id="body"`, rewrites internal references, snapshots, logs, writes diagnostics, and refreshes structurally.
- Base: caller supplies a mapping whose target id already exists; reject with `ID_CONFLICT` and leave workspace state unchanged.
- Bad: calling `apply_id_repairs` directly with unreviewed proposal output in a loop that auto-applies every candidate.
- Bad: changing ids through generic attribute replacement, which would skip pre-pull, conflict policy, reference rewrite, and id-repair-specific diagnostics.

### 6. Tests Required

- Missing confirmation rejects before GUI pre-pull and leaves workspace state unchanged.
- Invalid, duplicate, self, missing, and conflicting repairs reject without creating snapshots or writing logs.
- Core apply test proves id rename and internal reference rewrites.
- Successful tool apply snapshots, writes `current.svg`, updates metadata, writes operation-diff diagnostics, logs `apply_id_repairs`, and triggers structural companion refresh.
- Compact mode omits full diff arrays.
- Full mode includes structured diff arrays.
- Active bidirectional GUI state is pre-pulled before current ids are validated for mutation.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replaceAttributeValues({
  docId,
  replacements: [{ attributeNames: ["id"], from: "renamed-body", to: "body" }],
});
```

#### Correct

```typescript
await applyIdRepairs({
  docId,
  repairs: [{ fromElementId: "body", toElementId: "renamed-body" }],
  confirmApplyRepairs: true,
});
```

Use the apply tool so confirmation, bidirectional pre-pull, conflict validation, reference rewrite, snapshot-first write, operation diagnostics, and structural refresh stay coupled.

## Scenario: Merge Preview Artifact Inspection Contract

### 1. Scope / Trigger

- Trigger: inspecting saved GUI merge preview artifacts after `pull_gui_state({ conflictPolicy: "preview_only" })`.
- Scope: `list_merge_previews`, `read_merge_preview`, and `workspace/drawings/{docId}/merge-previews/` artifacts.
- Out of scope: applying merge previews from the read/list tools, deleting/pruning artifacts, saving merge previews outside GUI pull preview mode, cross-document reads, and changing merge conflict classes.

### 2. Signatures

- Tool: `list_merge_previews({ docId })`
- Tool: `read_merge_preview({ docId, previewId, includeSvg? })`
- `includeSvg`: boolean, default `false`.

### 3. Contracts

- Both tools are read-only: no GUI pre-pull, snapshots, metadata updates, operation logs, operation-diff artifacts, connection baseline updates, or Inkscape refresh.
- `list_merge_previews` returns compact artifact metadata and never includes SVG content.
- `read_merge_preview` returns compact metadata and includes SVG content only with `includeSvg: true`.
- `previewId` must resolve only under `workspace/drawings/{docId}/merge-previews/`.
- Artifact metadata paths must match the requested document and preview id.
- SVG content must parse and pass the normal full-SVG safety validation before being returned.
- The artifact identity must remain compatible with future apply-from-merge-preview tools.

### 4. Validation & Error Matrix

- Unsafe `previewId` -> `INVALID_INPUT`, no read outside workspace.
- Missing metadata or SVG artifact -> `DOC_NOT_FOUND`, no mutation.
- Metadata preview id/path mismatch -> `INVALID_INPUT`.
- Malformed or unsafe stored SVG -> normal SVG validation error.

### 5. Good/Base/Bad Cases

- Good: `pull_gui_state` preview mode writes a `previewable` artifact; a later agent calls `list_merge_previews`, then `read_merge_preview({ includeSvg: true })` to inspect the candidate.
- Base: no merge preview directory exists; `list_merge_previews` returns an empty list.
- Bad: reading a merge preview triggers GUI pre-pull or refresh.
- Bad: applying a merge preview by feeding its SVG into `replace_document_svg`.

### 6. Tests Required

- List saved merge preview artifacts without SVG payloads.
- Read metadata-only and with-SVG variants.
- Unsafe or missing preview ids reject without workspace mutation.
- Read/list do not call GUI pre-pull or refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
const svg = await readFile(userSuppliedPath, "utf8");
```

#### Correct

```typescript
const preview = await readMergePreview({
  docId,
  previewId,
  includeSvg: true,
});
```

Use the artifact reader so preview identity, workspace confinement, and SVG validation stay enforced.

## Scenario: Merge Preview Apply Contract

### 1. Scope / Trigger

- Trigger: applying a saved GUI merge preview artifact after review.
- Scope: `apply_merge_preview` and artifacts produced by `pull_gui_state({ conflictPolicy: "preview_only" })`.
- Out of scope: automatic merge expansion, applying unsaved SVG payloads, cross-document apply, artifact deletion/pruning, and active-window attribute sync.

### 2. Signatures

- Tool: `apply_merge_preview({ docId, previewId, baseline?, confirmApplyPreview, responseMode? })`
- `baseline`: `{ revision: number, contentHash: string }`
- `responseMode`: `"compact" | "full"`, default `"compact"`.

### 3. Contracts

- `confirmApplyPreview` must be `true` before any GUI pre-pull or write work begins.
- The artifact must resolve only under `workspace/drawings/{docId}/merge-previews/`.
- Metadata `previewId`, `docId` when present, `svgPath`, and `metadataPath` must match the requested document and preview id.
- Baseline selection is explicit baseline when supplied, otherwise artifact baseline.
- If both explicit and artifact baselines exist, they must match each other and current metadata.
- If neither baseline exists, reject rather than applying an unguarded preview.
- Active bidirectional GUI state must be pre-pulled before comparing the selected baseline to current metadata.
- Baseline rejection must happen before snapshot/write, including inside the write lock.
- Successful apply snapshots current SVG first, replaces `current.svg` with the candidate SVG, updates metadata as an MCP write, writes an operation-diff artifact, appends an `apply_merge_preview` operation log entry, and triggers structural companion-extension refresh.
- Compact responses return summary counts plus changed id arrays. Full responses include the structured diff.
- Applying a merge preview must not delete, mutate, or mark the artifact as consumed.

### 4. Validation & Error Matrix

- Missing `confirmApplyPreview: true` -> `INVALID_INPUT`, no pre-pull and no write.
- Unsafe or missing `previewId` -> `INVALID_INPUT` or `DOC_NOT_FOUND`, no write.
- Artifact metadata identity mismatch -> `INVALID_INPUT`, no write.
- Missing explicit and artifact baseline -> `INVALID_INPUT`, no write.
- Explicit baseline differs from artifact baseline -> `INVALID_INPUT`, no write.
- Selected baseline differs from current metadata after pre-pull -> `SYNC_CONFLICT`, no snapshot/write.
- Companion extension refresh failure after a successful write -> warning only; keep `current.svg` authoritative.

### 5. Good/Base/Bad Cases

- Good: a `previewable` non-overlapping GUI merge artifact is reviewed, then `apply_merge_preview` applies it with confirmation, snapshots, logs, writes diagnostics, and refreshes the GUI structurally.
- Base: an older merge preview artifact has no baseline; callers may still apply it only by supplying an explicit current baseline.
- Bad: applying a merge preview by feeding its SVG into `replace_document_svg`.
- Bad: deleting the artifact immediately after apply, because later audit and replay work may need it.

### 6. Tests Required

- Missing confirmation rejects before GUI pre-pull and leaves workspace state unchanged.
- Unsafe or missing preview ids reject without workspace changes.
- Unguarded legacy preview artifacts reject unless an explicit baseline is supplied.
- Explicit baseline and artifact baseline mismatch rejects.
- Stale current metadata rejects before snapshot/write.
- Successful compact apply snapshots, writes `current.svg`, updates metadata, writes operation-diff diagnostics, logs `apply_merge_preview`, triggers companion refresh, and omits full diff arrays.
- Full mode includes the structured diff.
- Active bidirectional GUI state is pre-pulled before baseline comparison.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replaceDocumentSvg({
  docId,
  svg: mergePreview.svg,
  confirmFullDocumentReplacement: true,
});
```

#### Correct

```typescript
await applyMergePreview({
  docId,
  previewId,
  confirmApplyPreview: true,
});
```

Use the apply tool so artifact identity, bidirectional pre-pull, stale baseline rejection, snapshot-first write, operation diagnostics, and structural refresh all run through one guarded path.

## Scenario: Resolved Style Query Summary Contract

### 1. Scope / Trigger

- Trigger: querying effective style context before precise SVG edits.
- Scope: `query_document({ includeResolvedStyle: true })`.
- Out of scope: renderer-computed CSS, full selector cascade, external stylesheet resolution, CSS variables, media queries, animations, and mutating or normalizing style declarations.

### 2. Signatures

- Tool option: `query_document({ docId, elementId?, responseMode?, includeResolvedStyle: true, skipPrePull?, allowStaleRead? })`
- `responseMode`: `"compact" | "standard" | "full"`, default `"standard"`.
- Returned style sources:
  - `"inherited_attribute"`
  - `"inherited_style"`
  - `"local_attribute"`
  - `"local_style"`

### 3. Contracts

- The option is read-only: no snapshots, metadata writes, operation logs, operation-diff artifacts, preview artifacts, or Inkscape refresh.
- Current-state read pre-pull behavior is the same as other `query_document` calls for active bidirectional documents.
- The summary combines supported presentation attributes and inline style declarations.
- Local presentation attributes override inherited values; local inline style declarations override local presentation attributes.
- Each resolved property returns `value`, `source`, and `sourceElementId` when the source element has an id.
- Supported property set:
  - `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`
  - `fill-opacity`, `opacity`, `display`, `visibility`
  - `font-family`, `font-size`, `font-weight`, `font-style`, `text-anchor`
  - `clip-path`, `mask`, `filter`, `marker-start`, `marker-mid`, `marker-end`
- Compact mode returns counts plus compact style summaries and omits the full tree payload.
- Standard/full modes include detailed resolved-style summaries alongside the normal tree payload.
- Unsupported style features are warning/limitation entries, including embedded `<style>` sheets, stylesheet processing instructions or links, CSS variables, and `!important`.

### 4. Validation & Error Matrix

- Missing `docId` or invalid `responseMode` -> schema validation failure.
- Missing `elementId` target -> `INVALID_INPUT` response from `query_document`, no mutation.
- Malformed or unsafe stored SVG -> normal SVG validation error, no mutation.
- Active bidirectional pre-pull failure with stale reads disallowed -> sync/Inkscape error, no style summary.
- Active bidirectional pre-pull failure with `allowStaleRead: true` -> stale-read warning and workspace-based style summary.
- Unsupported CSS feature -> `UNSUPPORTED_STYLE_FEATURE` warning entry, not whole-query failure.

### 5. Good/Base/Bad Cases

- Good: query a text element and see `fill` from local inline style, `font-size` from local attribute, and `font-family` from a parent inline style.
- Good: compact mode reports style counts and per-element summaries without returning the full element tree.
- Base: a document contains `<style>` selector rules; return a limitation warning and still summarize presentation attributes and inline styles.
- Bad: silently treating stylesheet selector rules or CSS variables as fully resolved values.
- Bad: refreshing Inkscape or writing snapshots from a style query.

### 6. Tests Required

- Inheritance and local override behavior for attributes and inline style.
- Compact mode returns counts and omits the full tree.
- Standard/full mode includes detailed resolved style beside the tree.
- Unsupported stylesheet, CSS variable, and `!important` features are reported as warnings.
- Read-only behavior: no history snapshots and no auto-refresh calls.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not claim full computed CSS from simple XML inspection.
const computedFill = applyCssSelectorsAndVariables(svg, elementId);
```

#### Correct

```typescript
const resolvedStyle = summarizeResolvedStyles(svg, {
  targetElementId: elementId,
  compact: responseMode === "compact",
});
```

Keep this as an SVG authoring summary with explicit limitations. A future renderer-backed or stylesheet-aware inspection tool must use a separate contract.

## Scenario: Path Node Normalized Query Contract

### 1. Scope / Trigger

- Trigger: inspecting path geometry in stable absolute coordinates before precise edits.
- Scope: `query_path_nodes({ normalize: "none" | "absolute" })`.
- Out of scope: writing normalized path data, changing `edit_path_nodes`, adding arc support, path simplification, and document-wide normalized path summaries.

### 2. Signatures

- Tool: `query_path_nodes({ docId, elementId, normalize?, skipPrePull?, allowStaleRead? })`
- `normalize`: `"none" | "absolute"`, default `"none"`.

### 3. Contracts

- The tool is read-only: no snapshots, metadata writes, operation logs, operation-diff artifacts, preview artifacts, or Inkscape refresh.
- Current-state read pre-pull behavior is unchanged for active bidirectional documents.
- `normalize: "none"` preserves the existing response shape with raw segment `points` and `absolutePoints`.
- `normalize: "absolute"` adds `normalize: "absolute"` plus `normalizedSegments`.
- `normalizedSegments` preserve segment `index`, original `cmd`, `relative`, and `availablePoints`.
- `normalizedSegments[].points` contains absolute coordinates for the available endpoint/control points.
- `Z`/`z` segments remain present with no available points and an empty point map.
- The supported command boundary remains `M`, `L`, `C`, `Q`, `Z` and relative variants. Unsupported commands reject through the existing path parser.

### 4. Validation & Error Matrix

- Invalid `normalize` value -> schema validation failure.
- Missing element or non-path element -> `INVALID_INPUT`, no mutation.
- Missing `d` attribute -> `INVALID_INPUT`, no mutation.
- Unsupported path command -> `INVALID_INPUT` with the unsupported command detail, no mutation.
- Active bidirectional pre-pull failure with stale reads disallowed -> sync/Inkscape error, no query result.
- Active bidirectional pre-pull failure with `allowStaleRead: true` -> stale-read warning and workspace-based query result.

### 5. Good/Base/Bad Cases

- Good: query `M10 10 l5 1 c2 3 4 5 6 7` with `normalize: "absolute"` and receive absolute endpoints/control points while preserving raw segment details.
- Good: omit `normalize` and receive the existing response for older agents.
- Base: close-path segment appears in normalized output with no points.
- Bad: rewriting the path's `d` attribute from a query operation.
- Bad: changing edit semantics so `edit_path_nodes` silently expects normalized coordinates.

### 6. Tests Required

- Schema default accepts omitted `normalize` as `"none"` and rejects invalid values.
- Core query test proves absolute normalized output for relative `L`, `C`, `Q`, and close-path segments.
- Tool-level test proves normalized query does not call auto-refresh and does not create history snapshots.
- Existing unsupported-command tests remain green.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not normalize by rewriting source path data during a query.
element.setAttribute("d", absoluteD);
```

#### Correct

```typescript
const result = queryPathNodesInSvg(svg, {
  elementId,
  normalize: "absolute",
});
```

Keep normalization as an explicit read-side view. Later write tools must define their own coordinate contract instead of inferring mutation behavior from this query option.

## Scenario: Document Path Node Normalized Summary Contract

### 1. Scope / Trigger

- Trigger: inspecting all editable paths in stable absolute coordinates before planning multi-path edits.
- Scope: `query_document({ includePathNodes: true, pathNodeNormalize?: "none" | "absolute" })`.
- Out of scope: changing `query_path_nodes`, changing `edit_path_nodes`, writing normalized path data, adding arc support, and adding relative normalized output.

### 2. Signatures

- Tool option: `query_document({ docId, elementId?, includePathNodes: true, pathNodeNormalize?, responseMode?, skipPrePull?, allowStaleRead? })`
- `pathNodeNormalize`: `"none" | "absolute"`, default `"none"`.
- `responseMode`: `"compact" | "standard" | "full"`, default `"standard"`.

### 3. Contracts

- The option is read-only: no snapshots, metadata writes, operation logs, operation-diff artifacts, preview artifacts, or Inkscape refresh.
- Current-state read pre-pull behavior is unchanged for active bidirectional documents.
- `pathNodeNormalize` is meaningful only with `includePathNodes: true`.
- `pathNodeNormalize: "none"` preserves the existing document path-node summary shape.
- `pathNodeNormalize: "absolute"` adds `pathNodes.normalize: "absolute"`.
- Compact mode remains token-conscious and does not include full `segments` or `normalizedSegments`; it may include normalized point counts and command-to-point-name summaries.
- Standard/full modes include `normalizedSegments` beside existing raw `segments` for supported paths.
- `normalizedSegments` preserve segment `index`, original `cmd`, `relative`, `availablePoints`, and absolute point coordinates.
- Unsupported path data remains a per-path `UNSUPPORTED_PATH_DATA` warning, not a whole-query failure.

### 4. Validation & Error Matrix

- Invalid `pathNodeNormalize` value -> schema validation failure.
- `pathNodeNormalize: "absolute"` without `includePathNodes: true` -> accepted but no path-node payload is produced.
- Missing target `elementId` -> existing `query_document` `INVALID_INPUT` response, no mutation.
- Unsupported path command -> per-path `UNSUPPORTED_PATH_DATA` warning with command details, no mutation.
- Active bidirectional pre-pull failure with stale reads disallowed -> sync/Inkscape error, no query result.
- Active bidirectional pre-pull failure with `allowStaleRead: true` -> stale-read warning and workspace-based query result.

### 5. Good/Base/Bad Cases

- Good: compact document query reports which paths have relative segments and what normalized point names are available without returning full segment arrays.
- Good: standard/full document query returns raw segment details plus absolute normalized points for each supported path.
- Base: one path contains an arc; supported paths are described and the arc path is reported in warnings.
- Bad: a document query rewrites relative path commands to absolute commands in `current.svg`.
- Bad: failing the whole query because one path has unsupported data.

### 6. Tests Required

- Compact normalized document query returns normalized counts/summaries and omits `segments` / `normalizedSegments`.
- Standard/full normalized document query includes `normalizedSegments` with absolute points for relative `M/L/C/Q` data.
- Unsupported paths remain structured warnings.
- Read-only behavior: no auto-refresh and no history snapshots.
- Existing default `includePathNodes` tests remain green without specifying `pathNodeNormalize`.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not make document-wide query normalize by editing every path.
await applySvgOperations({ docId, operations: absoluteRewriteOperations });
```

#### Correct

```typescript
const result = await queryDocument({
  docId,
  includePathNodes: true,
  pathNodeNormalize: "absolute",
});
```

Keep document-wide normalization as an inspection surface. Mutation must remain in explicit path-edit tools with their own confirmation and refresh contracts.

## Scenario: Transform Path Points Translate Contract

### 1. Scope / Trigger

- Trigger: translating selected path points after inspecting path nodes through `query_path_nodes` or `query_document({ includePathNodes: true })`.
- Scope: `transform_path_points` for one existing path element in one workspace document.
- Out of scope: rotation, scaling, matrices, geometry selectors, multi-path transforms, new segment creation, path deletion, and unsupported SVG path commands.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- `pointSelector`: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- `transform`: `{ type: "translate", dx?: number, dy?: number }`
- Response includes `selectedPointCount`, `selectedPoints`, `editedSegments`, `transform`, and `changed.d.from` / `changed.d.to`.

### 3. Contracts

- The tool mutates only the target path element's `d` attribute and preserves the element id and object tree.
- Callers must select explicit segment indexes and point names; hidden global selection state is not used.
- Supported point names are exactly `end`, `c1`, and `c2`.
- Translation defaults omitted `dx` or `dy` to `0`, but at least one axis must be non-zero.
- Duplicate selected points are rejected rather than moved twice.
- Existing parser support remains `M`, `L`, `C`, `Q`, and `Z`, including relative variants.
- Active bidirectional GUI state must be pre-pulled before current-state write validation.
- Segment range, point availability, unsupported path data, and transform validation must fail before snapshot/write.
- Successful writes snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.
- Direct active-window sync failures are warnings only; the workspace SVG remains authoritative.

### 4. Validation & Error Matrix

- Empty `pointSelector.points` -> schema validation failure, no pre-pull or write.
- Duplicate `{ segmentIndex, point }` selections -> `INVALID_INPUT` or schema validation failure, no snapshot/write.
- Unsupported `transform.type` -> schema validation failure.
- Non-finite `dx` or `dy` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- `dx: 0` and `dy: 0` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Segment index out of range -> `INVALID_INPUT`, no snapshot/write.
- Point unavailable for the selected command, such as `c2` on `Q` -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: query a fish mouth path, then move the selected curve endpoint and first control point left by `dx: -2` in one call.
- Good: move endpoint selections across multiple segments by the same translate transform while returning one previous/next `d` pair.
- Base: caller needs rotation or scale; reject as out of scope until a later transform PRD defines the contract.
- Bad: selecting the same `{ segmentIndex, point }` twice and silently applying the translation twice.
- Bad: replacing the whole SVG document to move one curve handle.

### 6. Tests Required

- Schema tests accept valid translate payloads, default omitted axes to `0`, and reject empty, duplicate, zero, non-finite, or unsupported-transform inputs.
- Core tests prove multiple selected endpoints/control points translate through the existing path parser and only the target path's `d` changes.
- Core tests reject duplicate selections and unsupported path commands.
- Tool-level tests prove successful calls snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync rather than companion structural refresh.
- Tool-level tests prove invalid segment indexes or unavailable points leave `current.svg` and history unchanged.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replaceDocumentSvg({
  docId,
  svg: regeneratedSvg,
  confirmFullDocumentReplacement: true,
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    points: [
      { segmentIndex: 1, point: "c1" },
      { segmentIndex: 1, point: "end" },
    ],
  },
  transform: { type: "translate", dx: -2, dy: 1 },
});
```

Use the transform tool for explicit point movement so bidirectional pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Path Data Validation Summary Contract

### 1. Scope / Trigger

- Trigger: preflighting raw SVG path data before calling path write tools or generating path edit plans.
- Scope: `validate_path_data` for one raw `d` string.
- Out of scope: reading workspace path elements, rewriting path data, repair suggestions, persisted reports, arc editing support, and renderer-backed geometry validation.

### 2. Signatures

- Tool: `validate_path_data({ d, requireMoveTo? })`
- `d`: raw SVG path data string.
- `requireMoveTo`: boolean, default `true`.
- Success response: `ok: true`, `d`, `requireMoveTo`, `segmentCount`, `commandCounts`, `unsupportedCommandCount`, `relativeCommandCount`, `absoluteCommandCount`, `availablePointCount`, and `editablePointSummary`.
- Failure response: `ok: false`, `d`, `requireMoveTo`, and typed `error` payload. When practical, `error.details` includes `command`, `commandIndex`, `commandTokenIndex`, `segmentIndex`, `expectedParamCount`, `actualParamCount`, `missingParamCount`, `tokenIndex`, `offset`, and `invalidText`.

### 3. Contracts

- The tool is read-only and does not require `docId`.
- The tool must not read workspace files, write workspace files, snapshot, update metadata, append operation logs, pre-pull GUI state, update connection baselines, or refresh Inkscape.
- Validation reuses the existing path parser and editable path boundary.
- Successful summaries support only editable `M`, `L`, `H`, `V`, `C`, `Q`, and `Z` path commands, including relative variants.
- `requireMoveTo: true` validates complete path data and requires the first command to be `M` or `m`.
- `requireMoveTo: false` validates append-style fragments by allowing non-move first commands while keeping the same editable-command boundary for summaries.
- Expected validation failures return normal structured `ok: false` payloads from the tool handler, not thrown MCP-level errors.
- Future path linting, arc support, normalization, or repair suggestions may extend the response shape, but must preserve the no-side-effect contract.

### 4. Validation & Error Matrix

- Empty `d` -> `ok: false`, `INVALID_INPUT`, no side effects.
- Invalid characters or trailing garbage -> `ok: false`, `INVALID_INPUT`, no side effects.
- Incomplete parameter set -> `ok: false`, `INVALID_INPUT` with command, segment, token, expected/actual/missing parameter count, and source offset details when available.
- `requireMoveTo: true` and first command is not `M` or `m` -> `ok: false`, `INVALID_INPUT`.
- Unsupported editable command such as `A`, `S`, or `T` -> `ok: false`, `INVALID_INPUT` with command, segment, token, and source offset details when available.
- Invalid `requireMoveTo` type -> schema validation failure before handler execution.

### 5. Good/Base/Bad Cases

- Good: validate `M10 10 l5 1 c2 3 4 5 6 7` and receive compact command counts, zero unsupported-command count, plus editable point names for each segment.
- Good: validate `L10 10 C12 10 14 10 16 12` with `requireMoveTo: false` before `append_path_segment`.
- Base: path data includes an arc; return a typed unsupported-command failure until a later arc PRD expands the parser.
- Bad: validating a path by inserting it into a hidden workspace document.
- Bad: returning success for unsupported commands just because SVG syntax is parseable.

### 6. Tests Required

- Schema tests prove `d` is accepted without `docId`, `requireMoveTo` defaults to `true`, and empty strings reach the handler.
- Core tests prove complete and append-style path summaries include segment counts, command counts, relative/absolute counts, and editable point summaries.
- Core tests prove malformed and unsupported path data return typed `ok: false` results with segment/command/token diagnostics.
- Tool-level tests prove validation does not read/write workspace state, create history snapshots, call active-window attribute sync, or call companion refresh.
- Existing path write/edit/query tests remain green.

### 7. Wrong vs Correct

#### Wrong

```typescript
await drawPath({
  docId: "scratch",
  elementId: "probe",
  d: candidatePath,
  attributes: { fill: "none" },
});
```

#### Correct

```typescript
const result = await validatePathDataTool({
  d: candidatePath,
  requireMoveTo: true,
});
```

Use the validation tool for preflight so path generation feedback stays cheap, deterministic, and free of workspace or GUI side effects.

## Scenario: Path Point Absolute Set Transform Contract

### 1. Scope / Trigger

- Trigger: setting exact path endpoint/control-handle positions after inspecting normalized path nodes.
- Scope: `transform_path_points` with transform type `set_absolute` for one existing path element.
- Out of scope: rotation, scaling, matrix transforms, multi-path transforms, path segment creation/deletion, command normalization, and arc or shorthand command support.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- `pointSelector`: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- `transform`: `{ type: "set_absolute", points: Array<{ x: number, y: number }> }`
- The `transform.points` array maps to `pointSelector.points` by array order.
- Existing `transform: { type: "translate", dx?, dy? }` remains supported.

### 3. Contracts

- The tool mutates only the target path element's `d` attribute and preserves the element id and object tree.
- Callers must select explicit segment indexes and point names; hidden selection state is not used.
- `set_absolute` target count must match selected point count.
- Target coordinates are absolute SVG user-unit coordinates.
- Absolute commands store the target coordinates directly.
- Relative commands preserve their command case and store `target - current segment base`.
- Edits are applied in path order so later relative segments use bases derived from earlier edited endpoints.
- The response preserves caller-selected point order and returns the transform payload.
- Existing parser support remains `M`, `L`, `C`, `Q`, and `Z`, including relative variants.
- Active bidirectional GUI state must be pre-pulled before current-state write validation.
- Successful writes snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.

### 4. Validation & Error Matrix

- Empty selection -> schema validation failure, no pre-pull or write.
- Duplicate selected point -> schema validation failure, no pre-pull or write.
- Target count mismatch -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Non-finite target coordinate -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Segment index out of range -> `INVALID_INPUT`, no snapshot/write.
- Point unavailable for the selected command -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: query a fish mouth with `query_path_nodes({ normalize: "absolute" })`, then set the endpoint and first control handle to exact absolute coordinates with one `set_absolute` call.
- Good: set points on a relative curve and keep the path command relative while preserving the intended absolute visual position.
- Base: caller needs rotation or scale; reject until a later transform PRD defines that contract.
- Bad: rewriting all path commands to absolute just to set one point.
- Bad: replacing the whole SVG document to move one handle.

### 6. Tests Required

- Schema tests accept `set_absolute` and reject mismatched target counts.
- Core tests prove absolute and relative command targets land at the requested absolute coordinates without command-case rewrite.
- Core tests prove out-of-order selections still produce correct path-order relative-coordinate results.
- Tool-level tests prove successful calls snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove invalid target selections leave `current.svg` and history unchanged and do not call Inkscape refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replacePathData({
  docId,
  elementId: "mouth",
  d: normalizedAbsoluteRewrite,
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    points: [
      { segmentIndex: 1, point: "c1" },
      { segmentIndex: 1, point: "end" },
    ],
  },
  transform: {
    type: "set_absolute",
    points: [
      { x: 116, y: 36 },
      { x: 138, y: 24 },
    ],
  },
});
```

Use the point transform boundary for exact coordinate edits so validation, bidirectional pre-pull, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Path Point Relative Set Transform Contract

### 1. Scope / Trigger

- Trigger: setting selected path endpoint/control-handle positions relative to each segment's current base point after inspecting raw or normalized path nodes.
- Scope: `transform_path_points` with transform type `set_relative` for one existing path element.
- Out of scope: raw attribute point writes, rotation, scaling, matrix transforms, multi-path transforms, path segment creation/deletion, command normalization, and arc or shorthand command support.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- `pointSelector`: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- `transform`: `{ type: "set_relative", points: Array<{ x: number, y: number }> }`
- The `transform.points` array maps to `pointSelector.points` by array order.
- Existing `translate` and `set_absolute` transforms remain supported.

### 3. Contracts

- The tool mutates only the target path element's `d` attribute and preserves the element id and object tree.
- Callers must select explicit segment indexes and point names; hidden selection state is not used.
- `set_relative` target count must match selected point count.
- Target coordinates are relative to the selected segment's current base point, not raw unchecked attribute writes.
- Relative commands store the target coordinates directly.
- Absolute commands preserve command case and store `current segment base + target`.
- Edits are applied in path order so later segment bases account for earlier edited endpoints.
- The response preserves caller-selected point order and returns the transform payload.
- Existing parser support remains `M`, `L`, `C`, `Q`, and `Z`, including relative variants.
- Active bidirectional GUI state must be pre-pulled before current-state write validation.
- Successful writes snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.

### 4. Validation & Error Matrix

- Empty selection -> schema validation failure, no pre-pull or write.
- Duplicate selected point -> schema validation failure, no pre-pull or write.
- Target count mismatch -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Non-finite target coordinate -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Segment index out of range -> `INVALID_INPUT`, no snapshot/write.
- Point unavailable for the selected command -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: query a relative curve and set its raw relative endpoint/control offsets directly through `set_relative`.
- Good: set relative offsets on an absolute curve while preserving the absolute command form and writing the corresponding absolute coordinates.
- Base: caller needs absolute coordinates; use `set_absolute`.
- Bad: treating `set_relative` as an unchecked raw path-data patch that ignores segment bases.
- Bad: replacing the whole SVG document to move one handle.

### 6. Tests Required

- Schema tests accept `set_relative` and reject mismatched target counts.
- Core tests prove relative command targets are stored directly.
- Core tests prove absolute command targets are written as `base + target`.
- Core tests prove out-of-order selections still produce correct path-order relative-coordinate results.
- Tool-level tests prove successful calls snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove invalid target selections leave `current.svg` and history unchanged and do not call Inkscape refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replacePathData({
  docId,
  elementId: "mouth",
  d: manuallyPatchedD,
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    points: [
      { segmentIndex: 1, point: "c1" },
      { segmentIndex: 1, point: "end" },
    ],
  },
  transform: {
    type: "set_relative",
    points: [
      { x: 16, y: 6 },
      { x: 38, y: -6 },
    ],
  },
});
```

Use `set_relative` when the caller has segment-base-relative target coordinates and wants the same pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync guarantees as other point transforms.

## Scenario: Path Point Bbox Selector Contract

### 1. Scope / Trigger

- Trigger: selecting multiple nearby path endpoints/control handles by absolute-coordinate bounds before applying `transform_path_points`.
- Scope: one existing path element in one workspace document, using the existing `translate`, `set_absolute`, and `set_relative` transform variants.
- Out of scope: multi-path selection, renderer hit testing, stroke-outline selection, GUI selection state, mouse/keyboard automation, selection previews, segment creation/deletion, and unsupported SVG path commands.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- Legacy explicit selector: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- Explicit typed selector: `{ type?: "points", points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- Bbox selector: `{ type: "bbox", minX: number, minY: number, maxX: number, maxY: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- `pointTypes` defaults to `["end", "c1", "c2"]`.
- Response includes resolved `selectedPointCount`, `selectedPoints`, `editedSegments`, `transform`, and `changed.d.from` / `changed.d.to`.

### 3. Contracts

- Bbox coordinates are absolute SVG user-unit coordinates derived from the same path-node inspection engine as `query_path_nodes({ normalize: "absolute" })`.
- Points on bbox edges are included.
- Bbox selection is deterministic and path-order based; it must not read or depend on Inkscape GUI selection.
- The selector resolves only editable points exposed by the current path parser: `end`, `c1`, and `c2` on supported `M`, `L`, `C`, `Q`, and `Z` path commands, including relative variants.
- Legacy `{ points }` callers remain valid without adding `type: "points"`.
- After bbox resolution, transform behavior is identical to explicit selection. `set_absolute` and `set_relative` target counts must match the resolved selected point count.
- Empty bbox matches fail before snapshot/write.
- Successful writes preserve the target path element id and object tree, snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.
- Failed validation, missing path data, unsupported commands, or empty matches leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

### 4. Validation & Error Matrix

- `minX`, `minY`, `maxX`, or `maxY` non-finite -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- `minX > maxX` or `minY > maxY` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Empty `pointTypes` -> schema validation failure, no pre-pull or write.
- Bbox matches zero editable points -> `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- `set_absolute` or `set_relative` target count mismatch after bbox resolution -> `INVALID_INPUT`, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: select all mouth endpoints and first control handles in a small absolute bbox, then translate them left in one call.
- Good: select only `end` points inside a bbox and apply `set_absolute` with the same number of target points.
- Base: caller already knows exact segment indexes; use the legacy explicit `{ points }` selector.
- Bad: using current Inkscape GUI selection to decide which nodes to edit.
- Bad: replacing the whole SVG document because several nearby handles need the same transform.

### 6. Tests Required

- Schema tests accept legacy explicit selectors, typed explicit selectors, and bbox selectors with defaulted `pointTypes`.
- Schema tests reject non-finite or inverted bbox bounds and empty `pointTypes`.
- Core tests prove bbox selection uses absolute coordinates, includes edge points, supports relative path commands, and returns resolved `selectedPoints`.
- Core tests prove bbox `set_absolute` and `set_relative` reject target-count mismatches after selector resolution.
- Core tests prove empty bbox selections throw before returning a mutated SVG.
- Tool-level tests prove successful bbox transforms snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove empty bbox selections leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: getCurrentGuiNodeSelection(),
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    type: "bbox",
    minX: 108,
    minY: 32,
    maxX: 142,
    maxY: 48,
    pointTypes: ["end", "c1"],
  },
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

Use bbox selection when the caller knows an absolute SVG coordinate region but not every segment index. Resolve the selector inside `transform_path_points` so pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Path Point Segment Range Selector Contract

### 1. Scope / Trigger

- Trigger: selecting all editable endpoint/control handles on contiguous path segments before applying `transform_path_points`.
- Scope: one existing path element in one workspace document, using the existing `translate`, `set_absolute`, and `set_relative` transform variants.
- Out of scope: multi-path selection, visual-length ranges, percentage ranges, GUI selection state, renderer hit testing, segment creation/deletion, and unsupported SVG path commands.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- Legacy explicit selector: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- Existing bbox selector: `{ type: "bbox", minX: number, minY: number, maxX: number, maxY: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Segment range selector: `{ type: "segment_range", startSegmentIndex: number, endSegmentIndex: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Segment range indexes are inclusive.
- `pointTypes` defaults to `["end", "c1", "c2"]`.
- Response includes resolved `selectedPointCount`, `selectedPoints`, `editedSegments`, `transform`, and `changed.d.from` / `changed.d.to`.

### 3. Contracts

- Segment indexes are the parsed segment indexes returned by `query_path_nodes` and `query_document({ includePathNodes: true })`.
- Range selection is deterministic and path-order based; it must not read or depend on Inkscape GUI selection.
- Within each selected segment, point order follows the existing parser's `availablePoints` order.
- The selector resolves only editable points exposed by the current path parser: `end`, `c1`, and `c2` on supported `M`, `L`, `C`, `Q`, and `Z` path commands, including relative variants.
- Legacy `{ points }` and `{ type: "bbox" }` callers remain valid.
- After range resolution, transform behavior is identical to explicit selection. `set_absolute` and `set_relative` target counts must match the resolved selected point count.
- Empty range matches fail before snapshot/write.
- Successful writes preserve the target path element id and object tree, snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.
- Failed validation, missing path data, unsupported commands, out-of-range selectors, or empty matches leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

### 4. Validation & Error Matrix

- Negative or non-integer `startSegmentIndex` / `endSegmentIndex` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- `startSegmentIndex > endSegmentIndex` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Empty `pointTypes` -> schema validation failure, no pre-pull or write.
- `endSegmentIndex` beyond parsed segment count -> `INVALID_INPUT`, no snapshot/write.
- Range matches zero editable points, such as selecting only a `Z` segment with default point types -> `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- `set_absolute` or `set_relative` target count mismatch after range resolution -> `INVALID_INPUT`, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: select segments 3 through 6 of a contour and move all endpoints and first controls left in one transform.
- Good: select only `end` points from an inclusive segment range and apply exact `set_absolute` targets in resolved path order.
- Base: caller knows scattered non-contiguous points; use the legacy explicit `{ points }` selector.
- Base: caller knows a visual coordinate region but not segment indexes; use the bbox selector.
- Bad: using the current Inkscape GUI node selection to decide which range to edit.
- Bad: replacing the whole SVG document because a contiguous path section needs one transform.

### 6. Tests Required

- Schema tests accept legacy explicit, bbox, and segment range selectors with defaulted `pointTypes`.
- Schema tests reject negative, non-integer, inverted, or empty-`pointTypes` range inputs.
- Core tests prove range selection uses inclusive segment indexes, path/point order, relative path commands, and resolved `selectedPoints`.
- Core tests prove range `set_absolute` and `set_relative` reject target-count mismatches after selector resolution.
- Core tests prove out-of-range and empty range selections throw before returning a mutated SVG.
- Tool-level tests prove successful range transforms snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove empty range selections leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await replacePathData({
  docId,
  elementId: "outline",
  d: manuallyRegeneratedWholePath,
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "outline",
  pointSelector: {
    type: "segment_range",
    startSegmentIndex: 3,
    endSegmentIndex: 6,
    pointTypes: ["end", "c1"],
  },
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

Use segment range selection when the caller knows contiguous path segment indexes from `query_path_nodes`. Resolve the selector inside `transform_path_points` so pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Path Point Nearest Selector Contract

### 1. Scope / Trigger

- Trigger: selecting the single editable endpoint/control handle closest to an absolute SVG coordinate before applying `transform_path_points`.
- Scope: one existing path element in one workspace document, using the existing `translate`, `set_absolute`, and `set_relative` transform variants.
- Out of scope: multi-point nearest selection, cross-path nearest selection, renderer hit testing, stroke-outline distance, curve projection distance, GUI node selection, selection previews, segment creation/deletion, and unsupported SVG path commands.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- Legacy explicit selector: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- Existing bbox selector: `{ type: "bbox", minX: number, minY: number, maxX: number, maxY: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Existing segment range selector: `{ type: "segment_range", startSegmentIndex: number, endSegmentIndex: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Nearest selector: `{ type: "nearest", x: number, y: number, pointTypes?: Array<"end" | "c1" | "c2">, maxDistance?: number }`
- `x` and `y` are absolute SVG user-unit coordinates.
- `pointTypes` defaults to `["end", "c1", "c2"]`.
- `maxDistance`, when present, is a finite non-negative SVG user-unit distance.
- Response includes resolved `selectedPointCount: 1`, `selectedPoints`, `editedSegments`, `transform`, and `changed.d.from` / `changed.d.to`.

### 3. Contracts

- Nearest selection is computed from absolute editable path-node coordinates produced by the same parser used by `query_path_nodes({ normalize: "absolute" })`.
- The selector resolves exactly one editable point from the current path parser's supported points: `end`, `c1`, and `c2` on supported `M`, `L`, `C`, `Q`, and `Z` path commands, including relative variants.
- Distance is squared Euclidean distance from `{ x, y }` to each candidate point; square roots are needed only for threshold reporting.
- Tie-breaks are deterministic: lower segment index wins, and within a segment the existing parser `availablePoints` order wins.
- Legacy `{ points }`, `{ type: "bbox" }`, and `{ type: "segment_range" }` callers remain valid.
- After nearest resolution, transform behavior is identical to explicit one-point selection. `set_absolute` and `set_relative` must provide exactly one target point.
- A nearest selector with no candidates for the requested `pointTypes` fails before snapshot/write.
- A nearest selector whose nearest candidate is farther than `maxDistance` fails before snapshot/write.
- Successful writes preserve the target path element id and object tree, snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.
- Failed validation, missing path data, unsupported commands, no-candidate selectors, out-of-threshold selectors, or set-target mismatches leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

### 4. Validation & Error Matrix

- Non-finite `x` or `y` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Empty `pointTypes` -> schema validation failure, no pre-pull or write.
- Negative or non-finite `maxDistance` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- No editable candidate after `pointTypes` filtering -> `INVALID_INPUT`, no snapshot/write.
- Nearest candidate farther than `maxDistance` -> `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- `set_absolute` or `set_relative` target count other than one after nearest resolution -> `INVALID_INPUT`, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: query a path in absolute mode, then move the control handle nearest `{ x: 118, y: 34 }` left without manually copying segment indexes.
- Good: limit nearest selection to `pointTypes: ["end"]` when only endpoints should be moved.
- Good: use `maxDistance` to prevent an approximate coordinate from accidentally moving a distant point.
- Base: caller already knows exact segment indexes; use the legacy explicit `{ points }` selector.
- Base: caller needs several nearby points; use the bbox or segment range selector until a future multi-nearest selector is defined.
- Bad: using current Inkscape GUI node selection to decide the nearest point.
- Bad: projecting to the nearest rendered curve position and then pretending it selected an editable path node.
- Bad: replacing the whole SVG document because one nearby control point needs movement.

### 6. Tests Required

- Schema tests accept legacy explicit, bbox, segment range, and nearest selectors with defaulted `pointTypes`.
- Schema tests reject non-finite nearest coordinates, empty `pointTypes`, and negative or non-finite `maxDistance`.
- Core tests prove nearest selection uses absolute coordinates, selects exactly one point, honors `pointTypes`, and returns resolved `selectedPoints`.
- Core tests prove deterministic tie-break by segment order and parser point order.
- Core tests prove nearest `set_absolute` and `set_relative` require exactly one target after selector resolution.
- Core tests prove no-candidate and out-of-threshold nearest selectors throw before returning a mutated SVG.
- Tool-level tests prove successful nearest transforms snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove invalid nearest selectors leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: getCurrentGuiNodeSelection(),
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    type: "nearest",
    x: 118,
    y: 34,
    pointTypes: ["c1", "end"],
    maxDistance: 8,
  },
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

Use nearest selection when the caller knows an approximate absolute SVG coordinate and wants one editable path point. Resolve the selector inside `transform_path_points` so pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Path Point Radius Selector Contract

### 1. Scope / Trigger

- Trigger: selecting all editable endpoint/control handles within a circular absolute-coordinate area before applying `transform_path_points`.
- Scope: one existing path element in one workspace document, using the existing `translate`, `set_absolute`, and `set_relative` transform variants.
- Out of scope: cross-path radius selection, ellipse/polygon/lasso selection, renderer hit testing, stroke-outline distance, curve projection distance, GUI node selection, selection previews, segment creation/deletion, and unsupported SVG path commands.

### 2. Signatures

- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- Legacy explicit selector: `{ points: Array<{ segmentIndex: number, point: "end" | "c1" | "c2" }> }`
- Existing bbox selector: `{ type: "bbox", minX: number, minY: number, maxX: number, maxY: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Existing segment range selector: `{ type: "segment_range", startSegmentIndex: number, endSegmentIndex: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- Existing nearest selector: `{ type: "nearest", x: number, y: number, pointTypes?: Array<"end" | "c1" | "c2">, maxDistance?: number }`
- Radius selector: `{ type: "radius", x: number, y: number, radius: number, pointTypes?: Array<"end" | "c1" | "c2"> }`
- `x`, `y`, and `radius` are absolute SVG user-unit values.
- `pointTypes` defaults to `["end", "c1", "c2"]`.
- Response includes resolved `selectedPointCount`, `selectedPoints`, `editedSegments`, `transform`, and `changed.d.from` / `changed.d.to`.

### 3. Contracts

- Radius selection is computed from absolute editable path-node coordinates produced by the same parser used by `query_path_nodes({ normalize: "absolute" })`.
- A point matches when `(point.x - x) ** 2 + (point.y - y) ** 2 <= radius ** 2`; the boundary is inclusive.
- The selector resolves editable points exposed by the current path parser: `end`, `c1`, and `c2` on supported `M`, `L`, `C`, `Q`, and `Z` path commands, including relative variants.
- Selected points are returned in deterministic path order, and within each segment the existing parser `availablePoints` order wins.
- Legacy `{ points }`, `{ type: "bbox" }`, `{ type: "segment_range" }`, and `{ type: "nearest" }` callers remain valid.
- After radius resolution, transform behavior is identical to explicit multi-point selection. `set_absolute` and `set_relative` target counts must match the resolved selected point count.
- A radius selector with no candidates for the requested `pointTypes` fails before snapshot/write.
- Successful writes preserve the target path element id and object tree, snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.
- Failed validation, missing path data, unsupported commands, empty radius matches, or set-target mismatches leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

### 4. Validation & Error Matrix

- Non-finite `x`, `y`, or `radius` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Negative `radius` -> schema validation failure or `INVALID_INPUT`, no snapshot/write.
- Empty `pointTypes` -> schema validation failure, no pre-pull or write.
- No editable candidate after `pointTypes` filtering and radius matching -> `INVALID_INPUT`, no snapshot/write.
- Missing target element, non-path target, or missing `d` -> `INVALID_INPUT`, no snapshot/write.
- Unsupported path command such as `A`, `S`, `T`, `H`, or `V` -> existing `INVALID_INPUT` parser error, no snapshot/write.
- `set_absolute` or `set_relative` target count mismatch after radius resolution -> `INVALID_INPUT`, no snapshot/write.
- Active bidirectional pre-pull failure -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: move all control handles within 8 user units of `{ x: 118, y: 34 }` while leaving farther endpoints untouched.
- Good: set exact coordinates for all endpoints inside a small circular region after querying absolute path nodes.
- Good: use `radius: 0` to select points exactly at a coordinate when exact equality is intended.
- Base: caller needs one closest point; use the nearest selector.
- Base: caller needs a rectangular area; use the bbox selector.
- Bad: using current Inkscape GUI node selection to decide which points are in the radius.
- Bad: using rendered curve distance and pretending it selected editable path nodes.
- Bad: replacing the whole SVG document because a local cluster of handles needs movement.

### 6. Tests Required

- Schema tests accept legacy explicit, bbox, segment range, nearest, and radius selectors with defaulted `pointTypes`.
- Schema tests reject non-finite radius coordinates, empty `pointTypes`, and negative or non-finite `radius`.
- Core tests prove radius selection uses absolute coordinates, includes boundary points, honors `pointTypes`, preserves path order, and returns resolved `selectedPoints`.
- Core tests prove radius `set_absolute` and `set_relative` reject target-count mismatches after selector resolution.
- Core tests prove empty radius selectors throw before returning a mutated SVG.
- Tool-level tests prove successful radius transforms snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests prove invalid radius selectors leave `current.svg` and history unchanged and do not call Inkscape sync/refresh.

### 7. Wrong vs Correct

#### Wrong

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: getCurrentGuiNodeSelection(),
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

#### Correct

```typescript
await transformPathPoints({
  docId,
  elementId: "mouth",
  pointSelector: {
    type: "radius",
    x: 118,
    y: 34,
    radius: 8,
    pointTypes: ["c1", "c2"],
  },
  transform: { type: "translate", dx: -2, dy: 0 },
});
```

Use radius selection when the caller knows an approximate absolute SVG coordinate and wants a local group of editable path points. Resolve the selector inside `transform_path_points` so pre-pull, validation, snapshot-first write, diagnostics, operation logs, and direct `d` sync stay coupled.

## Scenario: Arc Endpoint Editing Contract

### 1. Scope / Trigger

- Trigger: editing SVG path data that includes elliptical arc commands after the read-only arc query boundary has been established.
- Scope: `query_path_nodes`, `query_document({ includePathNodes: true })`, `validate_path_data`, `edit_path_nodes`, and `transform_path_points` for `A/a` segment endpoints.
- Out of scope: editing arc radii, rotations, flags, center parameterization, arc-to-cubic conversion, renderer-accurate arc solving, structured `A/a` segment arrays, and shorthand curve support.

### 2. Signatures

- Tool: `query_path_nodes({ docId, elementId, normalize?: "none" | "absolute" | "relative", skipPrePull?, allowStaleRead? })`
- Tool: `query_document({ docId, includePathNodes: true, pathNodeNormalize?: "none" | "absolute" | "relative", responseMode? })`
- Tool: `validate_path_data({ d, requireMoveTo? })`
- Tool: `edit_path_nodes({ docId, elementId, edits })`
- Tool: `transform_path_points({ docId, elementId, pointSelector, transform })`
- Arc raw segment shape:

```json
{
  "cmd": "A",
  "rx": 5,
  "ry": 6,
  "xAxisRotation": 45,
  "largeArcFlag": 0,
  "sweepFlag": 1,
  "x": 20,
  "y": 25
}
```

### 3. Contracts

- `A/a` segments are raw editable path commands for endpoint operations only.
- Arc segments expose `queryPoints: ["end"]`, `availablePoints: ["end"]`, `points.end`, and `absolutePoints.end`.
- `normalize: "absolute"` reports arc endpoint coordinates in absolute SVG user units.
- `normalize: "relative"` reports arc endpoint coordinates relative to the segment base point, including for uppercase `A`.
- Compact document path-node summaries count arc endpoints through `queryPointCount`, `normalizedPointCount`, and `editablePointCount`.
- Read-only query tools must not snapshot, update metadata, append operation logs, write operation-diff artifacts, or refresh Inkscape.
- `edit_path_nodes` may apply `move_point`, `set_point_absolute`, and `set_point_relative` to arc `end` points.
- `transform_path_points` selectors that iterate `availablePoints` may select arc endpoints, including explicit, bbox, segment range, segment list, command, point type, nearest, and radius selectors.
- `transform_path_points` transforms may translate, set absolute, set relative, scale, rotate, reflect, reflect-line, and skew selected arc endpoints through the existing absolute-target mapping pipeline.
- Arc parameter fields `rx`, `ry`, `xAxisRotation`, `largeArcFlag`, and `sweepFlag` must round-trip unchanged through endpoint edits.
- Uppercase `A` stores absolute endpoint coordinates after edits; lowercase `a` stores endpoint coordinates relative to the segment base point after edits.
- Arc `c1` and `c2` are not available points and explicit attempts to select them must reject before snapshot/write.
- Successful write tools preserve the target path element id and object tree, snapshot current SVG first, update metadata, write operation-diff diagnostics, append a compact operation log, and directly sync the active Inkscape window with `object-set-attribute:d`.

### 4. Validation & Error Matrix

- Missing arc parameters -> `INVALID_INPUT` with command, segment index, expected/actual/missing parameter counts, token index, and source offset when available.
- Arc `largeArcFlag` other than `0` or `1` -> `INVALID_INPUT`, no workspace side effects.
- Arc `sweepFlag` other than `0` or `1` -> `INVALID_INPUT`, no workspace side effects.
- `query_path_nodes` on a path with unsupported commands such as `T` -> `INVALID_INPUT` or document-wide unsupported-path warning.
- `edit_path_nodes` or `transform_path_points` with arc `c1` or `c2` selection -> `INVALID_INPUT`, no snapshot/write/log/refresh.
- `transform_path_points` command selector with `A/a` and `pointTypes: ["end"]` -> valid when matching arc endpoints exist.
- `transform_path_points` selector with `pointTypes: ["c1"]` or `["c2"]` over only arc segments -> empty selector rejection before snapshot/write.
- Active bidirectional pre-pull failure before an arc endpoint write -> sync/Inkscape error, no MCP write.

### 5. Good/Base/Bad Cases

- Good: edit `M10 10 A5 6 45 0 1 20 25` to `M10 10 A5 6 45 0 1 22 24`; only the endpoint changes.
- Good: edit `a3 4 0 1 0 5 -2` with `set_point_relative` to `a3 4 0 1 0 7 -4`; arc parameters and relative storage remain intact.
- Good: use `transform_path_points` with `{ type: "command", commands: ["A", "a"], pointTypes: ["end"] }` to adjust only arc endpoints.
- Good: use `query_document({ includePathNodes: true, pathNodeNormalize: "relative" })` to summarize mixed line/curve/arc paths without failing the whole query.
- Base: use `validate_path_data` as a no-workspace preflight for arc syntax and flag diagnostics.
- Bad: changing `rx`, `ry`, `xAxisRotation`, `largeArcFlag`, or `sweepFlag` as a side effect of endpoint movement.
- Bad: converting arcs to cubic curves to make endpoint edits easier.
- Bad: silently converting arcs to cubic curves as a side effect of query.

### 6. Tests Required

- Core tests for uppercase and lowercase arc query segments with raw parameters, endpoint points, and absolute endpoints.
- Core tests for absolute and relative normalized arc endpoint views.
- Tool-level tests that arc queries do not write history or call Inkscape refresh/sync.
- Document-query tests that compact and standard/full responses include arc summaries without unsupported warnings.
- Validation tests for malformed arc parameter sets and invalid arc flags.
- Core tests that `edit_path_nodes` moves and sets uppercase and lowercase arc endpoints while preserving arc parameters and storage form.
- Core tests that `transform_path_points` can select arc endpoints through every selector family and apply every transform family.
- Schema tests that command selectors accept `A/a` and continue rejecting unsupported commands.
- Tool-level tests that successful arc endpoint writes snapshot, log, write operation diagnostics, return previous/next `d`, and use direct active-window `d` sync.
- Tool-level tests that invalid arc `c1`/`c2` selections leave `current.svg`, history, operation logs, operation-diff artifacts, and Inkscape refresh untouched.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not mutate arc parameters or convert the segment to another command family.
segment.rx = segment.rx * scaleFactor;
segment.cmd = "C";
```

#### Correct

```typescript
segment.queryPoints = ["end"];
segment.availablePoints = ["end"];
segment.x = nextEndpoint.x;
segment.y = nextEndpoint.y;
```

Use `queryPoints` for inspection and `availablePoints` for bounded endpoint edit selectors. Future arc geometry work must explicitly introduce a separate contract for radii, rotation, flags, center solving, or arc-to-cubic conversion.

## Scenario: Smooth Cubic Path Read-Only Query Contract

### 1. Scope / Trigger

- Trigger: inspecting SVG path data that includes smooth cubic `S/s` commands before reflection-aware edit semantics exist.
- Scope: `query_path_nodes`, `query_document({ includePathNodes: true })`, and `validate_path_data` for `S/s` segments.
- Out of scope: editing `S/s` endpoints or control handles, exposing reflected implicit `c1` as an editable point, converting `S/s` to `C/c`, structured `S/s` segment arrays, shorthand quadratic `T/t`, and GUI node-selection integration.

### 2. Signatures

- Tool: `query_path_nodes({ docId, elementId, normalize?: "none" | "absolute" | "relative", skipPrePull?, allowStaleRead? })`
- Tool: `query_document({ docId, includePathNodes: true, pathNodeNormalize?: "none" | "absolute" | "relative", responseMode? })`
- Tool: `validate_path_data({ d, requireMoveTo? })`
- Smooth cubic raw segment shape:

```json
{
  "cmd": "S",
  "x2": 20,
  "y2": 8,
  "x": 22,
  "y": 10
}
```

### 3. Contracts

- `S/s` segments are query-recognized path commands, not editable path commands.
- Smooth cubic segments expose `queryPoints: ["c2", "end"]`, `points.c2`, `points.end`, `absolutePoints.c2`, and `absolutePoints.end`.
- Smooth cubic segments expose `availablePoints: []` so selector/edit tooling cannot mutate them before a dedicated edit contract exists.
- `normalize: "absolute"` reports `c2` and endpoint coordinates in absolute SVG user units.
- `normalize: "relative"` reports `c2` and endpoint coordinates relative to the segment base point, including for uppercase `S`.
- Compact document path-node summaries count smooth cubic points through `queryPointCount` and `normalizedPointCount`, while `editablePointCount` excludes them.
- Read-only query tools must not snapshot, update metadata, append operation logs, write operation-diff artifacts, or refresh Inkscape.
- `edit_path_nodes` and `transform_path_points` continue to use the editable parser and reject smooth-cubic-containing paths before snapshot/write.

### 4. Validation & Error Matrix

- Missing `S/s` parameters -> `INVALID_INPUT` with command, segment index, expected/actual/missing parameter counts, token index, and source offset when available.
- `query_path_nodes` on a path with unsupported commands such as `T/t` -> `INVALID_INPUT` or document-wide unsupported-path warning.
- `edit_path_nodes` or `transform_path_points` on an `S/s`-containing path -> `INVALID_INPUT`, no snapshot/write/log/refresh.
- `transform_path_points` command selector with `S/s` -> schema/core rejection until `S/s` becomes editable.

### 5. Good/Base/Bad Cases

- Good: inspect `M10 10 C12 12 14 12 16 10 S20 8 22 10` and use the reported `c2` and endpoint coordinates to plan a future safe smooth cubic edit.
- Good: use `query_document({ includePathNodes: true, pathNodeNormalize: "relative" })` to summarize mixed cubic/smooth-cubic paths without failing the whole query.
- Base: use `validate_path_data` as a no-workspace preflight for `S/s` syntax and point-count diagnostics.
- Bad: exposing smooth cubic points in `availablePoints` before edit-side reflected-control semantics exist.
- Bad: silently converting `S/s` to `C/c` as a side effect of query.

### 6. Tests Required

- Core tests for uppercase and lowercase smooth cubic query segments with raw parameters, `c2`, endpoint points, and absolute endpoints.
- Core tests for absolute and relative normalized smooth cubic `c2` and endpoint views.
- Tool-level tests that smooth cubic queries do not write history or call Inkscape refresh/sync.
- Document-query tests that compact and standard/full responses include smooth cubic summaries without unsupported warnings.
- Validation tests for valid and malformed smooth cubic parameter sets.
- Mutation guard tests proving smooth-cubic-containing paths reject in `edit_path_nodes` and `transform_path_points`.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Do not silently convert smooth cubic commands during query.
return { cmd: "C", x1: reflectedX1, y1: reflectedY1, x2, y2, x, y };
```

#### Correct

```typescript
segment.queryPoints = ["c2", "end"];
segment.availablePoints = [];
```

Use `queryPoints` for read-only inspection and keep `availablePoints` empty until a future task defines how reflected implicit `c1`, endpoint edits, and `c2` edits round-trip without surprising geometry changes.

## Phase Summary

### Phase 1: Stabilize Current Foundations

Primary outcome: precise edits are safe, explainable, recoverable, and visible in the existing Inkscape window.

Key work:

- identity handshake
- persistent explicit polling
- id repair proposal/apply
- stronger conservative merge preview
- richer query modes
- path editing reliability
- operation diff, dry-run, replay, and recovery
- extension self-check

### Phase 2: Advanced SVG And Inkscape Workflows

Primary outcome: agents can operate most structured SVG/Inkscape document features through typed, safe tools.

Key work:

- layers, groups, and reparenting
- defs resources and dependency graph
- text and font workflows
- local raster asset import
- transforms, alignment, distribution, z-order
- broader allowlisted Inkscape actions
- visual regression tools
- performance and compact responses
- checkpoints and operation groups

### Phase 3: Near-1:1 Vectorization And Human-Operation Coverage

Primary outcome: agents can produce high-fidelity, editable vector artifacts from bitmaps and plan complex multi-step edits.

Key work:

- multi-pass vectorization pipeline
- better visual metrics
- editability analysis and optimization
- segmentation and primitive reconstruction
- OCR text reconstruction
- screenshot-based GUI diagnostics
- agent planning layer
- human-operation capability matrix

## Implementation Rule

For all future roadmap tasks, create or update a Trellis PRD before implementation. The PRD should reference the relevant phase document and this memory file, then narrow the scope to one verifiable vertical slice.
