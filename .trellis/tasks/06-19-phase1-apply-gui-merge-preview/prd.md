# Phase 1 Apply GUI Merge Preview

## Goal

Add an explicit, confirmed apply path for saved GUI merge preview artifacts produced by `pull_gui_state({ conflictPolicy: "preview_only" })`.

This completes the current review loop for GUI merge previews: agents can already create, list, and read preview artifacts, but applying a reviewed candidate still requires unsafe ad hoc full-document replacement. The new path must reuse the existing sync, baseline, snapshot, operation-diff, log, and refresh contracts so future merge work can build on one guarded artifact identity.

## Requirements

* Add a new MCP tool `apply_merge_preview`.
* The tool must apply only an existing artifact under `workspace/drawings/{docId}/merge-previews/`.
* Require `confirmApplyPreview: true` before any GUI pre-pull or write work begins.
* Validate artifact identity: requested `docId`, `previewId`, metadata paths, and SVG artifact must all match the artifact reader contract.
* Accept an optional explicit baseline `{ revision, contentHash }`.
* Prefer explicit baseline when supplied; otherwise use artifact metadata baseline when available.
* Reject if no baseline is available.
* Pre-pull active bidirectional GUI state before comparing the selected baseline to current metadata.
* Reject stale baselines before snapshot/write, including inside the document write lock.
* Snapshot current SVG before replacing it with the preview candidate SVG.
* Update document metadata, write operation-diff diagnostics, append a compact operation log, and trigger structural companion-extension refresh after successful apply.
* Return compact/full response modes using the existing SVG diff shape.
* Do not mutate or delete the preview artifact.

## Acceptance Criteria

* [ ] Missing `confirmApplyPreview: true` rejects before GUI pre-pull and leaves workspace state unchanged.
* [ ] Unsafe or missing preview ids reject without workspace mutation.
* [ ] Artifact identity mismatches reject without workspace mutation.
* [ ] Missing baseline rejects without workspace mutation.
* [ ] Explicit baseline and artifact baseline mismatch rejects without workspace mutation.
* [ ] Stale current metadata rejects after pre-pull but before snapshot/write.
* [ ] Successful compact apply snapshots, writes `current.svg`, updates metadata, writes operation-diff diagnostics, logs `apply_merge_preview`, triggers structural companion refresh, and omits full diff arrays.
* [ ] Full mode includes the structured diff.
* [ ] Active bidirectional GUI state is pre-pulled before baseline comparison.
* [ ] Existing merge preview read/list behavior remains read-only.
* [ ] Focused tests, typecheck, full tests, build, extension Python self-test, and `git diff --check` pass.

## Definition of Done

* The new tool is registered in the MCP server with a Zod schema.
* Tests cover guard rails, successful apply, response modes, and bidirectional pre-pull.
* README and roadmap memory document the apply boundary.
* No automatic merge expansion, artifact deletion, artifact pruning, cross-document apply, or unguarded full replacement is introduced.
* Trellis task is archived, session journal is recorded, and commits are pushed.

## Technical Approach

Follow the existing `apply_operation_preview` pattern where possible, but use the GUI merge preview artifact reader and metadata. The preview SVG is a candidate document state produced by a validated GUI pull preview, so successful apply should use structural companion-extension refresh rather than active-window attribute sync.

Add a schema:

```typescript
apply_merge_preview({
  docId,
  previewId,
  baseline?: { revision: number, contentHash: string },
  confirmApplyPreview: true,
  responseMode?: "compact" | "full"
})
```

Add a workspace helper only if needed to expose a typed artifact baseline from existing metadata. Do not persist new artifact files or alter `merge-previews/` layout in this slice.

## Decision (ADR-lite)

**Context**: `preview_only` GUI pulls intentionally avoid mutating `current.svg`, but a reviewed preview candidate still needs a safe application path. Calling `replace_document_svg` would bypass artifact identity, stale baseline rejection, bidirectional pre-pull, and merge-preview-specific diagnostics.

**Decision**: Add a dedicated confirmed `apply_merge_preview` tool that applies saved preview artifacts through the normal snapshot-first write path and existing baseline guard.

**Consequences**: This keeps review and apply separate. It does not expand automatic merge coverage, but it gives later merge and conflict-resolution work a stable apply boundary.

## Out of Scope

* Creating merge preview artifacts.
* Changing merge algorithms or conflict classes.
* Applying `conflict_only` artifacts without a candidate SVG.
* Deleting, pruning, or marking preview artifacts as consumed.
* Cross-document apply.
* Applying unsaved SVG payloads.
* Active-window attribute sync for merge preview apply.

## Technical Notes

* Relevant roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 4 and Workstream 7.
* Persistent contracts: `.trellis/spec/backend/roadmap-memory.md`.
* Likely implementation: `src/tools/sync.ts`, `src/core/validation.ts`, `src/server.ts`, `src/adapters/workspace.ts`.
* Existing related tests: `tests/sync.test.ts`, `tests/apply-operation-preview.test.ts`.
