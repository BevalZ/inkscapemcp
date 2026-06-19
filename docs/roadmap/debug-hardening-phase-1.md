# Debug And Hardening Phase 1

## Purpose

This is the repeatable debug and hardening checklist for Phase 1: stabilize the InkSMCP foundation before broad feature expansion.

Phase 1 protects these guarantees: workspace SVG remains authoritative by default, bidirectional GUI sync is explicit and identity-checked, same-window refresh is automatic where supported, write operations snapshot first and produce operation diffs, read-only query/diagnostic tools do not mutate SVG, and token-heavy responses have compact alternatives.

## Current Foundation To Preserve

- `connect_inkscape_window` returns identity and capability summaries.
- `start_gui_sync_polling` can persist explicit polling preferences with `persist: true`.
- `get_gui_sync_status` reports polling, skip, conflict, error, backoff, and persisted preference status.
- `query_document` supports compact response mode and dependency summaries.
- Workspace write operations produce `operation-diffs/` artifacts when possible.
- `diagnose_inkscape_gui` returns readiness and remediation without mutation.

## Debug Targets

- Identity ambiguity: missing `windowId`, missing `runtimeDocumentId`, multiple active bidirectional connections, stale connection sidecars.
- GUI sync: manifest missing, marker mismatch, revision/hash conflict, polling overlap, polling backoff, persisted polling reload.
- Same-window refresh: companion action not loaded, extension missing, active-window attribute sync failure, Windows redraw failure.
- Query and token use: compact mode omits full tree, dependency summary catches broken refs, semantic fingerprints remain read-only.
- Write recovery: snapshot exists before mutation, operation diff exists after mutation, diff failure returns warning only, rollback is guarded with active bidirectional sync.

## Hardening Loops

### Loop 1: Status Completeness

- Add missing status fields only when they help agents make safer decisions.
- Keep fields machine-readable.
- Avoid raw SVG or large payloads in status output.

Candidate tasks: readiness score, stale connection cleanup report, polling reload smoke test.

### Loop 2: Conflict Reproduction

- Create deterministic fixtures for GUI/workspace conflicts.
- Make each conflict class independently testable.
- Preserve conservative merge behavior.

Candidate tasks: conflict fixture builder, merge preview artifact, conflict report regression snapshots.

### Loop 3: Operation Diff Coverage

- Ensure every write path produces diff artifacts or explicit warnings.
- Add tests for text, structure, attribute, and id-change diffs.
- Keep diff compact and artifact-based.

Candidate tasks: `diff_document_snapshots`, diff artifact resource, write warning test for diff failure.

### Loop 4: Query Reliability

- Expand dependency summaries without editing defs.
- Add compact output tests for large documents.
- Keep full output available for diagnosis.

Candidate tasks: `includePathNodes` on `query_document`, reverse references, unresolved-reference severity.

### Loop 5: Recovery And Replay Foundation

- Add dry-run for complex operations.
- Add replay only for deterministic operation envelopes.
- Keep recovery snapshot-first.

Candidate tasks: checkpoint tool, last-write recovery helper, operation replay with stale baseline rejection.

## Five-Pass Refinement Checklist

Run these five passes before selecting the next Phase 1 implementation slice. Each pass should leave behind either a Trellis task, a test fixture, or a documented reason to defer.

### Pass 1: Contract And Invariant Audit

Audit questions:

- Which tools are read-only, and do tests prove they never snapshot, log, write metadata, create operation artifacts, or refresh Inkscape?
- Which tools write `current.svg`, and do tests prove validation and active bidirectional pre-pull happen before snapshot/write?
- Which write tools use direct active-window attribute sync, and which must use structural companion refresh?
- Which contracts rely on document identity, connection identity, revision, or content hash?
- Which response fields are stable enough for agents to branch on?

Next-step checklist:

- Add or refresh contract tests for every read/query/diagnostic tool.
- Add write-order tests for pre-pull, validation, snapshot, save, diff, log, and refresh.
- Add a status field inventory for sync, polling, refresh, and operation preview artifacts.
- Add negative tests for ambiguous bidirectional connections and missing identity fields.
- Add compact response snapshots for high-token query/status paths.

