# Implement Phase 1 Deterministic Operation Replay Loop

## Goal

Implement the next Phase 1 recovery/replay foundation slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: add a deterministic `replay_operations` tool for controlled `apply_svg_operations` batches, with stale baseline rejection and optional dry-run output.

The outcome should let agents safely re-apply a known operation envelope only when the current workspace document still matches the expected baseline. This builds directly on `preview_svg_operations` and operation diff artifacts.

## Boundary Decision

Recommended boundary for this loop:

1. Add `replay_operations({ docId, operations, baseline?, dryRun?, responseMode?, allowStaleRead?, skipPrePull? })`.
2. Reuse the existing controlled `operationSchema` and `applyOperationsToSvg`.
3. Reuse `diffSvgDocuments` and compact/full response modes.
4. For write mode, require baseline identity and reject stale current state before mutation.
5. For dry-run mode, behave like `preview_svg_operations` plus baseline verification.
6. Write mode should snapshot, update metadata, append operation log, produce operation-diff artifacts, and refresh using the same attribute-sync/structural-refresh decision as `apply_svg_operations`.

This loop intentionally does not add saved replay plans, operation groups, saved dry-run artifacts, automatic last-operation discovery, cross-document replay, or non-operation tool replay.

## Requirements

- Preserve workspace-authoritative default behavior.
- `baseline` should support the current document metadata boundary: `revision` and `contentHash`.
- Write-mode replay must reject when current metadata differs from the supplied baseline.
- Write-mode replay must not expose `skipPrePull`; it must pre-pull active bidirectional GUI state before checking the baseline.
- Dry-run replay may expose `skipPrePull` and `allowStaleRead` like read-only query tools.
- Dry-run replay must leave `current.svg`, metadata, history, operation logs, and operation-diff directories unchanged.
- Successful write-mode replay must use the same mutation semantics as `apply_svg_operations`.
- Successful write-mode replay must return changed ids, snapshot path, current SVG path, operation diff diagnostics, and GUI refresh result.
- Compact mode should return summary counts and changed ids without full change arrays.
- Full mode should include the structured diff from the shared diff engine.
- Invalid operations and stale baselines must reject without changing state.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `replay_operations`.
- [x] `replay_operations` accepts `docId`, `operations`, `baseline`, `dryRun`, `responseMode`, `allowStaleRead`, and `skipPrePull`.
- [x] Write mode rejects missing baseline identity.
- [x] Write mode rejects stale `revision` or `contentHash` before writing.
- [x] Write mode pre-pulls active bidirectional GUI state before baseline comparison.
- [x] Dry-run mode supports stale-read warning behavior and does not mutate workspace state.
- [x] Compact mode returns summary counts and changed ids without full change arrays.
- [x] Full mode returns the structured diff from the shared diff engine.
- [x] Successful write mode snapshots, updates metadata, appends an operation log, produces operation-diff diagnostics, and attempts the correct GUI refresh path.
- [x] Invalid operation batches reject without changing state.
- [x] README documents the replay baseline and dry-run contract.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 replay contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add `operationReplayBaselineSchema` and `replayOperationsSchema` near `previewSvgOperationsSchema`.
- Implement `replayOperations` in `src/tools/document.ts` or a small helper module.
- Reuse `preview_svg_operations` formatting helpers where practical.
- For write mode:
  - call `prePullBeforeCurrentStateWrite`
  - read metadata and verify baseline
  - use `workspace.writeSvgWithSnapshot`
  - append an operation log
  - choose direct attribute sync for attribute-only batches, otherwise structural companion refresh
- For dry-run mode:
  - call `prePullBeforeCurrentStateRead`
  - verify baseline if supplied
  - apply in memory and diff only
- Register the tool in `src/server.ts`.
- Add focused tests for write success, stale baseline rejection, missing baseline rejection, dry-run no-write behavior, and GUI refresh selection.

## Decision (ADR-lite)

**Context**: Phase 1 now has operation diffs, snapshot diffs, checkpoints, recovery, and read-only operation dry-run. Replay should be deterministic and conservative rather than a broad automation surface.

**Decision**: Add replay only for the existing controlled SVG operation envelope, with explicit baseline metadata guarding write mode.

**Consequences**: Agents can safely repeat planned edits when document state is unchanged. Later operation groups and saved replay artifacts can build on the same baseline contract.

## Out Of Scope

- Saved replay plan artifacts.
- Operation groups.
- Replay of arbitrary tool calls.
- Replay from operation logs.
- Automatic last-good or last-operation discovery.
- Saved preview artifacts.
- Cross-document replay.
- Phase 2 geometry/action replay.
- Phase 3 vectorization workflows.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Prior loop foundation: `preview_svg_operations`.
- Likely implementation files:
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/replay-operations.test.ts`
