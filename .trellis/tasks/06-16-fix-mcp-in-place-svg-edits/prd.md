# Fix MCP In-Place SVG Edits For Open Inkscape Workflow

## Goal

Make MCP-driven edits preserve the existing SVG object tree by default instead of replacing the whole document, and make the Inkscape-facing workflow explicit about whether it refreshed an existing view or only opened the file again.

## Requirements

* Treat full-document replacement as an explicit destructive/full-redraw path, not the normal edit path.
* Strengthen tool names/descriptions/responses so callers prefer object-level edits for normal modifications.
* Add a tool for in-place color replacement on the current SVG document as the first high-level transform.
* Preserve existing geometry, ids, document dimensions, metadata, object ordering, and object tree for in-place transforms.
* Support common SVG color locations: `fill`, `stroke`, gradient stop `stop-color`, and color values inside `style`.
* Return changed element ids/counts so callers can verify that a command modified existing objects.
* Keep normal snapshot/history behavior for rollback.
* Use the new tool to convert the current pig from pink to yellow without rebuilding the SVG.
* Do not claim that `open_in_inkscape` controls an already-open GUI window unless that is actually implemented.
* Do not run Inkscape active-window `file-rebase` by default because it can crash Inkscape 1.4.x on Windows.
* Provide a lightweight Inkscape companion extension that pulls `workspace/drawings/<docId>/current.svg` into the current Inkscape window.
* MCP write tools should automatically trigger that companion extension after successful saves when auto-refresh is enabled, so the user does not need to fill extension fields or click the menu.
* Keep the companion extension file-based; do not introduce a background service, network listener, or direct write-back into the MCP workspace.

## Acceptance Criteria

* [x] A focused test proves color replacement updates existing SVG attributes/style while preserving unrelated content.
* [x] Full-document replacement returns a warning that it replaces the whole object tree and should not be used for normal edits.
* [x] The MCP server exposes the new tool.
* [x] Typecheck and test suite pass.
* [x] The current pig document is updated through in-place color replacement, not full document replacement.
* [x] Preview rendering confirms the yellow pig still appears.
* [x] Default refresh behavior avoids the unstable Inkscape `file-rebase` crash path.
* [x] A companion Inkscape extension can be installed from this repository and refreshes the current Inkscape window by pulling the workspace SVG.
* [x] Tests cover companion extension packaging, safe path resolution, and installer output.
* [x] Successful MCP writes automatically attempt same-window refresh through the companion extension without using `file-rebase`.
* [x] Auto-refresh failures are returned as warnings and never roll back a successful SVG write.

## Definition of Done

* Tests added or updated for the new behavior.
* `npm run typecheck` passes.
* `npm test` passes.
* User-facing README tool list is updated if the tool surface changes.
* Limitations around controlling an existing Inkscape GUI window are represented honestly.

## Technical Approach

Add a new core SVG operation that walks existing elements and replaces exact values in attributes and inline style declarations. Expose it as `replace_attribute_values`, implemented through `writeSvgWithSnapshot` so it follows existing atomic-write and history conventions. Update `replace_document_svg` metadata/response to make whole-document replacement explicit and reject calls unless the caller confirms full document replacement. Keep the Inkscape GUI behavior conservative through `refresh_in_inkscape`: default to a safe no-op warning, and only run active-window `file-rebase` when explicitly allowed for manual experiments.

Add an optional Inkscape companion extension under `inkscape-extension/`. The extension is a normal `.inx` + Python `inkex.EffectExtension` pair. It reads a workspace root from the extension UI, `INKSMCP_WORKSPACE`, or an installer-written config file, resolves a safe `docId`, reads `current.svg`, and returns that SVG to Inkscape so the current window is updated through Inkscape's extension output path. The MCP server triggers the extension action through Inkscape active-window actions after successful writes. This uses the extension action id, not `file-rebase`.

## Out of Scope

* Full semantic object recognition such as "make the pig yellow" without explicit color mappings.
* Direct GUI automation through keyboard/mouse simulation.
* Persistent Inkscape shell control unless existing CLI support is proven reliable in this task.
* Continuous live synchronization independent of MCP write calls.

## Technical Notes

* Existing tools: `update_element`, `apply_svg_operations`, and `replace_document_svg`.
* Current problem came from using `replace_document_svg` for a color-only request.
* Relevant files inspected:
  * `src/tools/elements.ts`
  * `src/core/svg-ops.ts`
  * `src/core/validation.ts`
  * `src/adapters/inkscape-cli.ts`
  * `src/server.ts`
