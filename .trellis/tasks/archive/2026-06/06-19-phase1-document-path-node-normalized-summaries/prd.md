# Implement Phase 1 Document Path-Node Normalized Summaries

## Goal

Extend `query_document({ includePathNodes: true })` with an explicit document-wide absolute path-node summary option. This builds on the single-path `query_path_nodes({ normalize: "absolute" })` contract so agents can inspect all editable paths in one read-only query before planning precise edits.

## Requirements

- Add `pathNodeNormalize?: "none" | "absolute"` to `query_document`.
- Default must remain `pathNodeNormalize: "none"` for backward compatibility.
- The option is meaningful only when `includePathNodes: true`.
- `pathNodeNormalize: "absolute"` must add absolute normalized segment summaries to document-wide path-node output.
- Existing compact mode must remain compact: include counts and per-path command/point summaries without full segment arrays.
- Standard/full modes should include normalized absolute segment details beside existing raw segment details.
- Unsupported path data must remain a structured per-path warning, not a whole-query failure.
- The tool must remain read-only: no snapshots, metadata writes, operation logs, operation-diff artifacts, preview artifacts, or Inkscape refresh.
- Active bidirectional current-state read pre-pull behavior must stay unchanged.

## Acceptance Criteria

- [ ] Calling `query_document({ includePathNodes: true })` without `pathNodeNormalize` preserves current output.
- [ ] Compact `pathNodeNormalize: "absolute"` returns normalized summary counts/details for described paths while omitting full `segments`.
- [ ] Standard/full `pathNodeNormalize: "absolute"` returns normalized segment point details for supported paths.
- [ ] Relative `M/L/C/Q` path data is represented with absolute normalized points.
- [ ] `Z`/`z` remains represented with no editable points.
- [ ] Unsupported commands remain per-path warnings.
- [ ] Read-only behavior is covered by tests: no auto-refresh and no history snapshots.

## Definition of Done

- Tests cover compact and full/standard normalized document path summaries.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents the new `pathNodeNormalize` option.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract as Phase 1 loop 16.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Extend the existing `src/core/path-node-summary.ts` summarizer to accept a normalization option. Reuse existing path parser output and `absolutePoints`; do not introduce a second geometry engine. Keep compact output token-conscious by adding normalized command/point summaries rather than full raw segments.

## Decision (ADR-lite)

Context: Agents often need to inspect all paths before selecting one to edit. Single-path normalized query is useful, but document-wide path inspection still requires multiple tool calls or parsing full segment payloads.

Decision: Add `pathNodeNormalize` to `query_document`, scoped to `includePathNodes`, with default compatibility and explicit absolute-mode output.

Consequences: Agents can plan precise multi-path edits with fewer tool calls and less token usage. Future edit-side normalization and broader command support can reuse the same normalized summary contract.

## Out of Scope

- Changing `query_path_nodes`.
- Changing `edit_path_nodes` behavior.
- Adding arc support.
- Writing normalized path data back to SVG.
- Adding relative normalized output in this slice.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 5 and Workstream 6.
- Builds on roadmap memory Phase 1 loop 4 and loop 15.
- Existing files likely involved:
  - `src/core/path-node-summary.ts`
  - `src/core/validation.ts`
  - `src/tools/document.ts`
  - `tests/query-document.test.ts`
  - `README.md`
  - `.trellis/spec/backend/roadmap-memory.md`
