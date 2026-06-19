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

## Five-Pass Refinement Checklist

Run these five passes before selecting the next Phase 3 implementation slice. Phase 3 should optimize for measured fidelity, editability, and recoverability rather than adding a single destructive vectorize/apply command.

### Pass 1: Contract And Invariant Audit

Audit questions:

- Which vectorization operations create artifacts only, and which explicit apply operations may modify `current.svg`?
- Which local engines, OCR tools, image libraries, and metrics are allowlisted and how are they discovered?
- Which candidate metadata fields are required to reproduce or compare a vectorization run?
- Which quality metrics measure visual fidelity, and which measure editability or semantic structure?
- Which screenshot/visible-state diagnostics are read-only, and how is that proven?

Next-step checklist:

- Define candidate artifact schemas before adding new pipeline automation.
- Add explicit apply/insert boundaries with confirmation fields and baseline checks.
- Add dependency discovery contracts for vectorizers, OCR, SSIM/edge metrics, and image rendering.
- Add separate metric namespaces for visual fidelity, structural editability, and semantic confidence.
- Add screenshot diagnostic contracts that forbid mouse/keyboard mutation and SVG writes.

Candidate Trellis slices:

- `vector_candidate_manifest_schema`: source hash, engine, parameters, preprocessing, render path, metrics, and comparability metadata.
- `vector_apply_boundary_contract`: explicit apply/insert tool requirements with confirmation, baseline, snapshot, diff, and recovery behavior.
- `local_dependency_capability_query`: read-only capability report for vectorizers, OCR, metrics, image libraries, and Inkscape render support.

Verification evidence:

- Candidate-generating tools do not modify `current.svg`, metadata, history, operation logs, operation-diffs, or GUI state.
- Apply tools require explicit confirmation and snapshot before mutation.
- Dependency absence returns explicit unavailable errors or skipped optional capability fields.

Stop condition:

- Stop when every Phase 3 operation is classified as artifact-only, explicit apply, read-only diagnostic, or out-of-scope.

### Pass 2: Failure And Edge-Case Audit

Audit questions:

- What happens when candidate generation exceeds time, memory, candidate count, or artifact size limits?
- What happens when source and rendered candidate dimensions, alpha modes, color profiles, or backgrounds are not comparable?
- What happens when OCR confidence is low, language support is missing, or font reconstruction is uncertain?
- What happens when structure optimization improves editability but exceeds visual-delta limits?
- What happens when screenshot diagnostics capture the wrong window or stale visible state?

Next-step checklist:

- Add timeouts, candidate limits, artifact size limits, and cleanup behavior to vectorization jobs.
- Add non-comparable metric results for dimension mismatch, alpha mismatch, render failure, and unsupported metric dependencies.
- Add low-confidence OCR artifacts that remain reviewable and are not silently applied.
- Add optimization stop conditions for visual-delta threshold breaches.
- Add visible-state diagnostics for wrong window, stale window, active-window action ignored, and preview mismatch.

Candidate Trellis slices:

- `vector_job_limit_matrix`: candidate-count, timeout, missing-engine, render-failure, and oversized-artifact tests.
- `metric_non_comparable_cases`: deterministic fixtures for dimension, alpha, render, and unsupported-metric failures.
- `ocr_low_confidence_review_artifacts`: OCR artifacts with confidence bands and explicit apply policy.

Verification evidence:

- Failed candidate jobs leave partial artifacts either absent or clearly marked incomplete.
- Metric outputs always state comparability before numeric interpretation.
- Low-confidence semantic/OCR output is inspectable but not auto-applied.

Stop condition:

- Stop when every lossy or uncertain Phase 3 path produces reviewable evidence instead of silently accepting an approximation.

### Pass 3: Observability And Evidence Audit

Audit questions:

- Can an agent list candidates, inspect metadata, compare metrics, and choose an artifact without reading full SVG content?
- Can a user see why one candidate was ranked above another?
- Can visual failures be localized to regions rather than hidden by global averages?
- Can editability problems be explained by node count, path count, tiny islands, duplicate shapes, groups, transforms, and color count?
- Can screenshots be compared to workspace previews with confidence and diagnosis?

Next-step checklist:

