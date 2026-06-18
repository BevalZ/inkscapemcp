# Implement Phase 1 Apply Operation Preview Loop

## Goal

Implement the next Phase 1 recovery/replay foundation slice: add an explicit `apply_operation_preview` tool that applies a previously saved operation preview artifact to `current.svg` after validating the artifact identity and baseline.

The outcome should complete the safe preview-review-apply loop for controlled SVG operation batches without introducing broader operation groups yet.

## Boundary Decision

Recommended boundary for this loop:

1. Add `apply_operation_preview({ docId, previewId, baseline?, confirmApplyPreview, responseMode? })`.
2. Only apply artifacts saved by `preview_svg_operations` or dry-run `replay_operations`.
3. Require `confirmApplyPreview: true`.
4. Verify the preview artifact belongs to the requested `docId`.
5. Verify current workspace metadata against either:
   - explicit `baseline`, when supplied, or
   - the artifact baseline, when present.
6. Snapshot before replacing `current.svg` with the candidate SVG.
7. Update metadata, write operation-diff diagnostics, append a compact operation log entry, and refresh Inkscape structurally.
8. Return compact/full diff output for the actual current-to-candidate application.

This loop intentionally does not add operation groups, apply-all, interactive approval UIs, preview deletion, preview retention, or cross-document preview application.

## Requirements

- Preserve workspace-authoritative default behavior.
- `apply_operation_preview` must reject without `confirmApplyPreview: true`.
- The tool must reject missing, unsafe, or mismatched preview ids.
- The tool must reject preview artifacts whose metadata `docId` does not match the requested `docId`.
- If the artifact contains a baseline, current metadata must match it unless an explicit matching baseline is supplied.
- If an explicit baseline is supplied, it must match both current metadata and the artifact baseline when the artifact has one.
- If neither explicit nor artifact baseline is available, reject rather than applying an unguarded preview.
- The tool must pre-pull active bidirectional GUI state before baseline comparison.
- Stale baseline rejection must happen before snapshot/write.
- Successful application must snapshot first, replace `current.svg` with the saved candidate SVG, update metadata, create operation-diff diagnostics, append operation log, and trigger structural companion refresh.
- Compact response must return summary counts and changed ids without full change arrays.
- Full response must include the structured diff from current SVG to candidate SVG.
- The tool must not use active-window attribute sync because applying an artifact is a candidate document replacement.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `apply_operation_preview`.
- [x] `apply_operation_preview` accepts `docId`, `previewId`, `baseline`, `confirmApplyPreview`, and `responseMode`.
- [x] Missing confirmation rejects without changing workspace state.
- [x] Missing/unsafe preview ids reject without changing workspace state.
- [x] Missing baseline protection rejects unguarded preview artifacts.
- [x] Stale current metadata rejects before snapshot/write.
- [x] Explicit baseline must match artifact baseline when both are present.
- [x] Successful apply snapshots, updates `current.svg`, updates metadata, writes operation diff diagnostics, appends an operation log, and triggers structural refresh.
- [x] Compact mode returns summary counts and changed ids without full diff arrays.
- [x] Full mode returns the structured diff from the shared diff engine.
- [x] README documents the apply-preview contract and guardrails.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 apply-preview contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add `applyOperationPreviewSchema` near operation preview schemas.
- Add a workspace method that atomically applies a saved operation preview artifact with snapshot-first semantics and a pre-snapshot guard.
- Implement `applyOperationPreview` in `src/tools/document.ts`.
- Reuse `readOperationPreview`, `diffSvgDocuments`, `withWriteDiagnostics`, and `tryAutoRefreshInInkscape`.
- Register the tool in `src/server.ts`.
- Add tests for confirmation, baseline mismatch, successful apply, compact/full response shape, and no attribute-sync path.

## Decision (ADR-lite)

**Context**: Phase 1 now supports dry-run operation previews, saved artifacts, deterministic replay, checkpoints, and recovery. Agents need a guarded way to turn a reviewed preview artifact into the current document.

**Decision**: Add a single explicit apply tool for saved operation preview artifacts, guarded by confirmation and metadata baseline checks.

**Consequences**: Agents can perform review-before-apply workflows. Future operation groups can build on preview artifact identity instead of applying ad hoc candidate SVGs.

## Out Of Scope

- Operation groups.
- Applying multiple previews.
- Preview deletion or retention policies.
- Apply from unsaved preview response payloads.
- Cross-document preview application.
- Visual diff scoring.
- Phase 2 geometry/action preview application.
- Phase 3 vectorization candidate application.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Prior loop foundations: `preview_svg_operations`, `replay_operations`, `list_operation_previews`, and `read_operation_preview`.
- Likely implementation files:
  - `src/adapters/workspace.ts`
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/apply-operation-preview.test.ts`
