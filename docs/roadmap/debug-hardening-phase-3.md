# Debug And Hardening Phase 3

## Purpose

This is the repeatable debug and hardening checklist for Phase 3: near-1:1 vectorization and broad human-operation coverage.

Phase 3 work is measurement-first. Do not automate destructive vectorization or complex edit plans until artifacts, scoring, rollback, and visual evidence are reliable.

## Invariants

- Vectorization is artifact-first.
- Current SVG is not modified without an explicit apply/insert operation.
- Quality metrics include comparability information.
- Editability is measured separately from visual fidelity.
- OCR and screenshot diagnostics are optional, local, and explicit.
- Agent plans support dry-run, apply, verify, and recovery.

## Debug Targets

- Vectorization pipeline: runaway candidate generation, unsafe artifact paths, missing dependency, poor parameter metadata.
- Quality metrics: non-comparable dimensions, alpha mismatch, edge mismatch, misleading aggregate score, region-specific failures hidden by global score.
- Editability: too many nodes, tiny paths, duplicate shapes, ungrouped semantic regions, excessive transforms.
- Semantic reconstruction: wrong primitive recovery, low-confidence grouping, text treated as paths when editable text is expected.
- OCR: low confidence text, wrong language, font mismatch, text layer misalignment.
- Screenshot diagnostics: wrong active window, stale visible state, workspace preview mismatch, accidental mutation.
- Agent planning: apply without dry-run, missing rollback point, warnings ignored, verification too narrow.

## Hardening Loops

### Loop 1: Artifact Model And Candidate Metadata

Make vectorization candidates self-describing: source hash, engine, parameters, preprocessing, render path, and metrics. Keep current SVG untouched.

Candidate tasks: vectorization manifests, candidate list/query tool, artifact cleanup policy.

### Loop 2: Metrics And Scoring

Add better visual metrics after MAE/RMSE. Include comparability status and region scoring.

Candidate tasks: SSIM if local/testable, edge similarity, alpha coverage, region-of-interest scoring.

### Loop 3: Editability Optimization

Measure structure before optimizing. Apply cleanup only with visual-delta thresholds. Produce new artifacts, never overwrite candidates.

Candidate tasks: `analyze_svg_editability`, node/path count metrics, structure cleanup artifacts.

### Loop 4: Semantic Reconstruction And OCR

Recover primitives only with confidence. Keep low-confidence regions as paths. Add OCR as optional local capability.

Candidate tasks: segmentation artifact format, primitive recovery proposal, local OCR text-region extraction.

### Loop 5: Agent Plans And Visible Diagnostics

Add dry-run edit plans, verify plans with diffs and preview metrics, and keep screenshot diagnostics read-only.

Candidate tasks: `create_edit_plan`, `execute_edit_plan` dry-run mode, `verify_edit_plan`, read-only visible-state diagnostic.

## Five-Loop Execution Template

1. Create a Trellis task that references this document and `phase-3-near-1-1-vectorization.md`.
2. Define the artifact schema before implementing automation.
3. Add scoring/diagnostic evidence before destructive apply paths.
4. Keep current SVG untouched unless an explicit apply operation is in scope.
5. Run typecheck, tests, build, and dependency-specific tests with skip paths.
6. Record metrics and comparability in test fixtures.
7. Update README/spec/roadmap memory.
8. Commit, archive, journal.

## Verification Evidence

- Candidate artifacts remain workspace-confined.
- Missing dependencies produce explicit unavailable errors.
- Metrics state whether comparison is valid.
- Optimization never overwrites source artifacts.
- OCR low-confidence output is reviewable, not silently accepted.
- Screenshot diagnostics are read-only.
- Plans can dry-run and verify before apply.

## Boundaries

Allowed: vectorization artifact manifests, local allowlisted vectorizer/OCR integration, visual/editability metrics, structure optimization artifacts, read-only screenshot diagnostics, dry-run agent plans.

Not allowed: destructive default vectorization, remote vectorization/OCR dependency as core path, screenshot/mouse/keyboard normal editing, arbitrary plugin execution, applying low-confidence semantic reconstruction without review.

