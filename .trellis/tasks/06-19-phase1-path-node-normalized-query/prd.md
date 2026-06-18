# Implement Phase 1 Path Node Normalized Query Views

## Goal

Add a read-only normalized path-node query view for `query_path_nodes` so agents can inspect path geometry in absolute coordinates before making precise edits. This is a Phase 1 path editing reliability slice that prepares later path editing, replay, arc support, and document-wide normalized query modes without changing write behavior yet.

## Requirements

- Add `normalize?: "none" | "absolute"` to `query_path_nodes`.
- Default must remain `normalize: "none"` for backward compatibility.
- `normalize: "absolute"` must return absolute coordinate values for supported path commands.
- Supported command boundary remains the existing `M`, `L`, `C`, `Q`, `Z` plus relative variants already handled by the parser.
- The normalized response should preserve the existing segment indexes, commands, available point names, and raw point values.
- The response should expose a clear normalized view without rewriting the SVG or mutating the source path.
- Unsupported commands must keep the existing explicit `INVALID_INPUT` behavior.
- The tool must remain read-only: no snapshots, metadata writes, operation logs, operation-diff artifacts, or Inkscape refresh.
- Active bidirectional current-state read pre-pull behavior must stay unchanged.

## Acceptance Criteria

- [ ] Calling `query_path_nodes` without `normalize` returns the existing response shape.
- [ ] Calling `query_path_nodes({ normalize: "absolute" })` on relative path data returns absolute points for each segment.
- [ ] Absolute output includes endpoints and control points for `M`, `L`, `C`, and `Q`.
- [ ] `Z` remains represented with no editable points while preserving its segment index.
- [ ] Unsupported commands still reject with actionable `INVALID_INPUT` details.
- [ ] Query remains read-only and does not trigger auto-refresh.
- [ ] Tests cover default compatibility, absolute normalization, and read-only behavior.

## Definition of Done

- Unit/tool tests cover normalized path-node query output.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents the new `normalize` option.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract as Phase 1 loop 15.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Reuse the existing path parser and absolute point calculation already exposed through `query_path_nodes` segment summaries. Add a schema field and format the read-only response so callers can explicitly request normalized absolute point data while the default response remains unchanged.

If the current core representation already stores `absolutePoints`, avoid inventing a second geometry engine. If more data is needed, extend the existing path-node module in place with tests.

## Decision (ADR-lite)

Context: Agents need absolute coordinates for precise edits, but changing the default response or adding write semantics now would increase risk.

Decision: Add an explicit `normalize: "absolute"` read-side option to `query_path_nodes` only. Keep the default response compatible and leave `query_document(includePathNodes)` normalization and edit-side normalization for later slices.

Consequences: Agents can plan precise path edits against absolute geometry immediately, while future work can add normalized document-wide path views and edit helpers without breaking this contract.

## Out of Scope

- Changing `edit_path_nodes` behavior.
- Adding arc support.
- Adding path simplification or geometry transforms.
- Changing `query_document(includePathNodes)` response shape.
- Writing normalized path data back to SVG.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Existing files likely involved:
  - `src/core/validation.ts`
  - `src/core/path-data.ts`
  - `src/tools/elements.ts`
  - `tests/path-nodes.test.ts`
  - `README.md`
  - `.trellis/spec/backend/roadmap-memory.md`
- Keep read-only query rules aligned with Phase 1 loop 4 path-node summary behavior.
