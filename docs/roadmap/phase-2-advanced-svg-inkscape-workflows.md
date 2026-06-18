# Phase 2 Roadmap: Advanced SVG And Inkscape Workflows

## Purpose

Phase 2 expands InkSMCP from reliable object/path editing into broad SVG and Inkscape workflow coverage. This phase should start only after Phase 1 stabilizes identity, polling, conflict handling, queries, path edits, diffs, and diagnostics.

Recommended default: add advanced features through explicit, typed MCP tools and allowlisted Inkscape actions. Do not expose arbitrary Inkscape action strings or raw GUI automation as a shortcut.

## Product Goal

An agent should be able to operate the same classes of content a human edits in Inkscape: layers, groups, defs, gradients, markers, clips, masks, symbols, text, images, document settings, object transforms, alignment, distribution, and safe selected Inkscape operations. The user should see changes in the existing Inkscape window whenever refresh is supported.

## Current Baseline Required Before Starting

Phase 2 assumes:

- Same-window refresh is reliable for supported write operations.
- Bidirectional sync identity is explicit and inspectable.
- Conflict reports are structured.
- Query tools can expose dependencies and compact summaries.
- Operation diffs exist for write operations.
- Path edits are deterministic and covered by tests.
- Extension diagnosis can explain refresh/sync failures.

## Non-Goals

- No arbitrary shell execution.
- No arbitrary Inkscape action execution.
- No direct writes from the Inkscape extension into `workspace/drawings/{docId}/current.svg`.
- No network asset download without a separate import boundary.
- No full automatic bitmap-to-perfect-vector workflow; that is Phase 3.
- No permanent frontend application unless a future PRD asks for it.

## Workstream 1: Layers, Groups, And Object Organization

### Problem

Inkscape users organize documents through layers and groups. Agents need first-class tools for this rather than manually editing XML attributes with incomplete context.

### Recommended Plan

1. Add read-only layer query support.
2. Add controlled layer creation, rename, reorder, lock, hide, and delete.
3. Add group and ungroup tools that preserve ids where possible.
4. Add object move/reparent tools with dependency and conflict checks.
5. Return affected ids and operation diffs.

### Candidate Tools

```typescript
query_layers({ docId, includeObjects?: boolean })
```

```typescript
create_layer({ docId, layerId?, label, position?: "top" | "bottom" | { afterLayerId: string } })
```

```typescript
update_layer({ docId, layerId, label?, visible?, locked? })
```

```typescript
move_elements({ docId, elementIds, targetParentId, position? })
```

```typescript
group_elements({ docId, elementIds, groupId?, label? })
```

```typescript
ungroup_element({ docId, groupId, preserveChildIds?: boolean })
```

### Acceptance Criteria

- Layer operations preserve non-target content and document defs.
- Reparenting rejects if it would break clip, mask, marker, gradient, or symbol dependencies.
- Group/ungroup operations return stable ids and warnings when Inkscape rewrites structure.
- Automatic refresh runs after successful writes.

## Workstream 2: Defs, Gradients, Patterns, Markers, Clips, And Masks

### Problem

Many useful Inkscape drawings rely on `defs` resources. Editing visible objects without understanding dependencies can break fills, strokes, arrowheads, clips, and masks.

### Recommended Plan

1. Add dependency graph support in core.
2. Add typed tools for common defs resources.
3. Keep raw defs fragment insertion possible only through existing safe SVG validation.
4. Add reference repair when ids are intentionally renamed.
5. Prevent deletion of referenced defs unless explicitly confirmed.

### Candidate Tools

```typescript
query_definitions({ docId, type?: "gradient" | "pattern" | "marker" | "clipPath" | "mask" | "symbol" })
```

```typescript
create_linear_gradient({ docId, gradientId?, stops, x1?, y1?, x2?, y2? })
```

```typescript
update_gradient_stops({ docId, gradientId, stops })
```

```typescript
apply_paint_server({ docId, elementIds, property: "fill" | "stroke", paintServerId })
```

```typescript
create_clip_path({ docId, clipPathId?, elementIds })
```

```typescript
apply_clip_or_mask({ docId, elementIds, kind: "clipPath" | "mask", referenceId })
```