Candidate Trellis slices:

- `diagnose_read_only_side_effects`: prove each diagnostic/query path has no workspace or GUI side effects.
- `write_order_regression_matrix`: table-driven tests for every write tool's pre-pull/snapshot/diff/log/refresh order.
- `sync_identity_status_inventory`: make identity strength, capability, and ambiguity fields consistent across status tools.

Verification evidence:

- Unit/tool tests assert no history, metadata, operation log, operation-diff, or refresh calls for read-only paths.
- Write tests inspect call order or artifacts, not just final SVG content.
- `query_document` compact fixtures remain token-conscious and machine-readable.

Stop condition:

- Stop only when a future agent can classify any Phase 1 tool as read-only, attribute-write, structural-write, recovery-write, or GUI-sync from docs and tests alone.

### Pass 2: Failure And Edge-Case Audit

Audit questions:

- What happens when the GUI extension is missing, stale, or not loaded in the active window?
- What happens when a GUI pull manifest is missing, malformed, or identity-mismatched?
- What happens when workspace revision/hash changed after a preview, replay, or id-repair proposal?
- What happens when operation-diff generation fails after a valid save?
- What happens when a rollback/recovery request races with active bidirectional sync?

Next-step checklist:

- Add deterministic fixtures for identity mismatch, stale baselines, and merge conflict classes.
- Add warning-only tests for non-critical post-save failures such as refresh or diff generation.
- Add rejection tests for stale previews, stale replay baselines, and stale id-repair applications.
- Add recovery tests that prove rollback guards respect active bidirectional sync.
- Add polling tests for overlap prevention, backoff, persisted reload, and stop behavior.

Candidate Trellis slices:

- `gui_sync_failure_fixture_pack`: reusable fixtures for missing manifest, marker mismatch, stale hash, and extension unavailable.
- `post_save_warning_boundaries`: prove refresh/diff failures warn without rolling back valid SVG writes.
- `stale_artifact_apply_rejections`: reject stale operation previews, replay baselines, and id-repair proposals before snapshot/write.

Verification evidence:

- Error details include machine-readable codes and enough fields for agent recovery.
- Warnings are returned only after the primary mutation succeeded.
- Failed preconditions leave `current.svg`, history, metadata, logs, operation-diffs, and GUI state unchanged.

Stop condition:

- Stop when every expected Phase 1 failure mode has a fixture and the failure either rejects before side effects or returns a documented warning after success.

### Pass 3: Observability And Evidence Audit

Audit questions:

- Can a user or agent explain what changed after any write without reading the whole SVG?
- Can a user or agent tell whether the open Inkscape window is current, stale, wrong, or unsupported?
- Are operation previews, merge previews, checkpoints, and history snapshots discoverable by compact tools?
- Do status tools report enough timestamps, hashes, ids, and warnings without exposing large payloads?
- Are there clear remediation strings for extension, Inkscape, and sync failures?

Next-step checklist:

- Add compact list/read tools or response modes for any artifact family that lacks them.
- Add artifact metadata fields for source hash, baseline, createdAt, toolName, and changed ids.
- Add diagnostic readiness and remediation fields for refresh, pull, push, and polling.
- Add operation-diff summaries to successful write responses where practical.
- Add docs that map warning codes to next actions.

Candidate Trellis slices:

- `artifact_catalog_consistency`: normalize list/read metadata for operation previews, merge previews, checkpoints, and diffs.
- `gui_refresh_observability`: expose whether refresh used direct attribute sync, companion pull, skipped, or warned.
- `warning_remediation_catalog`: document and test structured remediation for common Phase 1 warning codes.

Verification evidence:

- Compact artifact/status tools return ids and summaries without raw SVG by default.
- Full modes remain available for diagnosis.
- Warning/error details are stable enough for tests and agent branching.

Stop condition:

- Stop when every Phase 1 artifact or sync state can be listed, inspected compactly, and tied back to a baseline hash or snapshot id.

### Pass 4: Automation And Regression-Test Audit

Audit questions:

