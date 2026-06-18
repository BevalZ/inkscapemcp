# Implement Phase 1 Operation Diff Loop

## Goal

Implement the next verifiable Phase 1 slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: make snapshot-to-snapshot SVG diffs directly inspectable through a compact, artifact-friendly tool.

The outcome should let agents explain what changed between history snapshots without reading full SVG files or mutating the current document.

## Boundary Decision

Recommended boundary for this loop:

1. Add a read-only `diff_document_snapshots` tool.
2. Reuse the existing `diffSvgDocuments` core helper so diff semantics match operation-diff artifacts.
3. Support `responseMode: "compact" | "full"` to control token use.
4. Add deterministic tests for attribute, text, structure, add/remove, and id-change diffs.
5. Update README and durable roadmap memory for the new inspection contract.

This leaves room for later Phase 1 loops:

- dry-run mode for complex write tools
- deterministic operation replay with stale-baseline rejection
- recovery helpers for failed refresh/write windows
- operation-diff resource listing/reading
- broader semantic diffing and id repair proposal/apply

## Requirements

- Preserve workspace-authoritative default behavior.
- `diff_document_snapshots` must be read-only: no snapshots, operation logs, metadata writes, connection updates, or Inkscape refresh.
- The tool must resolve snapshot ids inside the document history directory only.
- Invalid snapshot ids or missing snapshots must return explicit errors.
- Compact mode must avoid returning full change arrays while still reporting useful counts and changed ids.
- Full mode must return the existing structured diff shape.
- Existing write-path operation-diff artifacts must continue to be generated as before.
- All new inputs must use typed Zod schemas.
- Do not introduce a database or new persistence system.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] `diff_document_snapshots` is registered as an MCP tool.
- [x] The tool accepts `{ docId, fromSnapshotId, toSnapshotId, responseMode?: "compact" | "full" }`.
- [x] The tool reads only history snapshots and does not mutate `current.svg`, metadata, operations log, or history.
- [x] Compact mode returns summary counts, changed element ids, added ids, and removed ids without full change arrays.
- [x] Full mode returns attribute, text, and structure change arrays.
- [x] Tests cover deterministic snapshot diffs for:
  - attribute changes
  - text changes
  - structure/reparent/order changes
  - added and removed elements
  - id-change behavior as remove plus add
- [x] Missing or unsafe snapshot ids reject with explicit errors.
- [x] README documents the tool and response modes.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 loop contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and the remaining Phase 1 follow-ups.

## Technical Approach

- Add a workspace adapter method that reads a history snapshot by id using the same path confinement rules as rollback.
- Keep diff computation in `src/core/svg-diff.ts`; do not duplicate XML diff logic in the tool layer.
- Add `diffDocumentSnapshots` under `src/tools/document.ts` so document/history read tools stay together.
- Register the tool in `src/server.ts`.
- Keep response shaping small and explicit:
  - compact: metadata + summary + changed ids
  - full: compact fields + full structured diff

## Decision (ADR-lite)

**Context**: Phase 1 already writes operation-diff artifacts after successful writes, but agents do not yet have a direct tool to compare arbitrary history snapshots. Fine editing needs this inspection surface before replay/recovery work.

**Decision**: Add a read-only snapshot diff tool that reuses the existing diff engine and returns compact output by default.

**Consequences**: Agents can diagnose changes and validate recovery candidates without mutating state. Replay, dry-run, and recovery remain separate later work.

## Out Of Scope

- Operation replay.
- Recovery/restore helpers beyond existing rollback.
- Dry-run support for write tools.
- Semantic id repair or remapping.
- New MCP resources for diff artifacts.
- Phase 2 layers/defs/text/raster workflows.
- Phase 3 vectorization, OCR, screenshot diagnostics, or agent planning.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Likely implementation files:
  - `src/core/svg-diff.ts`
  - `src/core/validation.ts`
  - `src/adapters/workspace.ts`
  - `src/tools/document.ts`
  - `src/server.ts`
  - `tests/*`
