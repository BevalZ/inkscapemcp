# Implement Phase 1 Foundation Loop 1

## Goal

Implement the first verifiable slice of Phase 1 from `docs/roadmap/phase-1-stabilize-foundations.md`: strengthen the current sync/editing foundation without expanding into broad Phase 2 SVG workflows or Phase 3 vectorization automation.

The outcome should make future fine-editing work safer and cheaper by improving identity readiness, persistent polling configuration, compact inspection, operation diffs, and diagnostics.

## Boundary Decision

Recommended boundary for this loop:

1. Add a stable identity/extension readiness summary to connection and sync status.
2. Add persistent explicit polling preferences with restart-safe status semantics, but keep polling off by default.
3. Add compact query modes and dependency summary scaffolding so agents can inspect large documents without full tree payloads.
4. Add operation-diff artifacts for write operations at the workspace layer.
5. Extend GUI diagnostics to report capability readiness and actionable remediation.

This leaves room for later Phase 1 loops:

- automatic id repair proposal/apply
- stronger merge preview and conflict classes
- broader path command support and point transforms
- operation replay/recovery tools

## Requirements

- Preserve current workspace-authoritative default.
- Preserve explicit opt-in bidirectional mode.
- Preserve same-window refresh behavior after supported writes.
- Do not use Inkscape `file-rebase` by default.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.
- Do not introduce HTTP transport, database persistence, or background system service.
- Extend existing tool contracts through typed Zod schemas and backward-compatible optional fields.
- All writes must continue to snapshot before mutation.

## Acceptance Criteria

- [x] `connect_inkscape_window` returns a stable `identitySummary` and `capabilitySummary`.
- [x] Connection sidecars persist handshake/capability fields when available.
- [x] `get_gui_sync_status` reports identity strength, polling persistence, backoff/error counters, last pull, last skip, last conflict, and last error.
- [x] `start_gui_sync_polling` accepts `persist?: boolean`; persisted polling preferences are written under workspace metadata and are not required for normal polling.
- [x] Server context loads persisted polling preferences in a non-invasive way; polling remains disabled until explicit start or explicit persisted preference.
- [x] Polling prevents overlapping pulls and records skipped pulls.
- [x] `query_document` supports `responseMode: "compact" | "standard" | "full"` and keeps existing behavior for omitted `responseMode`.
- [x] `query_document` supports a dependency-summary option for defs/style/url references without mutating SVG.
- [x] Workspace write operations create compact operation-diff artifacts for changed elements/attributes/text/structure where practical.
- [x] Diff generation failure cannot roll back or fail an otherwise valid SVG write; it returns a warning or records diagnostic metadata.
- [x] `diagnose_inkscape_gui` reports extension capability readiness and exact remediation hints without mutating SVG.
- [x] README and Trellis spec document new fields and boundaries.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, and extension self-test pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and the remaining Phase 1 follow-ups.

## Technical Approach

- Reuse existing sync connection sidecars and SVG metadata marker rather than adding a new persistence system.
- Store persisted polling preferences in workspace-managed metadata files under the configured workspace.
- Add helper functions in `core/` for pure read-only summaries:
  - identity/capability strength summary
  - SVG dependency summary
  - operation diff summary
- Keep tool registration thin in `src/server.ts`; real logic should remain in `src/tools/*`, `src/core/*`, and adapters.
- Prefer compact responses by default only when the caller explicitly requests compact mode. Existing callers should keep current behavior.

## Out Of Scope

- Automatic id repair or remapping.
- Merge preview tooling beyond the existing conflict report foundations.
- New path command support such as arcs.
- Full replay/recovery tool surface.
- Phase 2 layers/defs editing/text/assets/transform tools.
- Phase 3 multi-pass vectorization, OCR, screenshot diagnostics, and agent planning.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Relevant existing files:
  - `src/tools/sync.ts`
  - `src/tools/context.ts`
  - `src/tools/document.ts`
  - `src/tools/preview.ts`
  - `src/adapters/workspace.ts`
  - `src/adapters/inkscape-cli.ts`
  - `src/core/sync-metadata.ts`
  - `src/core/validation.ts`
  - `src/server.ts`
  - `inkscape-extension/inksmcp_pull.py`
  - `tests/sync.test.ts`
  - `tests/query-document.test.ts`
  - `tests/preview.test.ts`