### Acceptance Criteria

- Query output identifies references and reverse references.
- Delete/update operations reject when they would leave broken references unless confirmed.
- Paint server tools update attributes/styles without touching unrelated style declarations.
- Tests cover url references in attributes and style strings.

## Workstream 3: Text And Font Workflows

### Problem

Text is common and risky: converting to paths loses editability, font availability affects rendering, and text layout can vary.

### Recommended Plan

1. Add text query summaries.
2. Add edit-text tools that preserve text nodes and ids.
3. Add font availability diagnostics based on imported fonts and system availability where practical.
4. Keep text-to-path conversion explicit and warning-heavy.
5. Add support for common text attributes: font family, size, weight, style, line height, alignment.

### Candidate Tools

```typescript
query_text({ docId, elementId?, includeStyle?: boolean })
```

```typescript
update_text({ docId, elementId, text, preserveTspans?: boolean })
```

```typescript
style_text({ docId, elementIds, fontFamily?, fontSize?, fontWeight?, fontStyle?, textAnchor? })
```

```typescript
convert_text_to_path({ docId, elementIds, resultId?, timeoutMs? })
```

### Acceptance Criteria

- Text edits preserve existing element ids.
- Text-to-path returns `TEXT_CONVERTED_TO_PATH` warning.
- Font imports remain local workspace operations.
- Preview/export behavior reports missing font risks when detectable.

## Workstream 4: Images And Local Asset Import

### Problem

SVG documents can reference raster images. Agents need safe import and embedding/linking rules before doing layout, tracing, or mixed-media workflows.

### Recommended Plan

1. Add controlled local raster import.
2. Copy imported assets into the workspace.
3. Support link and embed modes explicitly.
4. Track asset metadata and references.
5. Reject remote URLs and unsafe paths.

### Candidate Tools

```typescript
import_raster_asset({
  docId,
  sourcePath,
  mode: "copy_link" | "embed",
  assetId?
})
```

```typescript
place_image({
  docId,
  assetId,
  elementId?,
  x,
  y,
  width,
  height,
  preserveAspectRatio?
})
```

```typescript
query_assets({ docId, includeReferences?: boolean })
```

### Acceptance Criteria

- Imported files stay inside workspace asset directories.
- Remote and UNC paths reject.
- Linked assets use workspace-relative or safe local references only.
- Embedded assets pass SVG safety validation.

## Workstream 5: Transforms, Alignment, Distribution, And Layout

### Problem

Human Inkscape workflows often depend on alignment, distribution, snapping-like moves, transforms, and object ordering. Agents need deterministic equivalents.

### Recommended Plan

1. Add bounding-box query support using SVG geometry and Inkscape query where available.
2. Add transform tools for translate, scale, rotate, skew, and matrix operations.
3. Add align/distribute tools.
4. Add z-order tools.
5. Return before/after bounding boxes when possible.

### Candidate Tools

```typescript
query_bounding_boxes({ docId, elementIds, source?: "svg" | "inkscape" })
```

```typescript
transform_elements({ docId, elementIds, transform, origin?: "center" | "document" | { x: number, y: number } })
```

```typescript
align_elements({ docId, elementIds, axis, anchor })
```

```typescript
distribute_elements({ docId, elementIds, axis, mode })
```

```typescript
reorder_elements({ docId, elementIds, position })
```

### Acceptance Criteria

- Transform tools preserve ids.
- Alignment/distribution are deterministic with stable sort rules.
- Inkscape-dependent bbox queries return explicit unavailable errors when Inkscape is missing.
- Automatic refresh runs after successful writes.

## Workstream 6: Broader Allowlisted Inkscape Actions

### Problem

Inkscape already implements many operations well. The MCP should use them where deterministic, but only through a narrow allowlist.

### Recommended Plan

1. Expand `run_action` only with reviewed action mappings.
2. Prefer dedicated typed tools for common workflows.
3. Require explicit element ids.
4. Use temporary workspace files.
5. Parse and safety-check Inkscape output before replacing `current.svg`.

### Candidate Action Categories

- object-to-path
- stroke-to-path
- path simplify
- path reverse
- path combine/break apart
- path boolean operations
- group/ungroup
- raise/lower selected explicit ids
- clone unlink where deterministic

