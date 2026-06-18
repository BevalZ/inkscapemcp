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

