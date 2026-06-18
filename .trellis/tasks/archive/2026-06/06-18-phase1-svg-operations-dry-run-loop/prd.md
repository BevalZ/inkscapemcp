# Implement Phase 1 SVG Operations Dry-Run Loop

## Goal

Implement the next verifiable Phase 1 recovery/replay foundation slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: add a read-only `preview_svg_operations` tool that applies controlled SVG operations in memory and returns the same style of structured diff used by operation artifacts.

The outcome should let agents inspect the effect of a batch before saving, which is a prerequisite for safer replay, recovery, and complex edits.

## Boundary Decision

Recommended boundary for this loop:

1. Add `preview_svg_operations({ docId, operations, responseMode? })`.
2. Reuse existing `applyOperationsToSvg` validation/mutation logic on an in-memory SVG string.
3. Reuse the existing `diffSvgDocuments` engine for the preview result.
4. Keep the tool strictly read-only: no snapshot, no `current.svg` write, no metadata update, no operation log, no operation-diff artifact, no GUI refresh.
5. Do not add operation replay or saved preview artifacts in this loop.

This leaves room for later Phase 1 loops:

- deterministic `replay_operations`
- stale baseline rejection
- saved dry-run preview artifacts
- operation groups and checkpoint association
- dry-run support for additional non-batch tools

## Requirements

- Preserve workspace-authoritative default behavior.
- The dry-run must leave `current.svg`, metadata, history, operation logs, and operation-diff directories unchanged.
- The dry-run must fail with the same validation behavior as `apply_svg_operations` for missing ids, unsafe changes, and invalid operations.
- Successful compact mode must return summary counts plus added/removed/changed ids.
- Full mode must include structured attribute, text, and structure changes from the diff engine.
- Current-state reads should use the existing bidirectional pre-pull behavior for query-like freshness. `allowStaleRead: true` may return stale workspace output with a warning if pre-pull fails.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `preview_svg_operations`.
- [x] `preview_svg_operations` accepts `docId`, `operations`, `responseMode`, `allowStaleRead`, and `skipPrePull`.
- [x] Compact dry-run returns summary counts and changed ids without full change arrays.
- [x] Full dry-run returns the structured diff from the shared diff engine.
- [x] The tool leaves current SVG bytes unchanged.
- [x] The tool leaves metadata, history, operation logs, and operation-diff artifacts unchanged.
- [x] Invalid operation batches reject without changing state.
- [x] No Inkscape refresh or active-window attribute sync is attempted.
- [x] README documents the tool and read-only dry-run contract.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 dry-run contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add `previewSvgOperationsSchema` near `applySvgOperationsSchema`.
- Add a tool handler in `src/tools/document.ts` or a small helper module that reads current SVG, applies `applyOperationsToSvg` in memory, diffs before/after, and formats compact/full responses.
- Register the tool in `src/server.ts`.
- Use `prePullBeforeCurrentStateRead` to match query freshness behavior and stale-read warnings.
- Add tests proving read-only behavior and diff shape.

## Decision (ADR-lite)

**Context**: Phase 1 needs dry-run and replay foundations. `apply_svg_operations` already represents deterministic controlled operation batches, and operation-diff artifacts already have a structured diff engine.

**Decision**: Add a read-only dry-run tool for controlled SVG operation batches, reusing the existing operation and diff engines instead of creating a parallel preview model.

**Consequences**: Agents can inspect planned changes before writing. Later replay and operation-group tools can build on the same operation envelope and diff output.

## Out Of Scope

- Saving preview artifacts.
- Replaying operations.
- Dry-run for non-batch tools.
- Strategy-based recovery.
- GUI refresh.
- Inkscape actions.
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
  - `tests/preview-operations.test.ts` or `tests/workspace.test.ts`