### Acceptance Criteria

- Every allowed action has a test or documented manual validation path.
- No user-supplied action string reaches Inkscape.
- Tools never rely on hidden GUI selection state.
- Text editability loss returns warnings.

## Workstream 7: Visual Regression And Preview Quality

### Problem

Advanced operations can alter visuals unexpectedly. Agents need image-based checks to compare before/after output.

### Recommended Plan

1. Add preview comparison tools.
2. Store before/after PNGs for selected operations.
3. Add pixel metrics and optional threshold checks.
4. Add region-of-interest comparison.
5. Integrate with operation diffs.

### Candidate Tools

```typescript
compare_previews({
  docId,
  beforeSnapshotId,
  afterSnapshotId?,
  region?,
  metrics?: ["mae" | "rmse" | "exact" | "ssim"]
})
```

```typescript
render_operation_preview({
  docId,
  operation,
  width?,
  dpi?,
  dryRun: true
})
```

### Acceptance Criteria

- Preview comparison does not mutate `current.svg`.
- Unsupported metrics return explicit errors.
- Pixel comparisons record dimensions and comparability.
- Tests cover comparable and non-comparable images.

## Workstream 8: Performance And Token Efficiency

### Problem

Large SVGs and detailed queries can be slow and token-heavy. Advanced workflows need compact response modes and caching.

### Recommended Plan

1. Add response modes consistently across heavy tools.
2. Return ids and summaries by default, not full XML.
3. Add cached query artifacts keyed by content hash.
4. Add streaming or resource-based artifact access where MCP hosts support it.
5. Add timing metadata for slow adapters.

### Acceptance Criteria

- Heavy tools support `responseMode: "compact"`.
- Full SVG payloads are returned only when requested.
- Cached artifacts invalidate on content hash changes.
- Operation timing helps diagnose slow Inkscape calls.

## Workstream 9: Recovery And Session Safety

### Problem

Advanced workflows increase the chance of partial failures. Users need predictable recovery.

### Recommended Plan

1. Expand recovery helpers from Phase 1.
2. Add session summaries for long agent runs.
3. Add "checkpoint" snapshots with labels.
4. Add operation groups for multi-step edits.
5. Add rollback guards for active bidirectional sync.

### Candidate Tools

```typescript
create_checkpoint({ docId, label })
```

```typescript
rollback_to_checkpoint({ docId, checkpointId, confirmDiscardGuiState?: boolean })
```

```typescript
begin_operation_group({ docId, label })
```

```typescript
end_operation_group({ docId, groupId, status })
```

### Acceptance Criteria

- Checkpoints are visible in history.
- Rollback rejects when bidirectional sync is active unless discard is confirmed.
- Operation groups summarize changed ids and warnings.

## Recommended Implementation Order

1. Dependency graph and richer defs query.
2. Layer/group/reparent operations.
3. Transform, bbox, align, distribute, and z-order tools.
4. Text editing and text-to-path workflow.
5. Local raster asset import and image placement.
6. Typed defs creation and update tools.
7. Broader allowlisted Inkscape actions.
8. Visual regression tools.
9. Performance, compact responses, and recovery enhancements.

This order lets the project understand structure and dependencies before it mutates complex SVG features.

## Testing Plan

- Unit tests for dependency graph extraction and reference repair.
- Unit tests for layer/group operations preserving ids.
- Unit tests for transform and ordering operations.
- Tool tests for text edits and conversion warnings.
- Tool tests for raster import path confinement.
- Integration tests for allowlisted Inkscape actions when Inkscape is available.
- Preview comparison tests with known PNG fixtures.
- Regression tests that advanced operations auto-refresh or return refresh warnings consistently.

## Definition Of Done

- Advanced tools preserve existing documents and ids unless an operation explicitly changes structure.
- All new file inputs are local, controlled, and workspace-confined.
- All Inkscape operations are allowlisted and adapter-owned.
- Query and mutation tools expose compact response modes where payloads could be large.
- Every complex mutation has diff, snapshot, warning, and rollback behavior.
- README and Trellis spec document the new contracts.

