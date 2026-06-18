# Implement Phase 1 Path Data Validation Summary

## Goal

Add a bounded read-only `validate_path_data` tool that validates raw SVG path data and returns a compact segment/point summary. This gives agents a cheap way to preflight generated or user-provided `d` strings before calling write tools, while reusing the existing path parser and keeping mutation tools snapshot-first.

## Requirements

- Add a new MCP tool named `validate_path_data`.
- Input accepts one raw path `d` string and optional `requireMoveTo` boolean, defaulting to `true`.
- The tool is read-only and must not require `docId`.
- The tool must not read or write workspace files, create snapshots, append operation logs, update metadata, or refresh Inkscape.
- The tool must return `ok: true`, normalized validation options, command counts, segment count, unsupported command count, available point count, and editable point summary when validation succeeds.
- The tool must use the existing path parser boundary for editable summaries: `M`, `L`, `C`, `Q`, and `Z`, including relative variants.
- Unsupported commands such as `A`, `S`, `T`, `H`, and `V` must be reported as `ok: false` with actionable command details, not silently accepted.
- Malformed path data must return `ok: false` with the existing typed error payload.
- The first slice does not rewrite, normalize, repair, or mutate path data.

## Acceptance Criteria

- [ ] Valid `M/L/C/Q/Z` path data returns segment counts, command counts, and available point summaries.
- [ ] Relative path data is accepted and reported distinctly from absolute commands.
- [ ] `requireMoveTo: false` permits append-fragment style path data such as `L10 10`.
- [ ] Unsupported commands return `ok: false`, code `INVALID_INPUT`, and command detail.
- [ ] Malformed or empty path data returns `ok: false` without throwing from the tool handler.
- [ ] The tool is read-only and has no workspace, history, operation log, or Inkscape side effects.
- [ ] Tests cover schema validation, core summary behavior, MCP registration/handler behavior, and rejection cases.

## Definition of Done

- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents `validate_path_data` as a preflight helper.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract as Phase 1 loop 18.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Add a pure helper in `src/core/path-data.ts` that wraps existing `validatePathData` and `describeEditablePathData`, returning compact command/point counts. Add a Zod schema in `validation.ts`, a tool handler in a small path-oriented tool module or existing elements tool module, and register it in `server.ts`.

The helper should catch `InkMcpError` and format validation failures as structured results so the MCP tool can return a normal `ok: false` payload without using the generic exception wrapper for expected invalid path data.

## Decision (ADR-lite)

Context: Agents need reliable preflight feedback before writing generated path data. Extending write tools with a validation mode would blur read/write contracts and make side-effect expectations harder.

Decision: Add a standalone read-only validation tool that does not take `docId` and does not touch workspace state.

Consequences: This keeps path validation cheap, deterministic, and safe. Future path support such as arcs, absolute normalization, repair suggestions, or lint-style diagnostics can extend this response shape without changing write tool semantics.

## Out of Scope

- Validating a path element inside a workspace document.
- Rewriting relative commands to absolute commands.
- Repairing malformed path data.
- Adding arc or shorthand command editing support.
- Persisting validation reports as artifacts.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 6.
- Builds on roadmap memory Phase 1 loops 15, 16, and 17.
- Existing parser boundary is in `src/core/path-data.ts`.
- Existing path write tools are in `src/core/svg-ops.ts` and `src/tools/elements.ts`.
