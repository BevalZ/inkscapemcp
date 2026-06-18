# Phase 3 Roadmap: Near-1:1 Vectorization And Human-Operation Coverage

## Purpose

Phase 3 targets the long-term goal: agents can handle nearly every human-operable Inkscape workflow and can convert bitmaps into highly faithful, editable vector artwork. This phase depends on the reliable editing, querying, visual regression, and asset workflows from Phases 1 and 2.

Recommended default: build this as an iterative quality loop, not a single "trace image" command. Near-1:1 vectorization requires repeated parameter search, visual scoring, structure cleanup, and human-reviewable artifacts.

## Product Goal

Given a bitmap or screenshot-like reference, InkSMCP should produce SVG artwork that is visually close to the source, structurally editable, and compatible with the rest of the MCP/Inkscape workflow. For existing SVGs, agents should be able to perform sophisticated edits using the same kinds of operations available to a human in Inkscape.

## Current Baseline Required Before Starting

Phase 3 assumes:

- Vectorization can already produce separate artifacts through allowlisted engines.
- PNG render-diff metrics exist.
- Visual regression tools can compare before/after previews.
- Raster assets can be imported safely.
- Query tools expose structure, dependencies, styles, paths, and bounding boxes.
- Path editing is deterministic and supports compact operations.
- Advanced SVG features such as layers, groups, defs, gradients, clips, masks, text, and images have typed tools.
- Recovery and checkpoints are reliable.

## Non-Goals

- Do not promise mathematically perfect reconstruction of all raster images.
- Do not hide lossy decisions. Every approximation should be measurable or reviewable.
- Do not replace the current document automatically with vectorized output unless explicitly requested.
- Do not depend on remote services for core local workflows.
- Do not introduce arbitrary plugin execution.

## Workstream 1: Multi-Pass Vectorization Pipeline

### Problem

Single-pass tracing rarely gives near-1:1 results. Different images require different parameters, preprocessing, segmentation, and cleanup strategies.

### Recommended Plan

1. Treat vectorization as a pipeline with artifacts at every stage.
2. Add preprocessing options:
   - resize
   - denoise
   - threshold
   - posterize
   - edge detect
   - color quantization
   - alpha handling
3. Run multiple vectorizer configurations.
4. Render each candidate to PNG.
5. Score each candidate against the source.
6. Keep the best candidates as reviewable artifacts.
7. Never mutate `current.svg` unless a separate insert/apply command is called.

### Candidate Tool

```typescript
vectorize_bitmap_pipeline({
  docId,
  sourcePath,
  engines: ["vtracer", "potrace"],
  presets?: string[],
  maxCandidates?: number,
  preprocessing?: {
    denoise?: boolean,
    posterizeColors?: number,
    threshold?: number,
    alphaMode?: "preserve" | "flatten" | "ignore"
  },
  metrics?: ["mae" | "rmse" | "exact" | "ssim" | "edge" | "colorHistogram"],
  timeoutMs?
})
```

### Acceptance Criteria

- The pipeline writes all candidates under a document-scoped artifact directory.
- Candidate metadata includes engine, parameters, preprocessing, render path, and metrics.
- The source image is never modified.
- The current SVG is not replaced or inserted into automatically.
- Timeouts and candidate limits prevent runaway jobs.

## Workstream 2: Better Quality Metrics

### Problem

Simple pixel metrics catch obvious differences but do not fully represent perceived visual quality.

### Recommended Plan

1. Keep MAE/RMSE/exact match as baseline metrics.
2. Add SSIM where dependencies allow.
3. Add edge similarity for line art and icons.
4. Add color histogram distance for flat-color artwork.
5. Add alpha coverage comparison.
6. Add region-of-interest scoring.
7. Return metric explanations, not just numbers.

### Candidate Tool

```typescript
score_vector_candidate({
  docId,
  sourceImagePath,
  candidateSvgPath,
  renderWidth?,
  metrics,
  regions?
})
```

### Acceptance Criteria

- Metrics report image dimensions, comparability, and preprocessing applied before scoring.
- Unsupported metric dependencies return explicit errors.
- Region scoring identifies localized failures.
- Tests use deterministic fixtures.

