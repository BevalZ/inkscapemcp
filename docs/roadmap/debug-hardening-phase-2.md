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

## Five-Pass Refinement Checklist

Run these five passes before selecting the next Phase 2 implementation slice. Phase 2 should never add mutation before the matching query, dependency, and regression evidence exists.

### Pass 1: Contract And Invariant Audit

Audit questions:

- Which advanced SVG structures can be queried before mutation: layers, groups, defs, text, assets, transforms, and z-order?
- Which mutations can break id references, defs dependencies, text editability, image links, or layer/group membership?
- Which operations are pure SVG edits, which are Inkscape-backed, and which need companion extension behavior?
- Which tools may return large payloads and therefore need compact response modes or artifact references?
- Which operations change object identity or editability and therefore need explicit warnings?

Next-step checklist:

- Add read-only query contracts before each typed mutation family.
- Add dependency graph fields for references, reverse references, unresolved references, and dependency-sensitive deletes.
- Add response-mode requirements for heavy layer, dependency, text, asset, bbox, and visual-diff tools.
- Add warning contracts for text-to-path, stroke-to-path, ungroup id drift, geometry replacement, and missing fonts/assets.
- Add pure-SVG versus Inkscape-backed classification to each candidate tool.

Candidate Trellis slices:

- `phase2_dependency_graph_query`: read-only graph for defs, url references, hrefs, images, markers, clips, masks, symbols, and unresolved refs.
- `phase2_operation_classification_matrix`: document and test pure SVG, Inkscape-backed, extension-backed, and diagnostic-only advanced operations.
- `phase2_editability_warning_contracts`: standardize warnings for operations that reduce editability or rewrite ids.

Verification evidence:

- Query tools are side-effect free and tested like Phase 1 read-only tools.
- Mutation tools reject unsafe dependencies before snapshot/write.
- Warning codes and changed-id summaries are stable and test-covered.

Stop condition:

- Stop when every Phase 2 candidate mutation has a preceding query contract, dependency impact model, and response-size strategy.

### Pass 2: Failure And Edge-Case Audit

Audit questions:

- What happens when deleting or renaming a referenced gradient, marker, clipPath, mask, pattern, symbol, or image?
- What happens when reparenting would move an element outside a clip/mask/group/layer dependency context?
- What happens when Inkscape rewrites ids, strips metadata, converts text, or changes grouping during an allowlisted action?
- What happens when a linked asset is missing, outside the workspace, remote, UNC, or has unsafe data?
- What happens when text layout differs because a font is missing or unavailable to Inkscape?

Next-step checklist:

- Add dependency-sensitive reject tests for deletes, renames, reparenting, grouping, and ungrouping.
- Add id preservation and id drift tests for Inkscape-backed geometry/actions.
- Add asset import rejection tests for remote URLs, `file:` URIs, UNC paths, path escapes, and unsupported formats.
- Add font warning tests for imported, missing, and fallback font cases where detectable.
- Add visual non-comparability tests for preview diffs with different dimensions, alpha modes, or render failures.

Candidate Trellis slices:

- `defs_dependency_mutation_guards`: reject dependency-breaking edits unless an explicit confirmed policy exists.
- `group_reparent_conflict_fixtures`: fixtures for parent deletion, sibling order drift, hidden/locked layers, and referenced children.
- `asset_and_font_failure_matrix`: controlled local asset/font import errors and warnings.

Verification evidence:

- Failed dependency and asset validations leave current SVG, history, logs, operation-diffs, and refresh untouched.
- Inkscape-backed failures return `INKSCAPE_UNAVAILABLE`, `INKSCAPE_TIMEOUT`, or `INKSCAPE_FAILED` with useful details.
- Editability-loss warnings are returned only for successful operations that actually caused loss.

Stop condition:

- Stop when advanced SVG failures reject before mutation unless the failure is an explicitly documented post-save warning.

### Pass 3: Observability And Evidence Audit

Audit questions:

- Can an agent inspect layer/group hierarchy without reading the full tree?
- Can an agent explain why a defs mutation is unsafe before trying it?
- Can an agent compare before/after visuals and know whether the comparison is valid?
- Can an agent inspect text and font risk without converting text to paths?
- Can an agent discover imported assets, linked image references, and missing assets compactly?

Next-step checklist:

