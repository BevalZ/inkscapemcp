# Implement Phase 1 Saved Operation Preview Artifact Loop

## Goal

Implement the next Phase 1 replay/recovery foundation slice: allow agents to optionally persist reviewable dry-run artifacts for controlled SVG operation previews.

The outcome should let an agent preview a complex operation batch, save the candidate SVG and metadata under the document workspace, and reference that artifact in later decisions without mutating `current.svg`.

## Boundary Decision

Recommended boundary for this loop:

1. Extend dry-run preview surfaces with optional artifact persistence:
   - `preview_svg_operations({ savePreview?: boolean, previewLabel? })`
   - `replay_operations({ dryRun: true, savePreview?: boolean, previewLabel? })`
2. Store artifacts under `workspace/drawings/{docId}/operation-previews/`.
3. Save both candidate SVG and JSON metadata/diff when requested.
4. Add `list_operation_previews({ docId })` and `read_operation_preview({ docId, previewId, includeSvg? })`.
5. Keep artifact tools read-only except for explicit preview artifact creation.
6. Do not add apply-from-preview, operation groups, saved replay plans, checkpoint association, or artifact garbage collection in this loop.

This leaves room for later Phase 1 work:

- apply/confirm preview artifact
- operation groups and checkpoint association
- preview cleanup/retention
- resource exposure for preview artifacts
- replay from saved plans

## Requirements

- Preserve workspace-authoritative default behavior.
- Saving a preview artifact must not write `current.svg`, update document metadata, create history snapshots, append operation logs, create operation-diff artifacts, or refresh Inkscape.
- Preview artifacts must be workspace-confined and use safe ids.
- Preview metadata must include `previewId`, `docId`, `toolName`, `generatedAt`, optional label, operation count, baseline when provided, response mode, diff summary, changed ids, SVG path, and metadata path.
- `list_operation_previews` must return compact metadata without SVG content or full diff arrays.
- `read_operation_preview` must return metadata and full diff; it should include SVG content only when `includeSvg: true`.
- `previewLabel` is optional and should be sanitized for filenames without becoming identity.
- Current-state dry-run tools should retain existing pre-pull/stale-read behavior.
- Invalid operation batches should not create preview artifacts.
- Stale baseline dry-run replay should not create preview artifacts.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] `preview_svg_operations` accepts `savePreview` and `previewLabel`.
- [x] `replay_operations` dry-run accepts `savePreview` and `previewLabel`.
- [x] Saved preview artifacts are written under `operation-previews/`.
- [x] Saving a preview artifact leaves `current.svg`, document metadata, history, operation logs, and operation-diff artifacts unchanged.
- [x] Invalid preview operations do not create artifacts.
- [x] Stale baseline replay dry-run does not create artifacts.
- [x] `list_operation_previews` is registered and returns compact preview metadata.
- [x] `read_operation_preview` is registered and returns metadata/full diff, with SVG included only when requested.
- [x] README documents saved operation preview artifacts and read-only boundaries.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 saved preview contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add workspace helper methods for preview artifact paths, writing, listing, and reading.
- Add schemas:
  - preview/replay dry-run save fields
  - `listOperationPreviewsSchema`
  - `readOperationPreviewSchema`
- Reuse the existing in-memory operation/diff flow and only persist artifacts after successful preview generation.
- Register `list_operation_previews` and `read_operation_preview` in `src/server.ts`.
- Add focused tests for saved artifact creation, no mutation, list/read behavior, and failure no-artifact behavior.

## Decision (ADR-lite)

**Context**: Phase 1 has operation dry-run and deterministic replay. Agents still need a durable way to inspect and refer to preview candidates across turns without making the preview destructive.

**Decision**: Add explicit saved preview artifacts for dry-run operation candidates, stored separately from history snapshots and operation-diff artifacts.

**Consequences**: Complex edits can be reviewed and referenced before mutation. Later apply-from-preview and operation-group workflows can build on the artifact identity.

## Out Of Scope

- Applying a preview artifact.
- Saved replay plans.
- Operation groups.
- Checkpoint association.
- Artifact cleanup/retention.
- MCP resources for previews.
- Cross-document previews.
- Phase 2 geometry/action previews.
- Phase 3 vectorization review artifacts.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Prior loop foundations: `preview_svg_operations` and `replay_operations`.
- Likely implementation files:
  - `src/adapters/workspace.ts`
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/operation-previews.test.ts`
