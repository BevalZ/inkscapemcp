# Improve MCP Advanced Inkscape Operations

## Goal

Make InkSMCP support more precise vector editing workflows through higher-level path drawing/editing tools and a safe allowlisted bridge to useful Inkscape actions or extension/plugin functionality.

## What I already know

- Current object-level edits preserve SVG and can auto-refresh the Inkscape window.
- Attribute edits use direct active-window attribute sync.
- Structural edits use companion-extension refresh and now have a longer timeout.
- User wants finer operations such as path drawing and using more Inkscape features/plugins through agents.

## Assumptions

- SVG workspace remains source of truth.
- No arbitrary shell/plugin execution should be exposed.
- Advanced operations should be agent-friendly: compact inputs/outputs, stable ids, rollback snapshots.

## Requirements

- Add precise path drawing/editing tools for common manual vector workflows.
- Prioritize path refinement tools before broad plugin/action bridge work.
- Support both raw SVG `d` strings and structured path segment arrays.
- Add compact node-level path edits for moving endpoints/control points and inserting/deleting supported path segments.
- Add compact read-only path node inspection so agents can discover segment indexes before editing.
- Add safe allowlisted access to selected Inkscape actions/plugins where they are deterministic and useful.
- Keep automatic refresh after successful operations.
- Keep workspace confinement, snapshots, and validation.

## Acceptance Criteria

- [x] Agent can create/edit paths without full document replacement.
- [x] Agent can draw a new path from structured commands with a stable id.
- [x] Agent can draw a new path from a raw SVG `d` string with validation.
- [x] Agent can append/replace path data on an existing path with compact output.
- [x] Agent can edit supported path nodes without rewriting the whole document.
- [x] Agent can query editable path segment indexes and raw/absolute points without writing the document.
- [x] Node-level path edits use direct active-window `d` attribute sync after save.
- [x] Agent can perform useful advanced Inkscape operations through an allowlist.
- [x] Unsafe arbitrary action/plugin execution is not possible.
- [x] Typecheck, tests, and build pass.
- [x] README documents new advanced tools and safety boundaries.

## Out of Scope

- Arbitrary plugin/action execution.
- Mouse/keyboard GUI automation.
- Treating Inkscape GUI state as source of truth.
- Broad Inkscape plugin bridge in the first implementation slice.
- Arbitrary node editing for every SVG path command such as arcs and shorthand curves.

## Decision

Prioritize path refinement tools first. The initial slice should make AI path work less verbose and more reliable before expanding into plugin/action integration.

Path input should support both raw SVG `d` strings and structured segment arrays. Raw strings keep compatibility and low token usage; structured arrays support safer fine-grained editing.

The first editing slice includes full path data replacement and segment append. The next refinement adds compact node-level edits for paths made from `M`, `L`, `C`, `Q`, and `Z` commands, plus read-only node inspection through the same supported command set. More complex path commands such as arcs remain editable through full `replace_path_data`.

## Technical Notes

- Relevant files:
  - `src/core/svg-ops.ts`
  - `src/core/validation.ts`
  - `src/tools/elements.ts`
  - `src/tools/geometry.ts`
  - `src/adapters/inkscape-cli.ts`
  - `src/server.ts`
- Existing related tools:
  - `update_element`
  - `apply_svg_operations`
  - `nudge_path_element`
  - `run_action`
  - path boolean tools