## Workstream 3: Editable Structure Optimization

### Problem

The closest visual trace can be uneditable: thousands of tiny paths, redundant nodes, broken groups, or no semantic structure. Near-1:1 output must balance visual fidelity and editability.

### Recommended Plan

1. Add structure metrics:
   - path count
   - node count
   - average path length
   - group count
   - color count
   - tiny island count
   - duplicate shape count
2. Add cleanup passes:
   - path simplify under visual threshold
   - merge same-color adjacent paths
   - remove tiny specks
   - normalize transforms
   - group by color/layer/region
   - convert repeated shapes into symbols when safe
3. Score candidates with a visual/editability tradeoff.
4. Preserve original candidate artifacts before cleanup.

### Candidate Tools

```typescript
analyze_svg_editability({ docId, svgArtifactPath })
```

```typescript
optimize_vector_structure({
  docId,
  svgArtifactPath,
  maxVisualDelta,
  operations: ["simplify" | "merge_same_color" | "remove_specks" | "normalize_transforms" | "group_regions"]
})
```

### Acceptance Criteria

- Optimization produces a new artifact instead of overwriting the source artifact.
- Visual delta is measured after each cleanup stage.
- Cleanup stops when the delta exceeds the requested threshold.
- Editability metrics are included in the result.

## Workstream 4: Segmentation And Semantic Reconstruction

### Problem

Some images should become editable semantic objects: icons, UI screenshots, logos, diagrams, text, and product drawings all need different reconstruction strategies.

### Recommended Plan

1. Add segmentation modes:
   - flat-color regions
   - line art
   - text regions
   - diagram shapes
   - UI components
   - photo-like regions
2. Use mode-specific vectorization presets.
3. Reconstruct common primitives where possible:
   - rectangles
   - circles
   - ellipses
   - lines
   - polylines
   - rounded rectangles
   - simple paths
4. Keep confidence scores and fall back to paths when primitive recovery is uncertain.

### Candidate Tool

```typescript
reconstruct_vector_semantics({
  docId,
  sourcePath,
  mode: "icon" | "logo" | "diagram" | "ui" | "line_art" | "mixed",
  preserveText?: boolean,
  preferPrimitives?: boolean
})
```

### Acceptance Criteria

- Primitive reconstruction is confidence-scored.
- Low-confidence regions remain paths rather than wrong primitives.
- Semantic groups are named and layered.
- The result can be inspected before insertion.

## Workstream 5: OCR And Text Reconstruction

### Problem

Bitmap text should not always become paths. For screenshots, diagrams, signs, and labels, editable text is often the better result.

### Recommended Plan

1. Add optional OCR integration through allowlisted local engines only.
2. Detect text regions.
3. Create SVG text objects with approximate position, size, and style.
4. Keep fallback path traces for difficult text.
5. Record OCR confidence and source bounding boxes.

### Candidate Tool

```typescript
extract_text_regions({
  docId,
  sourcePath,
  engine?: "tesseract",
  language?: string,
  minConfidence?: number
})
```

```typescript
apply_ocr_text_layer({
  docId,
  ocrArtifactId,
  targetLayerId?,
  confidencePolicy: "high_only" | "include_review_low_confidence"
})
```

### Acceptance Criteria

- OCR is optional and local.
- Low-confidence OCR is not silently treated as correct.
- Text layer insertion is explicit.
- The original vector/path trace remains available for comparison.

## Workstream 6: Screenshot-Based GUI Diagnostics

### Problem

Companion extension and active-window actions are the primary GUI path, but visible behavior can still fail in ways that file state cannot prove. Screenshot diagnostics can help diagnose without becoming the normal edit mechanism.

### Recommended Plan

1. Keep screenshot diagnostics opt-in.
2. Capture the active Inkscape window only for diagnosis.
3. Compare visible render against workspace preview.
4. Report likely causes:
   - stale window
   - wrong window
   - extension not loaded
   - active-window action ignored
   - render mismatch
5. Do not use screenshot clicks or keyboard automation for normal edits.

### Candidate Tool

```typescript
diagnose_visible_inkscape_state({
  docId,
  connectionId?,
  compareWorkspacePreview?: boolean,
  captureMode: "active_window"
})
```

