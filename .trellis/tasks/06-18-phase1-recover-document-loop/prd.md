# Implement Phase 1 Recover Document Loop

## Goal

Implement the next verifiable Phase 1 recovery-foundation slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: add a narrowly scoped `recover_document` tool that restores the current workspace SVG from an explicit history snapshot/checkpoint.

The outcome should give agents a recovery-oriented command that builds on `create_checkpoint` and existing history snapshots without introducing replay, automatic strategy selection, or unsafe GUI overwrite behavior.

## Boundary Decision

Recommended boundary for this loop:

1. Add `recover_document({ docId, snapshotId, confirmDiscardGuiState? })`.
2. Reuse existing rollback/history snapshot mechanics instead of adding a parallel store.
3. Snapshot the current SVG before replacing it with the chosen recovery snapshot.
4. Return recovery-oriented fields: `recoveredFromSnapshotId`, `preRecoverySnapshotPath`, `restoredPath`, `currentSvgPath`.
5. Preserve active bidirectional GUI guard unless `confirmDiscardGuiState: true`.

This leaves room for later Phase 1 loops:

- recovery strategy selection (`last_snapshot`, `last_checkpoint`, `last_successful_write`)
- replay envelopes with stale-baseline rejection
- dry-run recovery previews
- checkpoint list/filter metadata
- recovery diagnostics for failed refresh or operation diff warnings

## Requirements

- Preserve workspace-authoritative default behavior.
- Recovery must snapshot the current SVG before replacing `current.svg`.
- Recovery must validate the requested snapshot id and reject missing/unsafe ids.
- Recovery must parse and safety-filter the recovered SVG before replacement.
- Active bidirectional GUI sync must block recovery unless `confirmDiscardGuiState: true`.
- Recovery should attempt normal same-window structural refresh after successful workspace replacement.
- Operation log must record a compact recovery entry without raw SVG.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `recover_document`.
- [x] `recover_document` accepts `docId`, `snapshotId`, and `confirmDiscardGuiState`.
- [x] The tool snapshots current state before recovery.
- [x] The tool restores the requested snapshot and returns recovery-oriented fields.
- [x] Unsafe or missing snapshot ids are rejected without changing `current.svg`.
- [x] Active bidirectional sync blocks recovery unless `confirmDiscardGuiState: true`.
- [x] Successful recovery appends a compact operation log entry.
- [x] Successful recovery attempts companion-extension refresh through the existing structural refresh path.
- [x] README documents the recovery tool and its relationship to checkpoints/history.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 recovery contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add `recoverDocumentSchema` beside `rollbackDocumentSchema`.
- Implement `recoverDocument` in `src/tools/document.ts`, likely by sharing or wrapping workspace rollback behavior.
- Register `recover_document` in `src/server.ts`.
- Keep the workspace replacement path snapshot-first and safety-filtered.
- Add tests for normal recovery, unsafe/missing snapshot rejection, and active bidirectional guard behavior.

## Decision (ADR-lite)

**Context**: `rollback_document` exists, but the roadmap needs an explicit recovery tool family that can later grow strategy selection and replay integration.

**Decision**: Add `recover_document` as the first recovery command, scoped to explicit snapshot/checkpoint ids and implemented on the same safe rollback mechanics.

**Consequences**: Agents get a recovery vocabulary without expanding into broad replay or automatic selection yet. Later recovery strategies can reuse the same response shape and safety guard.

## Out Of Scope

- Automatic recovery strategy selection.
- Operation replay.
- Dry-run recovery previews.
- Restore by checkpoint label.
- New checkpoint database or sidecar index.
- Phase 2 layers/defs/text/raster workflows.
- Phase 3 vectorization, OCR, screenshot diagnostics, or agent planning.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Likely implementation files:
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/workspace.test.ts`
  - `tests/sync.test.ts`
