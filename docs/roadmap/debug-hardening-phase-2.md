# Debug And Hardening Phase 2

## Purpose

This is the repeatable debug and hardening checklist for Phase 2: advanced SVG and Inkscape workflows.

Phase 2 expands capability only after Phase 1 evidence is stable. The focus is structured SVG editing through typed tools, dependency-aware mutations, and allowlisted Inkscape operations.

## Invariants

- Every advanced edit preserves unrelated SVG structure.
- Defs references are analyzed before mutation.
- Text remains editable unless conversion is explicit.
- Local raster/font assets are imported into the workspace before use.
- Inkscape-backed operations are allowlisted.
- Compact response modes exist for large outputs.
- Visual regression checks are available for risky operations.

## Debug Targets

- Layer and group structure: wrong parent, lost ids, sibling order drift, hidden/locked layer semantics.
- Defs and references: broken `url(#id)` references, stale reverse references, deleting referenced resources, style string references not updated.
- Text and fonts: accidental text-to-path conversion, missing font warning, text/tspan structure loss.
- Assets: path escape, remote/UNC path rejection, embed vs copy-link confusion.
- Inkscape-backed actions: unsupported action exposed, selection-state reliance, output SVG safety failure, missing editability warning.
- Visual regression: preview mismatch, non-comparable images, weak thresholds.

## Hardening Loops

### Loop 1: Dependency Graph

Build a dependency graph for ids, defs, paint servers, clips, masks, markers, symbols, and hrefs. Keep it read-only first.

Candidate tasks: `query_definitions`, dependency graph tests, broken-reference diagnostics.

### Loop 2: Layers And Groups

Add typed layer/group operations, preserve ids, return diffs, and reject unsafe reparenting.

Candidate tasks: `query_layers`, `create_layer`, `update_layer`, `group_elements`, `ungroup_element`.

### Loop 3: Transforms And Layout

Add deterministic bbox, transform, align, distribute, and z-order tools. Report before/after geometry.

Candidate tasks: `query_bounding_boxes`, `transform_elements`, `align_elements`, `distribute_elements`.

### Loop 4: Text, Fonts, And Assets

Preserve text editability, add explicit conversion warnings, and import local raster assets into workspace.

Candidate tasks: `query_text`, `update_text`, `import_raster_asset`, `place_image`.

### Loop 5: Visual Regression And Allowlisted Actions

Add preview comparison for risky operations, expand allowlisted actions only with tests, and make failures explainable.

Candidate tasks: `compare_previews`, region-of-interest diff, allowlisted `stroke_to_path` or `path_reverse`.

## Five-Loop Execution Template

1. Create a Trellis task that references this document and `phase-2-advanced-svg-inkscape-workflows.md`.
2. Begin with read-only query/diagnostic support when mutation requires new knowledge.
3. Add one typed mutation family only after query evidence exists.
4. Require dependency, id preservation, snapshot, operation diff, and refresh tests.
5. Run typecheck, tests, build, and Inkscape-dependent tests with skip paths.
6. Update README/spec/roadmap memory for new tool contracts.
7. Commit, archive, journal.

## Verification Evidence

- Dependency graph covers every reference the mutation can affect.
- Mutation rejects unsafe or ambiguous dependencies.
- Operation diff identifies changed ids.
- Visual checks exist for Inkscape-backed operations where practical.
- No arbitrary action strings reach Inkscape.
- No hidden GUI selection state.
- Import tools reject remote, URI, UNC, and path escapes.

## Boundaries

Allowed: typed structured SVG tools, dependency-aware defs operations, local font/raster imports, allowlisted Inkscape actions, visual regression tools.

Not allowed: near-1:1 vectorization automation, OCR text reconstruction, screenshot-driven normal editing, arbitrary plugins/actions, direct extension writes to `current.svg`.

