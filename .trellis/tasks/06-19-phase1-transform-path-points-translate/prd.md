# Implement Phase 1 Transform Path Points Translate

## Goal

Add a bounded `transform_path_points` tool that translates selected points on an existing path. This is the first safe slice of Phase 1 path editing reliability: it gives agents a concise way to move multiple path nodes/control handles after inspecting them with `query_path_nodes` or `query_document(includePathNodes)`, while reusing the existing path parser, snapshot, operation-diff, and active-window `d` attribute sync contracts.

## Requirements

- Add a new MCP tool named `transform_path_points`.
- The first version supports only translation by `dx` and/or `dy`.
- Input must target one existing path element by `docId` and `elementId`.
- Input must select one or more explicit path points by segment index and point name.
- Supported point names are the existing editable points: `end`, `c1`, and `c2`.
- The tool must reject empty point selections.
- The tool must reject non-finite or all-zero transforms.
- The tool must reject unsupported path commands through the existing path parser.
- The tool must preserve the existing path element id and object tree.
- The tool must snapshot before writing, update metadata, write operation diagnostics, append a compact operation log, and use direct active-window `d` attribute sync after a successful write.
- The tool must pre-pull active bidirectional GUI state before writing.

## Acceptance Criteria

- [ ] Translating multiple explicit path points changes only the target path's `d` attribute.
- [ ] Endpoints and control points can be translated in one tool call.
- [ ] Invalid segment indexes and unsupported points return `INVALID_INPUT` and leave `current.svg` unchanged.
- [ ] Unsupported path commands keep the existing actionable parser error.
- [ ] Successful calls snapshot before write and return previous/next `d`.
- [ ] Successful calls use direct active-window attribute sync for `d`, not structural refresh.
- [ ] Tests cover schema validation, core transform behavior, tool-level diagnostics/refresh, and rejection cases.

## Definition of Done

- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents `transform_path_points`.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract as Phase 1 loop 17.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Reuse `applyPathNodeEdits` by converting selected points into `move_point` edits with the requested `dx` and `dy`. Add a small core wrapper under `svg-ops.ts`, a Zod schema under `validation.ts`, a tool handler under `tools/elements.ts`, and MCP registration under `server.ts`.

This avoids a second path mutation engine and keeps the operation aligned with the existing `edit_path_nodes` write behavior and active-window direct sync path.

## Decision (ADR-lite)

Context: The roadmap mentions `transform_path_points`, but a broad selector/transform system would be too much for one safe Phase 1 slice.

Decision: Implement only explicit point selections and translate transforms now. Leave selectors by command, bbox, all points, rotation, scaling, and matrix transforms for later PRDs.

Consequences: Agents gain a useful higher-level path edit primitive without expanding the parser or introducing ambiguous selection behavior. The API leaves room for future selector/transform variants by grouping inputs under `pointSelector` and `transform`.

## Out of Scope

- Rotations, scaling, matrices, or arbitrary transforms.
- Selecting all points, command ranges, or geometric regions.
- Editing multiple path elements in one call.
- Supporting arcs, smooth curves, horizontal/vertical commands, or shorthand curves.
- Creating or deleting path segments.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15 and 16.
- Existing files likely involved:
  - `src/core/path-data.ts`
  - `src/core/svg-ops.ts`
  - `src/core/validation.ts`
  - `src/tools/elements.ts`
  - `src/server.ts`
  - `tests/path-validation.test.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `README.md`
  - `.trellis/spec/backend/roadmap-memory.md`
