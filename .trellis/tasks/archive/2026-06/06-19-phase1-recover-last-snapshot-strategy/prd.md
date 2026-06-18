# Phase 1 Recover Last Snapshot Strategy

## Goal

Extend `recover_document` with the first bounded strategy-based recovery mode, `strategy: "last_snapshot"`, so agents can recover from the most recent history entry without manually listing and copying a snapshot id. This fills a Phase 1 recovery-roadmap gap while preserving the existing explicit snapshot recovery contract.

## Requirements

- Keep existing `recover_document({ docId, snapshotId, confirmDiscardGuiState? })` behavior compatible.
- Add a new recovery input form:
  - `recover_document({ docId, strategy: "last_snapshot", confirmDiscardGuiState? })`
- Resolve `last_snapshot` to the most recent history snapshot for the document.
- Reject when no history snapshot exists before snapshot/write.
- Preserve active bidirectional GUI discard guard unless `confirmDiscardGuiState: true`.
- Preserve snapshot-before-replace behavior by reusing the existing workspace rollback mechanics.
- Return the resolved `snapshotId` and the pre-recovery snapshot path.
- Log a compact recovery entry that includes the resolved strategy.
- Use the existing structural companion-extension refresh path after successful recovery.
- Document the strategy in README and roadmap memory.

## Acceptance Criteria

- [x] Validation accepts either explicit `snapshotId` or `strategy: "last_snapshot"`.
- [x] Validation rejects inputs with neither `snapshotId` nor `strategy`, or with both.
- [x] Tool-level tests prove `last_snapshot` restores the newest snapshot and snapshots the pre-recovery state.
- [x] Tool-level tests prove `last_snapshot` rejects empty history without mutating `current.svg`, writing history, logging operations, or refreshing Inkscape.
- [x] Existing explicit snapshot recovery tests remain green.
- [x] README documents the strategy and compatibility boundary.
- [x] Roadmap memory records the durable Phase 1 contract.
- [x] Focused tests, typecheck, full tests, build, extension self-test, and `git diff --check` pass.

## Definition of Done

- Tests added/updated for validation and tool-level recovery behavior.
- TypeScript typecheck and full test suite pass.
- Documentation and Trellis memory updated in English.
- Work is committed, task archived, journaled, and pushed.

## Technical Approach

Use a single schema with an XOR refinement between `snapshotId` and `strategy`. At runtime, resolve `strategy: "last_snapshot"` by reading history and choosing the newest snapshot from the existing `Workspace.listHistory` ordering. Then call the same rollback path used by explicit snapshot recovery.

## Decision (ADR-lite)

**Context**: Phase 1 already established explicit snapshot/checkpoint recovery. The roadmap also calls for strategy-based helpers, but broad strategies can become ambiguous.

**Decision**: Add only `last_snapshot` in this slice. Leave `last_successful_write` and `workspace_current` for later tasks because they require more careful operation-log semantics and may not all imply a replacement.

**Consequences**: Agents get a useful recovery shortcut with no new persistence model. The existing explicit snapshot contract remains the authoritative and safest path.

## Out of Scope

- `strategy: "last_successful_write"`.
- `strategy: "workspace_current"`.
- Multi-step recovery planning.
- Operation-group recovery.
- Replay integration.
- Changing history retention or ordering.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 7.
- Durable contracts: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant implementation areas:
  - `src/core/validation.ts`
  - `src/tools/document.ts`
  - `tests/path-validation.test.ts`
  - `tests/workspace.test.ts`
  - `README.md`
