# Implement Bidirectional Inkscape GUI State Sync MVP

## Goal

Make InkSMCP able to treat the user's current Inkscape GUI document state as authoritative when a document is explicitly connected in bidirectional mode. The first MVP must pull unsaved Inkscape GUI memory state into the MCP workspace before relevant tool operations, while preserving workspace history, conflict detection, and safety boundaries.

## What I Already Know

- Current InkSMCP treats `workspace/drawings/{docId}/current.svg` as the source of truth.
- Current automatic GUI refresh is one-way: MCP writes workspace SVG and refreshes Inkscape.
- The user wants the actual post-user-operation GUI state to become authoritative, even when it has not been saved to `current.svg`.
- Bidirectional sync should be explicit, not globally enabled by default.
- Near 1:1 bitmap vectorization is a later task and depends on reliable GUI/workspace synchronization.

## Requirements

- Add explicit bidirectional connection management:
  - `connect_inkscape_window({ docId, syncMode })`
  - `disconnect_inkscape_window({ docId?, connectionId? })`
  - `syncMode` supports at least `display_only` and `bidirectional`.
- Default behavior remains no automatic reverse sync unless a document is connected in bidirectional mode.
- Inkscape extension may also enable bidirectional sync for the current active document.
- `docId` identification priority in the extension:
  1. infer from current file path under `workspace/drawings/{docId}/current.svg`
  2. explicit extension UI `docId`
  3. installer/MCP config `activeDocId`
- Missing doc id, conflicting inferred/UI ids, or nonexistent workspace doc ids must reject connection.
- Connection identity must include:
  - `connectionId`
  - `docId`
  - `documentPath` and/or `inferredDocId`
  - optional runtime document id when available
- `connectionId` must be stored in both:
  - workspace connection config
  - SVG metadata marker inside the connected Inkscape document
- The SVG metadata marker is workflow metadata:
  - preserved in workspace `current.svg` and history
  - removed from `export_document` outputs by default
  - preserved only when `includeInkMcpMetadata: true`
- Add workspace revision tracking:
  - `revision`
  - `contentHash`
  - `lastWriter`
  - `lastGuiPullAt?`
- First-stage GUI state pull:
  - extension exports current unsaved GUI document memory state to `workspace/gui-pull/{requestId}.svg`
  - extension writes `workspace/gui-pull/{requestId}.json` manifest
  - manifest includes `connectionId`, `requestedDocId`, `inferredDocId`, `documentPath`, `inkscapeVersion`, and `exportedAt`
- Add `pull_gui_state({ docId, connectionId?, conflictPolicy?, timeoutMs? })`.
- `pull_gui_state` must:
  - trigger the extension action for the active connected document
  - validate identity from the manifest and SVG metadata marker
  - parse and safety-filter pulled SVG
  - detect conflicts using revision/contentHash
  - default `conflictPolicy` to `reject`
  - support explicit `prefer_gui` and `prefer_workspace`
  - snapshot old workspace state before writing GUI state
  - preserve raw pulled SVG artifact path in the response
  - write workspace `current.svg` only after validation and conflict checks
  - update revision/hash/lastWriter/lastGuiPullAt/lastSeenAt on success
  - return `idDiff` for retained, removed, and added element ids
  - not auto-refresh Inkscape after writing, because the source was already GUI state
- GUI pull should preserve Inkscape private metadata while still applying existing SVG safety filtering.
- Automatic reverse sync in the MVP uses pre-tool pull, not background polling or daemon:
  - current SVG structure reads must pre-pull
  - current SVG writes must pre-pull
  - `render_preview` and `export_document` must account for pre-pull
  - history/archive/connection/runtime tools do not pre-pull
  - `pull_gui_state` itself does not pre-pull
- Pre-pull must use a default TTL cache of `1000ms`, configurable through `INKSMCP_GUI_PRE_PULL_TTL_MS`.
- Read-only tools may allow `skipPrePull`; write tools may not skip pre-pull when bidirectional sync is active.
- Pre-pull failure behavior:
  - write tools fail and do not modify workspace
  - `query_document` / `query_path_nodes` fail by default, with optional `allowStaleRead: true`
  - `render_preview` / `export_document` may use stale workspace output by default but must return a warning
- `rollback_document` with active bidirectional sync must reject by default unless the caller explicitly confirms discarding GUI state.
- Connection lifecycle:
  - explicit disconnect
  - heartbeat expiry after 10 minutes by default
  - all successful pulls update `lastSeenAt`
  - TTL skip does not update `lastSeenAt`
  - MCP restart does not automatically invalidate connections