- Add compact summaries for layers, groups, definitions, assets, text, bboxes, and visual comparisons.
- Add before/after changed-id and dependency-impact summaries to every advanced mutation.
- Add artifact metadata for preview comparisons and operation render previews.
- Add timing metadata for Inkscape-backed operations and slow query paths.
- Add `include*` switches that default to summaries and require explicit full payload requests.

Candidate Trellis slices:

- `layer_group_compact_query`: compact hierarchy summary with optional object details.
- `defs_dependency_explainability`: explain unsafe update/delete decisions with reverse-reference evidence.
- `preview_comparison_artifacts`: list/read visual diff artifacts with comparability, metrics, and changed ids.

Verification evidence:

- Compact mode omits raw SVG and large XML payloads by default.
- Full/detail modes are available when a user or agent explicitly needs diagnosis.
- Visual metrics include dimensions, render settings, comparability, and region metadata.

Stop condition:

- Stop when every Phase 2 advanced operation can produce enough compact evidence for an agent to decide the next safe action.

### Pass 4: Automation And Regression-Test Audit

Audit questions:

- Which advanced features need pure unit tests versus Inkscape integration tests?
- Which Inkscape actions need skip paths when the binary is unavailable?
- Which fixtures exercise defs references in both attributes and inline styles?
- Which layout operations need deterministic ordering and tie-break rules?
- Which text, asset, and visual regression paths need deterministic sample fixtures?

Next-step checklist:

- Add reusable SVG fixtures for layers, nested groups, defs, styles, text/tspans, images, and transforms.
- Add unit tests for dependency extraction and conservative reference repair.
- Add tool tests for snapshot/write/diff/log/refresh behavior on each mutation family.
- Add integration tests for allowlisted Inkscape actions with explicit selected ids and unavailable skip paths.
- Add preview comparison fixture tests for comparable and non-comparable images.

Candidate Trellis slices:

- `phase2_svg_fixture_pack`: canonical advanced SVG fixtures used across layer, defs, text, asset, transform, and visual tests.
- `allowlisted_action_integration_matrix`: one integration test per allowlisted action category with unavailable skip behavior.
- `layout_determinism_tests`: align, distribute, z-order, and transform tests with stable sort and tie-break rules.

Verification evidence:

- `npm run typecheck`, `npm test`, `npm run build`, and extension self-test pass.
- Tests fail if arbitrary action strings reach Inkscape or GUI selection state is used.
- Tests prove operation diffs identify changed ids and dependency-sensitive changes.

Stop condition:

- Stop when every Phase 2 mutation family has at least one success, one validation rejection, one dependency or id-preservation test, and one refresh/warning test.

### Pass 5: Rollout, Recovery, And Follow-Up Audit

Audit questions:

- Which advanced operations need dry-run or preview before apply?
- Which operations should create checkpoints because they touch many ids or external assets?
- Which tools need explicit confirmation before deleting resources, converting text, unlinking clones, or applying Inkscape rewrite output?
- Which advanced artifacts need retention or cleanup policy?
- Which follow-up tasks should move to Phase 3 because they depend on visual scoring or semantic reconstruction?

Next-step checklist:

- Add dry-run or preview modes for multi-object, defs, layout, and Inkscape-backed operations.
- Add checkpoint guidance before broad layer/group/defs/action changes.
- Add confirmation fields for destructive dependency edits and editability-loss conversions.
- Add artifact retention notes for visual comparisons, rendered operation previews, and imported assets.
- Split near-1:1 vectorization, OCR, and semantic reconstruction follow-ups into Phase 3 docs instead of Phase 2 tasks.

Candidate Trellis slices:

- `advanced_operation_preview_boundary`: dry-run/preview envelopes for high-risk Phase 2 mutations.
- `destructive_defs_confirmation`: confirmation and recovery contract for dependency-sensitive resource deletion or replacement.
- `phase2_artifact_retention_policy`: retention and cleanup rules for visual diffs, operation previews, and assets.

Verification evidence:

- Dry-run modes produce no workspace writes, logs, operation-diffs, metadata updates, or refresh calls.
- Confirmed destructive mutations snapshot first and include recovery guidance.
- Artifact cleanup cannot delete current SVG, history snapshots, or referenced assets by accident.

Stop condition:

- Stop when each Phase 2 candidate is either safe for direct apply, requires preview/checkpoint/confirmation, or is explicitly deferred to Phase 3.

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

