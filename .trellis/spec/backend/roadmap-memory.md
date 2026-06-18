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
- Out of scope: applying merge previews, deleting/pruning artifacts, saving merge previews outside GUI pull preview mode, cross-document reads, and changing merge conflict classes.

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