- If multiple active bidirectional connections target the same doc or active environment ambiguously, first-stage behavior must reject rather than guess.

## Acceptance Criteria

- [ ] `connect_inkscape_window` creates a connection config and injects a connection metadata marker.
- [ ] Inkscape extension can enable bidirectional sync and identify docId using the agreed priority.
- [ ] Inkscape extension can push current unsaved GUI document state to `workspace/gui-pull/{requestId}.svg` with a manifest.
- [ ] `pull_gui_state` validates manifest identity and SVG metadata marker before writing.
- [ ] `pull_gui_state` rejects conflicts by default and supports explicit `prefer_gui`.
- [ ] `pull_gui_state` snapshots old workspace state, writes the pulled GUI SVG, updates revision/hash metadata, and returns idDiff.
- [ ] `pull_gui_state` does not refresh Inkscape after writing workspace state.
- [ ] Pre-pull runs before current-state read and write tools for bidirectional docs.
- [ ] Write tools fail without modifying workspace when pre-pull fails.
- [ ] Read tools either fail or return stale warning according to their configured behavior.
- [ ] `export_document` strips InkSMCP metadata by default and can preserve it explicitly.
- [ ] Connection expiry and disconnect behavior are represented in tests.
- [ ] Typecheck, tests, and build pass.
- [ ] README and backend code-spec document the bidirectional sync boundaries and remaining limitations.

## Definition Of Done

- Focused tests cover revision/hash/conflict/idDiff behavior.
- Focused tests cover connection config, metadata marker, and expiry.
- Extension tests cover bidirectional manifest generation and safe docId/path resolution.
- MCP tool tests cover manual pull, pre-pull success/failure, and no refresh loop.
- Build and typecheck pass.
- Any Inkscape integration path skips clearly when Inkscape is unavailable.
- Work is committed, task is archived, and session journal records the outcome.

## Out Of Scope

- Background polling daemon.
- Persistent Inkscape event listener.
- True multi-window synchronization beyond rejecting ambiguous active connections.
- Three-way SVG DOM merge.
- Semantic object re-identification after id changes.
- Raster image vectorization, VTracer/Potrace adapters, or image diff metrics.
- Mouse/keyboard GUI automation.
- Writing arbitrary external files outside the configured workspace.

## Technical Approach

Build the MVP as a controlled pull-based extension of the existing companion extension flow:

- Add workspace metadata revision/hash helpers.
- Add connection sidecar files under the workspace.
- Add SVG metadata marker helpers.
- Extend the Inkscape companion extension with a push/export command that writes pulled SVG and manifest files.
- Add MCP tools for connect/disconnect/pull.
- Add pre-pull plumbing in tool context so existing read/write tools can opt into bidirectional freshness without duplicating pull logic.
- Keep SVG workspace safety checks and snapshots as the authoritative write gate.

## Decision (ADR-lite)

**Context**: The user wants MCP to operate on the actual Inkscape GUI state after manual user edits, including unsaved GUI memory state.

**Decision**: Implement explicit bidirectional connection mode using pull-based GUI state synchronization. First-stage automatic behavior happens before MCP tools operate, not through a background daemon. Connection identity is enforced through connection config, SVG metadata marker, docId/path checks, and optional runtime id.

**Consequences**: The MVP is safer and testable, but not full real-time sync. It may fail when the wrong Inkscape window is active, when connection identity cannot be proven, or when conflicts are detected. Later work can add daemon/event-driven sync, semantic re-identification, and raster vectorization.

## Technical Notes

- Relevant files:
  - `src/adapters/workspace.ts`
  - `src/adapters/inkscape-cli.ts`
  - `src/tools/context.ts`
  - `src/tools/document.ts`
  - `src/tools/elements.ts`
  - `src/tools/preview.ts`
  - `src/server.ts`
  - `src/core/svg-ops.ts`
  - `src/core/validation.ts`
  - `inkscape-extension/inksmcp_pull.py`
  - `inkscape-extension/inksmcp_pull.inx`
  - `scripts/install-inkscape-extension.mjs`
- Existing current-state read tools include `query_document`, `query_path_nodes`, `render_preview`, and `export_document`.
- Existing write tools already snapshot and auto-refresh; GUI pull must not call auto-refresh after writing workspace state.