- Which contracts are currently protected only by manual testing?
- Which Inkscape-dependent tests have deterministic skip paths?
- Which path command families are query-only versus editable, and is that matrix tested?
- Which response-mode variants lack coverage?
- Which fixtures can be reused across sync, diff, replay, and recovery tests?

Next-step checklist:

- Add a matrix test for tool side effects by category.
- Add response-mode tests for compact, standard, and full where tools support them.
- Add path command support matrix tests for query, validate, edit, and transform behavior.
- Add Inkscape adapter tests for unavailable, timeout, non-zero, and success-with-warning cases.
- Add fixture helpers for SVG documents with ids, defs, paths, text, and conflicting GUI/workspace edits.

Candidate Trellis slices:

- `phase1_side_effect_matrix_tests`: one matrix covering read-only, dry-run, preview, write, rollback, and refresh tools.
- `path_support_matrix`: keep editable/query-only/unsupported path command behavior explicit.
- `inkscape_adapter_failure_matrix`: adapter-level tests for missing binary, timeout, failed action, and warning propagation.

Verification evidence:

- `npm run typecheck`, `npm test`, `npm run build`, and extension self-test pass.
- Tests fail when a read-only path writes, a write path skips snapshot, or an unsupported path command becomes editable accidentally.
- Inkscape-dependent tests skip only when the dependency is actually unavailable.

Stop condition:

- Stop when regression tests would catch the last three classes of user-reported Phase 1 breakage: manual refresh required, wrong document/window, and unintended full-document replacement.

### Pass 5: Rollout, Recovery, And Follow-Up Audit

Audit questions:

- Can users recover from a failed edit, stale GUI state, or bad preview application?
- Are potentially destructive operations gated by explicit confirmation fields?
- Are new tools documented with good/base/bad examples?
- Are follow-up tasks small enough to finish in one Trellis loop?
- Does roadmap memory capture any new durable contract?

Next-step checklist:

- Add explicit confirmation fields to destructive or review-apply tools.
- Add recovery guidance to warnings for stale baselines, active bidirectional rollback guards, and refresh failures.
- Add or update roadmap memory when a new tool contract ships.
- Split remaining work into one-slice Trellis PRDs.
- Archive completed tasks and record session journals after verification.

Candidate Trellis slices:

- `phase1_recovery_guidance`: standardize recovery instructions across rollback, recover, apply preview, replay, and id repair.
- `destructive_confirmation_audit`: ensure destructive paths require explicit confirmation and tests cover missing confirmation.
- `phase1_task_backlog_refresh`: convert remaining unchecked candidates into bounded Trellis tasks.

Verification evidence:

- Destructive calls without confirmation reject before side effects.
- Recovery docs reference actual tools and artifact ids, not vague manual steps.
- Roadmap memory contains only durable contracts, not transient task notes.

Stop condition:

- Stop when each Phase 1 follow-up has a clear owner document, one acceptance test target, and a rollback/recovery story.

## Five-Loop Execution Template

1. Create a Trellis task that references this document and `phase-1-stabilize-foundations.md`.
2. Define a narrow vertical slice with explicit out-of-scope items.
3. Implement one durable runtime improvement and its tests.
4. Run `npm run typecheck`, `npm test`, `npm run build`, and `python inkscape-extension/inksmcp_pull.py --self-test`.
5. Update README/spec/roadmap memory if contracts changed.
6. Commit work, archive task, record journal.
7. Add remaining follow-ups to the next loop's PRD.

## Verification Evidence

- `git diff --check` passes.
- Tests prove the exact contract, not just adjacent behavior.
- New write paths snapshot first.
- New status/query paths are read-only unless explicitly documented.
- Sync paths reject ambiguity instead of guessing.
- No default `file-rebase`.
- No arbitrary action execution.
- No GUI mouse/keyboard automation as primary path.

## Boundaries

Allowed: sync status hardening, workspace metadata, compact query outputs, operation diff artifacts, conservative diagnostics, recovery foundations.

Not allowed: layer/defs editing tools, raster asset workflows, OCR, multi-pass vectorization, screenshot-driven normal editing, arbitrary Inkscape actions.

