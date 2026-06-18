# Phase 1 Recover Last Successful Write Strategy

## Goal

Extend `recover_document` with `strategy: "last_successful_write"` as a bounded recovery helper that restores the pre-write snapshot recorded by the most recent successful write operation. This gives agents a practical "undo the last successful write" primitive without introducing operation groups or replay semantics.

## Requirements

- Keep existing explicit `snapshotId` recovery and `strategy: "last_snapshot"` behavior compatible.
- Add a new recovery input form:
  - `recover_document({ docId, strategy: "last_successful_write", confirmDiscardGuiState? })`
- Interpret the strategy as: restore from the `snapshotPath` in the newest successful operation-log entry for the document that has a history snapshot path.
- Do not treat operation-log entries without `snapshotPath` as recoverable writes.
- Do not treat failed/error log entries as recoverable writes.
- Convert the resolved history snapshot path back to a snapshot id and call the existing snapshot-first rollback mechanics.
- Reject when there is no successful write log with a recoverable snapshot before snapshot/write.
- Preserve active bidirectional GUI discard guard unless `confirmDiscardGuiState: true`.
- Return the resolved `snapshotId`, `strategy`, pre-recovery snapshot path, and restored path.
- Log a compact recovery entry that includes the resolved strategy and snapshot id.
- Use the existing structural companion-extension refresh path after successful recovery.
- Document the strategy in README and roadmap memory.

## Acceptance Criteria

- [x] Validation accepts `strategy: "last_successful_write"`.
- [x] Existing XOR validation still rejects ambiguous `snapshotId` plus `strategy` inputs.
- [x] Tool-level tests prove the strategy restores the snapshot path from the newest successful write log entry with a snapshot.
- [x] Tool-level tests prove entries without `snapshotPath` and error entries are skipped.
- [x] Tool-level tests prove missing recoverable logs reject without mutating `current.svg`, writing history, logging operations, or refreshing Inkscape.
- [x] Existing explicit snapshot and `last_snapshot` recovery tests remain green.
- [x] README documents the strategy and its undo-last-write semantics.
- [x] Roadmap memory records the durable Phase 1 contract.
- [x] Focused tests, typecheck, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

- Tests added/updated for validation and tool-level recovery behavior.
- TypeScript typecheck and full test suite pass.
- Documentation and Trellis memory updated in English.
- Work is committed, task archived, journaled, and pushed.

## Technical Approach

Read `workspace/drawings/{docId}/operations.log` through a workspace-confined helper, parse JSONL entries from newest to oldest, and select the first entry with `status: "ok"` and a `snapshotPath` under the document history directory. Convert the filename without `.svg` to `snapshotId`, then reuse the existing `ctx.workspace.rollback(..., "recover_document")` path.

Malformed JSONL lines should be skipped rather than making recovery impossible, because operation logs are an audit aid and history snapshots are authoritative. A selected snapshot must still pass normal history snapshot validation through rollback.

## Decision (ADR-lite)

**Context**: The roadmap includes `last_successful_write`, but operation logs currently record pre-write snapshots, not post-write states.

**Decision**: Define `last_successful_write` as "recover to the pre-write snapshot for the newest successful write log entry." This makes the strategy an undo-last-write helper.

**Consequences**: The strategy is deterministic and uses existing snapshots. It does not yet support grouping multiple operations or recovering to a post-write artifact, which can be added later with operation groups.

## Out of Scope

- Operation groups.
- Multi-step undo.
- Replay-based recovery.
- Restoring to post-write state.
- Parsing operation-diff artifacts to choose a recovery target.
- Adding a new recovery artifact store.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 7.
- Durable contracts: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant implementation areas:
  - `src/core/validation.ts`
  - `src/tools/document.ts`
  - `src/adapters/workspace.ts`
  - `tests/path-validation.test.ts`
  - `tests/workspace.test.ts`
  - `README.md`
