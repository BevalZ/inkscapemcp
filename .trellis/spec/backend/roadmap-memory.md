# InkSMCP Roadmap Memory

> Persistent project memory for the recommended three-phase roadmap toward precise Inkscape operation coverage and near-1:1 bitmap vectorization.

## Scope

This document is the short, durable memory entry. Detailed phase plans live in:

- `docs/roadmap/phase-1-stabilize-foundations.md`
- `docs/roadmap/phase-2-advanced-svg-inkscape-workflows.md`
- `docs/roadmap/phase-3-near-1-1-vectorization.md`

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
- Id repair proposal and ambiguity rejection tests.
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
