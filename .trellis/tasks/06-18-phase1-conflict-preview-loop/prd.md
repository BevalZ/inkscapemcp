# Implement Phase 1 Conflict Preview Loop

## Goal

Implement the next verifiable Phase 1 slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: make GUI/workspace conflict reproduction and merge preview deterministic, structured, and artifact-first.

The outcome should let agents explain pull conflicts and inspect conservative merge candidates without replacing `current.svg`.

## Boundary Decision

Recommended boundary for this loop:

1. Add deterministic conflict fixtures for independently testable workspace-vs-GUI conflict classes.
2. Add a preview-only path for GUI pulls that writes a merge preview artifact when a conservative merge candidate exists.
3. Surface structured conflict class output and preview artifact metadata from `pull_gui_state`.
4. Keep existing conservative automatic merge behavior intact.
5. Update documentation and durable roadmap memory for the new preview contract.

This leaves room for later loops:

- automatic id repair proposal/apply
- broad semantic merge
- dependency-aware defs/layer/text merges
- operation replay and recovery helpers
- Phase 3 vectorization and screenshot-driven diagnostics

## Requirements

- Preserve workspace-authoritative default behavior.
- Preserve explicit opt-in bidirectional GUI sync.
- Preview mode must never replace `current.svg`.
- Preview mode must not mutate snapshots, operation logs, polling state, or GUI state beyond normal read/pull artifacts.
- Automatic merge must remain conservative and reject ambiguous overlap.
- Existing successful `pull_gui_state` behavior must remain backward compatible.
- Conflict reports must use stable, machine-readable classes that can be asserted in tests.
- Merge preview artifacts must be written under the workspace and returned by path metadata.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] `pull_gui_state` supports a preview-only conflict policy that computes a merge candidate artifact without replacing `current.svg`.
- [x] Preview-only mode reports whether the pull is clean, conflict-only, or previewable.
- [x] Preview-only mode returns structured conflict classes for element attribute, text, add/delete, parent/order, and dependency-sensitive changes that the engine detects.
- [x] Preview artifacts are stored outside `current.svg`, under the document workspace, with deterministic metadata.
- [x] Existing merge behavior for non-overlapping same-id changes still works.
- [x] Existing conflict rejection behavior remains intact when preview-only mode is not requested.
- [x] Tests cover deterministic fixture setup for at least:
  - non-overlapping attribute merge preview
  - same attribute conflict
  - text conflict
  - element deleted on one side
  - same-id element added on both sides
  - parent/order/dependency-sensitive conflict when detected
- [x] README or sync documentation describes the preview-only contract.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 loop contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and the remaining Phase 1 follow-ups.

## Technical Approach

- Reuse the existing SVG merge/diff helpers instead of adding a second merge engine.
- Keep preview generation pure where possible: compute candidate SVG from workspace, baseline, and GUI pull contents; write only a review artifact.
- Store preview artifacts in a dedicated workspace-managed directory so future tools can query or compare them.
- Use stable conflict class names rather than free-form messages for testability.
- Keep tool responses compact and artifact-based; do not return raw SVG bodies unless an existing full/debug path already does.

## Decision (ADR-lite)

**Context**: Phase 1 needs stronger conflict handling before agents can rely on bidirectional sync for fine editing. The current conservative merge can reject conflicts, but agents need deterministic reproduction, preview artifacts, and stable conflict classes.

**Decision**: Add preview-only pull semantics and conflict fixture tests as a narrow Phase 1 loop. Preview mode may write review artifacts but must not replace `current.svg`.

**Consequences**: Agents get explainable conflict output and reviewable merge candidates now. Automatic semantic repair, dependency-aware merge, and id repair remain explicit later work.

## Out Of Scope

- Automatic id repair or remapping.
- Automatically applying preview artifacts.
- Broad semantic merge.
- Layer/defs/text/raster editing tools from Phase 2.
- Vectorization, OCR, screenshot diagnostics, or agent planning from Phase 3.
- Arbitrary Inkscape actions or GUI automation.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Likely implementation files:
  - `src/tools/sync.ts`
  - `src/core/svg-merge.ts`
  - `src/core/svg-diff.ts`
  - `src/adapters/workspace.ts`
  - `tests/sync.test.ts`