- Add list/read tools for vectorization candidates, metric reports, editability reports, segmentation artifacts, OCR artifacts, and edit plans.
- Add ranking metadata with metric weights and threshold explanations.
- Add region-of-interest metric reports and failure highlights.
- Add editability summaries with visual/editability tradeoff scores.
- Add visible-state diagnostic reports with confidence and likely remediation.

Candidate Trellis slices:

- `candidate_catalog_and_ranking`: compact list/read candidate metadata with ranking reasons and artifact refs.
- `region_metric_reporting`: ROI metrics for localized visual failures and threshold decisions.
- `editability_report_contract`: structural metrics and warnings for over-complex or low-editability SVG artifacts.

Verification evidence:

- Compact candidate listings omit raw SVG and images by default.
- Metric reports include enough metadata to reproduce render/scoring conditions.
- Editability reports distinguish "visually close but hard to edit" from "less faithful but editable".

Stop condition:

- Stop when a future agent can justify selecting, rejecting, optimizing, or applying a candidate using artifact metadata and compact reports alone.

### Pass 4: Automation And Regression-Test Audit

Audit questions:

- Which vectorization and metric behavior can be tested without real external binaries?
- Which optional engines need integration tests with skip paths?
- Which fixtures represent icons, flat logos, diagrams, UI screenshots, text-heavy images, line art, and mixed raster content?
- Which semantic reconstruction cases require confidence thresholds and fallback-to-path behavior?
- Which agent plan flows need dry-run, apply, verify, and recover tests?

Next-step checklist:

- Add fake/stub vectorizer and OCR adapters for deterministic unit tests.
- Add optional integration tests for vtracer, potrace, Tesseract, and SSIM/image libraries when installed.
- Add small fixture images and expected metric/comparability outputs.
- Add semantic reconstruction fixtures for primitive recovery and low-confidence fallback.
- Add edit-plan tests that prove dry-run no-write, apply snapshot, verify diff/preview, and recovery behavior.

Candidate Trellis slices:

- `vectorization_test_harness`: fake engines plus artifact path confinement and manifest assertions.
- `phase3_fixture_pack`: deterministic bitmap/SVG fixtures for line art, flat icons, text, diagrams, UI, and mixed content.
- `edit_plan_lifecycle_tests`: create, dry-run, apply, verify, stop-on-warning, and recover plan paths.

Verification evidence:

- Unit tests do not require optional binaries.
- Integration tests skip only when the specific optional dependency is unavailable.
- Plan tests fail if dry-run mutates workspace or apply skips snapshot/recovery metadata.

Stop condition:

- Stop when Phase 3 automation has deterministic tests for the pipeline contract and optional integration tests for real local engines.

### Pass 5: Rollout, Recovery, And Follow-Up Audit

Audit questions:

- Which vectorization outputs are safe to keep as artifacts and which can be cleaned up?
- Which apply operations need checkpoints, preview comparisons, or user confirmation?
- Which quality thresholds should block apply versus return warnings?
- Which semantic/OCR results require review before insertion?
- Which human-operation areas remain unsupported, diagnostic-only, or unsafe?

Next-step checklist:

- Add artifact retention and cleanup policy for candidates, renders, metrics, OCR, segmentation, and edit plans.
- Add apply gates for baseline hash, visual threshold, editability threshold, and explicit confirmation.
- Add checkpoint and rollback guidance for inserting or replacing artwork with selected candidates.
- Add review policies for low-confidence OCR, primitive reconstruction, and semantic grouping.
- Add or update the human-operation capability matrix after each new operation family.

Candidate Trellis slices:

- `vector_artifact_retention_policy`: retention, cleanup, and protected-artifact rules.
- `candidate_apply_quality_gates`: confirmation plus baseline, visual, editability, and semantic confidence gates.
- `human_operation_capability_matrix`: versioned matrix classifying operations as supported, pure SVG, Inkscape-backed, extension-backed, diagnostic-only, deferred, or out-of-scope.

Verification evidence:

- Cleanup tools cannot delete current SVG, history snapshots, active candidates referenced by plans, or source images.
- Apply tools reject stale baselines and below-threshold candidates before snapshot/write.
- Capability matrix entries link to actual tools, docs, tests, or explicit deferral reasons.

Stop condition:

- Stop when Phase 3 can safely run repeated vectorization/optimization experiments, preserve evidence, and apply only reviewed candidates with rollback.

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

