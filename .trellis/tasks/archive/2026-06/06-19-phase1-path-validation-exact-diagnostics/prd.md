# Phase 1 Path Validation Exact Diagnostics

## Goal

Improve the read-only `validate_path_data` preflight tool so agents can locate malformed or unsupported raw SVG path data without manually counting tokens. This is a bounded Phase 1 path editing reliability slice that strengthens diagnostics while preserving the current supported command boundary.

## Requirements

- Add structured diagnostic details to `validate_path_data` failures where the parser can determine them.
- Include command and segment context for parameter-shape failures:
  - `command`
  - `commandIndex`
  - `segmentIndex`
  - `expectedParamCount`
  - `actualParamCount`
  - `missingParamCount`
  - `tokenIndex`
  - `offset`
- Include token location details for invalid characters, invalid trailing characters, unsupported commands, empty/no-command input, no-parameter commands, and number-before-command cases where practical.
- Preserve the current supported editable raw command set: `M/m`, `L/l`, `H/h`, `V/v`, `C/c`, `Q/q`, `Z/z`.
- Keep `validate_path_data` read-only: no `docId`, no workspace reads/writes, no history snapshots, no operation logs, no metadata updates, no GUI sync, and no Inkscape calls.
- Keep existing success response shape backward compatible while allowing extra diagnostic fields on failure.
- Update README and durable roadmap memory to document the new diagnostic contract.

## Acceptance Criteria

- [x] `validate_path_data({ d: "M10 10 C20 20 30" })` returns `ok: false` with segment/command/token diagnostics showing the incomplete `C` parameter set.
- [x] Unsupported command failures such as `A` include command index, token index, and offset details.
- [x] Invalid character or trailing garbage failures include an offset and invalid text fragment.
- [x] `requireMoveTo: false` append-style validation still works and uses correct segment indexes.
- [x] Existing path validation, path edit, query, and tool tests pass.
- [x] `npm run typecheck`, `npm test`, `npm run build`, extension self-test, and `git diff --check` pass.

## Technical Approach

Extend the existing `src/core/path-data.ts` tokenizer and validation pass instead of adding a second parser. Token records will carry source offsets and validation will throw `InkMcpError` with richer details. The public failure payload will continue to be created through `toErrorPayload`, so MCP response shape remains consistent.

## Decision (ADR-lite)

Context: Phase 1 needs actionable path preflight diagnostics before broader path editing and future arc support.

Decision: Add exact diagnostics to the existing read-only path validation pipeline, with no new write behavior and no expansion of supported commands.

Consequences: Agents get better localization for malformed path data now. Full SVG path grammar support, arc editing, shorthand curve editing, and repair suggestions remain future work.

## Out of Scope

- Adding support for `A/a`, `S/s`, or `T/t` editing.
- Rewriting valid path data.
- Returning repair suggestions.
- Persisting validation reports.
- Reading existing workspace path elements.
- Changing `edit_path_nodes`, `transform_path_points`, or path geometry behavior beyond any shared parser diagnostics that naturally improve thrown errors.

## Technical Notes

- Roadmap source: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 6.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`, Phase 1 loop 18.
- Relevant code:
  - `src/core/path-data.ts`
  - `src/tools/elements.ts`
  - `src/server.ts`
  - `tests/svg-ops.test.ts`
  - `tests/elements.test.ts`
  - `tests/path-validation.test.ts`
