# Implement Phase 1 Checkpoint Tool Loop

## Goal

Implement the next verifiable Phase 1 recovery-foundation slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: add an explicit checkpoint tool that creates a named recovery anchor without changing SVG content.

The outcome should let agents mark a known-good document state before complex edits, so later dry-run, replay, and recovery tools can build on a clear snapshot contract.

## Boundary Decision

Recommended boundary for this loop:

1. Add `create_checkpoint({ docId, label?, description? })`.
2. Implement checkpoints as explicit history snapshots of the current SVG.
3. Preserve SVG content byte-for-byte; only workspace history/metadata/log artifacts may change.
4. Return a compact checkpoint summary, current document metadata, and the snapshot path.
5. Do not add replay, restore-by-label, dry-run, or automatic recovery in this loop.

This leaves room for later Phase 1 loops:

- `recover_document` using checkpoint/snapshot selection policies
- deterministic replay envelopes with stale-baseline rejection
- dry-run previews for complex operation batches
- checkpoint listing/filtering by label and operation group
- recovery diagnostics for failed refresh or partial external operations

## Requirements

- Preserve workspace-authoritative default behavior.
- `create_checkpoint` must snapshot before recording the checkpoint result.
- The checkpoint operation must not alter `current.svg` content.
- The checkpoint must be visible through existing history listing.
- The checkpoint result must include `docId`, `checkpointId`, `snapshotId`, `snapshotPath`, optional label/description, and current document summary.
- Label and description must be bounded strings.
- All new inputs must use typed Zod schemas.
- Operation logs may record a compact checkpoint entry, but must not include raw SVG.
- No GUI refresh should be attempted because SVG content is unchanged.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `create_checkpoint`.
- [x] `create_checkpoint` accepts `docId`, optional `label`, and optional `description`.
- [x] The tool creates a history snapshot and returns a stable checkpoint summary.
- [x] `current.svg` remains byte-identical after checkpoint creation.
- [x] `list_history` includes the checkpoint snapshot.
- [x] Operation log records a compact checkpoint entry without raw SVG.
- [x] No Inkscape refresh or active-window attribute sync is attempted.
- [x] README documents the tool and its non-mutating recovery purpose.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 checkpoint contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add a workspace method that copies the current SVG to history without replacing `current.svg`.
- Reuse existing metadata/history patterns instead of creating a parallel checkpoint store.
- Keep tool registration thin in `src/server.ts`.
- Put tool behavior in `src/tools/document.ts` because checkpoints are document lifecycle/recovery operations.
- Add tests at the tool/workspace boundary to prove byte-identical current SVG and no GUI refresh.

## Decision (ADR-lite)

**Context**: Later replay and recovery tools need explicit recovery anchors, but a full replay engine is too broad for this loop.

**Decision**: Add a checkpoint tool that creates a named history snapshot of the current document without changing SVG content.

**Consequences**: Agents can establish known-good restore points before risky edits. Future recovery tools can select from history/checkpoint snapshots without needing a new persistence mechanism.

## Out Of Scope

- Replaying operations.
- Dry-run operation execution.
- Restoring by checkpoint label.
- New checkpoint database or sidecar index.
- GUI refresh.
- Inkscape actions.
- Phase 2 layers/defs/text/raster workflows.
- Phase 3 vectorization, OCR, screenshot diagnostics, or agent planning.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Likely implementation files:
  - `src/adapters/workspace.ts`
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/history.test.ts` or a new focused checkpoint test
