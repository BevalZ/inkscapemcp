# Implement Phase 1 Merge Preview Artifact Inspection

## Goal

Add read-only MCP tools for inspecting GUI merge preview artifacts created by `pull_gui_state({ conflictPolicy: "preview_only" })`. This makes preview artifacts durable and discoverable after the original pull response is gone, while preserving the existing non-mutating merge-preview boundary.

## Requirements

- Register `list_merge_previews` and `read_merge_preview`.
- `list_merge_previews({ docId })` returns compact metadata for saved artifacts under `workspace/drawings/{docId}/merge-previews/`.
- `read_merge_preview({ docId, previewId, includeSvg? })` returns artifact metadata and includes SVG content only when requested.
- Both tools must be read-only: no snapshots, metadata updates, operation logs, operation diffs, GUI pre-pull, or Inkscape refresh.
- Validate `previewId` as a safe artifact id confined to the requested document.
- Reject missing or mismatched artifacts with explicit errors.
- Keep the artifact model compatible with existing `writeGuiMergePreviewArtifact` outputs and leave room for later apply-from-merge-preview tools.

## Acceptance Criteria

- [ ] `list_merge_previews` lists compact summaries without SVG payloads.
- [ ] `read_merge_preview` returns metadata without SVG by default.
- [ ] `read_merge_preview({ includeSvg: true })` includes validated SVG content.
- [ ] Unsafe, missing, or mismatched preview ids reject without mutating workspace state.
- [ ] Existing `preview_only` pull tests continue to pass.
- [ ] Docs and roadmap memory describe the read-only artifact-inspection contract.

## Definition of Done

- Tests added for list/read behavior and no-write guarantees.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents the new tools.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Reuse the existing `merge-previews/` directory and artifact metadata written by `Workspace.writeGuiMergePreviewArtifact`. Add workspace read/list helpers that validate artifact ids and document ownership, then expose thin document or sync tools through Zod schemas and MCP registration. Do not introduce a new artifact store or change `pull_gui_state` preview generation.

## Decision (ADR-lite)

Context: `pull_gui_state` preview artifacts are useful beyond the original response, but there is no tool to rediscover or inspect them.

Decision: Add read-only list/read tools for merge preview artifacts. Keep apply behavior out of scope so artifact inspection is safe and independently verifiable.

Consequences: Agents can review stored merge candidates without re-running GUI pull. A later apply tool can build on the same artifact identity and validation path.

## Out of Scope

- Applying merge preview artifacts.
- Deleting or pruning merge preview artifacts.
- Saving new merge previews outside `pull_gui_state`.
- Cross-document preview access.
- Changing merge conflict classes or conservative merge behavior.

## Technical Notes

- Relevant docs:
  - `docs/roadmap/phase-1-stabilize-foundations.md`
  - `.trellis/spec/backend/roadmap-memory.md`
  - `README.md`
- Likely implementation files:
  - `src/adapters/workspace.ts`
  - `src/core/validation.ts`
  - `src/tools/sync.ts` or `src/tools/document.ts`
  - `src/server.ts`
  - `tests/sync.test.ts`
- Existing patterns to reuse:
  - `list_operation_previews` / `read_operation_preview` for artifact listing and optional SVG payloads.
  - `Workspace.writeGuiMergePreviewArtifact` for metadata shape and paths.
