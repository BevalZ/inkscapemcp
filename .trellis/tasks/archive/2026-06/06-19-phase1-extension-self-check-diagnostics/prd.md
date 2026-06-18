# Phase 1 Extension Self-Check Diagnostics

## Goal

Strengthen `diagnose_inkscape_gui` so users and agents can understand why same-window refresh or bidirectional GUI sync is unavailable without guessing from generic extension-missing warnings.

This is a Phase 1 Workstream 8 slice from `docs/roadmap/phase-1-stabilize-foundations.md`. It improves diagnosis and installer coverage only; it does not change refresh behavior, connection policy, GUI automation, or SVG mutation paths.

## Requirements

* Extend Inkscape GUI diagnostics with a structured companion extension self-check.
* Report per-file status for `inksmcp_pull.inx`, `inksmcp_push_gui_state.inx`, `inksmcp_pull.py`, and `inksmcp-extension.json`.
* Parse installed `.inx` files enough to confirm expected extension ids, action ids, hidden action parameters, and Python command declarations.
* Parse `inksmcp-extension.json` enough to confirm that `workspaceRoot` exists and matches the current MCP workspace root when diagnosis is called from a real tool context.
* Return structured warnings and remediation entries for:
  * missing extension files
  * invalid extension config JSON
  * missing `workspaceRoot`
  * wrong configured workspace root
  * missing or stale action declarations
* Keep `diagnose_inkscape_gui` read-only: no SVG snapshots, no workspace writes, no operation logs, no refresh, and no mouse/keyboard automation.
* Update installer/extension tests so expected action declarations and config generation remain covered.
* Update README and roadmap memory with the resulting diagnostic contract.

## Acceptance Criteria

* [ ] Diagnosis identifies installed file presence and capability readiness in structured fields.
* [ ] Diagnosis reports wrong workspace root with expected and actual paths.
* [ ] Diagnosis reports missing or malformed `.inx` declarations for both pull and push extension files.
* [ ] Diagnosis reports missing or invalid config file without mutating SVG state.
* [ ] Installer tests cover generated config and expected `.inx` action declarations.
* [ ] Focused tests, typecheck, full test suite, build, extension Python self-test, and `git diff --check` pass.

## Definition of Done

* Tests added or updated for every new diagnostic class.
* Public README text describes the new self-check output at a high level.
* `.trellis/spec/backend/roadmap-memory.md` records the Phase 1 loop contract.
* No default `file-rebase`, no arbitrary Inkscape actions, no GUI mouse/keyboard automation, and no direct extension writes to `current.svg`.

## Technical Approach

Add the self-check at the `InkscapeCli.diagnoseGui` adapter boundary because that code already discovers the Inkscape user data directory and extension directory. The adapter can read installed companion files and config, then return structured read-only status. The tool layer can compare the adapter's configured `workspaceRoot` against `ctx.workspace.paths.root` and derive readiness/remediation without writing files.

Tests should mock `diagnoseGui` for tool-level read-only behavior and add adapter-level filesystem tests by stubbing discovery/user data resolution rather than launching real Inkscape. Installer tests should continue to run the install script into a temporary user data directory.

## Decision (ADR-lite)

**Context**: Phase 1 needs less ambiguous GUI integration diagnosis before later precise editing and vectorization work.

**Decision**: Implement a local file/config/action declaration self-check rather than probing live Inkscape actions or using GUI automation.

**Consequences**: Diagnostics become deterministic, fast, and safe. They cannot prove that an already-open Inkscape window has reloaded the extension; remediation must still tell users to restart Inkscape after installation or stale declarations.

## Out of Scope

* Live action execution probes.
* Automatic extension installation from `diagnose_inkscape_gui`.
* Refresh or bidirectional sync behavior changes.
* New transport, background service, or GUI automation.
* Version negotiation beyond reporting/validating the currently declared extension files.

## Technical Notes

* Relevant roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 8.
* Persistent contracts: `.trellis/spec/backend/roadmap-memory.md`.
* Existing adapter surface: `src/adapters/inkscape-cli.ts`.
* Existing tool surface: `src/tools/preview.ts`.
* Existing tests: `tests/preview.test.ts`, `tests/inkscape-cli.test.ts`, `tests/inkscape-extension.test.ts`.