### Acceptance Criteria

- Diagnostic capture is read-only.
- It never writes SVG.
- It never performs mouse/keyboard edits.
- It returns actionable diagnosis and confidence.

## Workstream 7: Agent Planning Layer

### Problem

Advanced editing and vectorization involve many possible tool calls. Agents need a planning layer that decomposes tasks into inspect, propose, preview, apply, verify, and recover steps.

### Recommended Plan

1. Add structured plans as artifacts.
2. Plans should include assumptions, target ids, expected diffs, preview checkpoints, and rollback points.
3. Add dry-run plan execution.
4. Add step-by-step apply with stop-on-warning policies.
5. Add final verification using preview metrics and document diffs.

### Candidate Tools

```typescript
create_edit_plan({
  docId,
  goal,
  constraints?,
  responseMode?: "compact" | "full"
})
```

```typescript
execute_edit_plan({
  docId,
  planId,
  mode: "dry_run" | "apply",
  stopOnWarning?: boolean
})
```

```typescript
verify_edit_plan({
  docId,
  planId,
  metrics?: ["diff" | "preview" | "identity" | "refresh"]
})
```

### Acceptance Criteria

- Plans are inspectable before application.
- Dry-run mode writes no SVG.
- Apply mode snapshots before each mutation or operation group.
- Verification reports exact changed ids and preview differences.

## Workstream 8: Broad Human-Operation Coverage

### Problem

The final target is coverage of almost all ordinary human Inkscape operations while preserving safety. This needs systematic mapping from user intent to safe typed operations.

### Recommended Plan

1. Build a capability matrix for Inkscape operations.
2. Classify each operation as:
   - already supported
   - can be implemented as pure SVG edit
   - should be implemented through allowlisted Inkscape action
   - requires extension support
   - diagnostic-only
   - out of scope
3. Add typed tools in priority order.
4. Keep each new feature small and testable.
5. Track unsupported operations explicitly.

### Candidate Operation Areas

- selection-independent object edits
- canvas and document settings
- guides and grids where represented safely
- snapping-related deterministic transforms
- clone/symbol workflows
- filters and filter primitives
- live path effects where safe
- connectors and diagrams
- measurement and annotation
- export presets

### Acceptance Criteria

- The capability matrix is versioned in docs.
- Every supported operation states whether it is pure SVG, Inkscape-backed, extension-backed, or diagnostic-only.
- Unsupported operations fail clearly instead of being approximated silently.

## Recommended Implementation Order

1. Better vectorization artifact model and candidate metadata.
2. Multi-pass vectorization pipeline with existing metrics.
3. SSIM, edge, alpha, and color metrics.
4. Editability analysis.
5. Structure optimization with visual delta thresholds.
6. Segmentation modes and primitive reconstruction.
7. OCR and editable text reconstruction.
8. Screenshot-based GUI diagnostics.
9. Agent planning layer.
10. Human-operation capability matrix and incremental tool expansion.

This order builds measurement before automation. Without reliable scoring, automatic near-1:1 vectorization cannot be trusted.

## Testing Plan

- Unit tests for vectorization job planning and parameter expansion.
- Unit tests for artifact path confinement.
- Unit tests for scoring comparable and non-comparable images.
- Fixture tests for edge/color/alpha metrics.
- Tests for editability metrics on small known SVGs.
- Regression tests that structure optimization respects visual-delta thresholds.
- Optional integration tests for local OCR/vectorizer binaries when installed.
- Diagnostic tests that screenshot workflows are read-only.
- End-to-end smoke tests that a pipeline creates candidates, scores them, selects best artifacts, and leaves `current.svg` unchanged until explicit apply.

## Definition Of Done

- Vectorization is artifact-first and never silently destructive.
- Candidate quality is measured visually and structurally.
- Editability is a first-class optimization target.
- OCR and screenshot diagnostics are optional, local, and explicit.
- Agent plans can dry-run, apply, verify, and recover.
- Human-operation coverage is tracked in a documented capability matrix.
- All new tools preserve workspace confinement, explicit schemas, snapshots, and deterministic failure behavior.

