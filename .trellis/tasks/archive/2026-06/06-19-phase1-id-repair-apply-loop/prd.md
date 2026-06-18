# Implement Phase 1 Id Repair Apply Loop

## Goal

Add a guarded `apply_id_repairs` MCP tool that applies explicit, user-confirmed element id repairs after `propose_id_repairs` has identified likely remappings. This closes the Phase 1 id repair loop while preserving the existing safety model: bidirectional pre-pull before current-state writes, snapshot-before-write, conservative validation, reference rewrite, operation diagnostics, operation log entry, and same-window structural refresh.

## Requirements

- Register a new `apply_id_repairs` tool.
- Input must include `docId`, `repairs`, and `confirmApplyRepairs: true`.
- Each repair maps a current element id to the desired repaired id using:
  - `fromElementId`: the id to restore or apply.
  - `toElementId`: the current id to rename.
  - Optional proposal metadata such as `confidence` and `reasons` may be accepted for traceability but must not drive automatic selection.
- Reject before GUI pre-pull or write when confirmation is missing.
- Reject duplicate `fromElementId`, duplicate `toElementId`, self-repairs, unsafe ids, missing current elements, and target id conflicts.
- Pre-pull active bidirectional GUI state before comparing and mutating the current workspace SVG.
- Apply repairs only to the current SVG after validation.
- Rewrite internal references from each `toElementId` to its corresponding `fromElementId`, including `url(#id)`, `href="#id"`, `xlink:href="#id"`, and safe attribute/style string references.
- Snapshot the current SVG before writing the repaired SVG.
- Update metadata, write operation-diff diagnostics, append a compact operation log entry, and trigger structural companion-extension refresh on success.
- Support compact and full response modes using the shared structured diff shape.

## Acceptance Criteria

- [ ] Missing `confirmApplyRepairs: true` rejects with `INVALID_INPUT` and performs no GUI pre-pull or workspace write.
- [ ] Invalid, duplicate, self, missing, and conflicting repairs reject without mutating workspace files.
- [ ] A successful repair renames element ids and rewrites internal references.
- [ ] A successful repair snapshots first, updates `current.svg`, updates metadata, writes operation diagnostics, appends an operation log entry, and attempts structural refresh.
- [ ] Compact mode omits full diff arrays while returning summary counts and changed ids.
- [ ] Full mode includes the shared structured diff details.
- [ ] Active bidirectional GUI state is pre-pulled before validating current ids and applying repairs.
- [ ] Existing id proposal tests remain green.

## Definition of Done

- Tests added or updated for core and tool-level behavior.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents the new tool.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract for the id repair apply loop.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Implement the mutation in the document-tool layer, reusing the existing parse/serialize pipeline and document write helpers rather than adding a parallel persistence path. Keep the first version intentionally conservative: the tool applies only caller-supplied repairs and uses a reject-on-conflict policy. This leaves room for later proposal artifacts, policy variants, and dependency-graph repair without weakening the current safety envelope.

## Decision (ADR-lite)

Context: `propose_id_repairs` is intentionally read-only. A separate write tool is needed so semantic guesses never become silent document mutations.

Decision: Add `apply_id_repairs` as an explicit write tool requiring `confirmApplyRepairs: true`, using caller-provided id mappings only. It rejects ambiguous or conflicting repairs rather than auto-resolving them.

Consequences: The first implementation is safe and predictable, but callers must choose repairs themselves. Future work can add saved proposal artifacts or richer conflict policies while preserving the same snapshot-first apply boundary.

## Out of Scope

- Automatically selecting proposals from `propose_id_repairs` output.
- Persisting id repair proposal artifacts.
- Cross-document id repair.
- Broad dependency graph normalization beyond conservative internal id reference rewrites.
- Rename policies such as keep-existing, rename-newer, or merge duplicates.
- Arbitrary SVG replacement or raw Inkscape action execution.

## Technical Notes

- Relevant docs:
  - `.trellis/spec/backend/roadmap-memory.md`
  - `README.md`
- Likely implementation files:
  - `src/core/validation.ts`
  - `src/tools/document.ts`
  - `src/server.ts`
  - `tests/id-repair.test.ts`
- Existing patterns to reuse:
  - `propose_id_repairs` for the read-only proposal boundary.
  - `apply_operation_preview` for confirmation-first guarded writes.
  - `prePullBeforeCurrentStateWrite` for bidirectional GUI current-state writes.
  - `ctx.workspace.writeSvgWithSnapshot`, operation diagnostics, operation logs, and structural refresh for successful document replacement.
