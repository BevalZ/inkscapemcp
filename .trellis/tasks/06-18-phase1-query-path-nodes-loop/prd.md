# Implement Phase 1 Query Path Nodes Loop

## Goal

Implement the next verifiable Phase 1 query-reliability slice from `docs/roadmap/phase-1-stabilize-foundations.md` and `docs/roadmap/debug-hardening-phase-1.md`: expose path-node summaries through `query_document` without mutating SVG state.

The outcome should let agents inspect path geometry across an element tree in one compact document query, while preserving the existing dedicated `query_path_nodes` tool for deep per-path inspection.

## Boundary Decision

Recommended boundary for this loop:

1. Add `includePathNodes?: boolean` to `query_document`.
2. Reuse the existing path parser used by `query_path_nodes`; do not add a second path parser.
3. In compact mode, return counts and a small summary for path nodes without returning full segment arrays.
4. In standard/full mode, return per-path summaries and supported segment details.
5. Preserve read-only behavior: no snapshots, operation logs, metadata writes, or GUI refresh.

This leaves room for later Phase 1 loops:

- normalized absolute/relative path views
- arc and shorthand command round-trip support
- resolved style summaries
- reverse dependency summaries and severity
- path transform helpers and dry-run/replay tools

## Requirements

- Preserve workspace-authoritative default behavior.
- `query_document` with `includePathNodes` must be read-only.
- Unsupported path data must be reported as structured per-path warnings, not fail the entire document query.
- Compact mode must stay token-efficient and avoid full path segment arrays.
- Standard/full mode must include useful per-path segment details for supported commands.
- Existing `query_document` behavior must remain backward compatible when `includePathNodes` is omitted.
- Existing `query_path_nodes` behavior must remain unchanged.
- All new inputs must use typed Zod schemas.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] `query_document` accepts `includePathNodes?: boolean`.
- [x] Compact mode with `includePathNodes: true` returns path counts and compact path summaries, not full segment arrays.
- [x] Standard/full mode with `includePathNodes: true` returns per-path segment summaries for supported `M/L/C/Q/Z` paths.
- [x] Unsupported path data is represented in path-node warnings with element id and error details.
- [x] Query remains read-only: no new snapshots, operation logs, metadata writes, or automatic refresh.
- [x] Existing `query_path_nodes` tests continue to pass unchanged.
- [x] Tests cover compact and standard/full query path-node output.
- [x] Tests cover unsupported path data warning behavior.
- [x] README documents the option and compact/full behavior.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 loop contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Extract shared read-only path node summarization from the existing `queryPathNodes` implementation if needed.
- Keep tool registration thin in `src/server.ts`; the behavior belongs in `src/tools/document.ts` and existing path helpers.
- Return compact query path data as counts plus per-path high-level summaries.
- Return standard/full query path data as a separate `pathNodes` payload, not by modifying the existing element tree shape.

## Decision (ADR-lite)

**Context**: Fine editing and later vectorization need reliable document-wide path inspection, but current `query_path_nodes` only inspects one path at a time.

**Decision**: Add a read-only `includePathNodes` option to `query_document`, reusing the existing path parser and exposing compact/full response modes.

**Consequences**: Agents can scan path geometry more cheaply before choosing precise path edits. Broader path command support and normalized views remain separate later work.

## Out Of Scope

- Editing path nodes.
- Adding arc/shorthand path command support.
- Resolved CSS/style computation.
- Dependency reverse-reference severity.
- Operation replay, dry-run, or recovery helpers.
- Phase 2 layers/defs/text/raster workflows.
- Phase 3 vectorization, OCR, screenshot diagnostics, or agent planning.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Likely implementation files:
  - `src/core/path-data.ts`
  - `src/core/validation.ts`
  - `src/tools/document.ts`
  - `tests/query-document.test.ts`
