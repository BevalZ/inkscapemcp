# Phase 1 GUI Polling Generation Guard

## Goal

Harden explicit GUI sync polling with a monotonic generation guard so stale timer callbacks cannot update a stopped, restarted, or reloaded polling entry.

This is a Phase 1 Workstream 2 slice from `docs/roadmap/phase-1-stabilize-foundations.md`. Existing polling already supports explicit opt-in, persistence, in-flight overlap prevention, history/status reporting, and backoff. This task closes the roadmap's remaining generation-id lifecycle gap without changing the user-facing polling policy.

## Requirements

* Add a monotonic polling generation id to in-process polling status.
* Increment generation whenever a polling entry is created from `start_gui_sync_polling` or restored from a persisted preference.
* Timer callbacks must carry the generation they were created with.
* A timer callback whose generation no longer matches the current registry entry must exit without changing status, counters, backoff, or history fields.
* `get_gui_sync_status` must expose the current generation for diagnostics.
* Stopping polling must keep clearing timers and disabling persisted preferences exactly as before.
* Existing safety contracts remain unchanged:
  * polling disabled by default
  * only explicit `start_gui_sync_polling` starts timers
  * no overlapping pulls for the same connection
  * read-only status tools do not snapshot, log, or refresh
  * active bidirectional identity checks remain enforced by `pull_gui_state`

## Acceptance Criteria

* [ ] Starting polling returns a positive `generation`.
* [ ] Restarting a polling entry after stop returns a higher generation than the prior entry.
* [ ] Restored persisted polling entries get a generation and expose it in status.
* [ ] A stale tick from an older generation cannot update the new polling entry's counters or timestamps.
* [ ] Existing polling tests continue to pass.
* [ ] README and roadmap memory document the generation guard contract.
* [ ] Focused tests, typecheck, full tests, build, extension Python self-test, and `git diff --check` pass.

## Definition of Done

* Tests cover start/restart generation monotonicity and stale-generation tick rejection.
* No new background service, file watcher, database, or implicit polling behavior is introduced.
* No changes weaken pre-pull, identity, conflict, or refresh semantics.
* Trellis task is archived, session journal is recorded, and commits are pushed.

## Technical Approach

Keep the generation counter in the in-process `GuiSyncPollRegistry`; persisted preferences should not store runtime timer generation because generation is about server-process lifecycle. Add `nextGeneration` to the registry, assign it when constructing a `GuiSyncPollStatus`, and pass the assigned value into each timer callback.

Change `runPollingTick` to accept `generation`. It should read the current registry entry and return early if the entry is gone, stopped, or has a different generation. Existing direct immediate ticks after start should use the same generation.

## Decision (ADR-lite)

**Context**: JavaScript timer callbacks may already be queued when polling is stopped and restarted. Without a generation check, an old callback can observe a same-connection registry entry created later and mutate the new status.

**Decision**: Use an in-memory monotonic generation on polling entries and require each tick to match it before touching status.

**Consequences**: This is deterministic and token-light in status output. Generation resets when the MCP server process restarts, which is acceptable because old process timers cannot run in the new process.

## Out of Scope

* Persisting generation to `.polling.json`.
* Changing polling intervals, backoff formulas, or retry behavior.
* Adding new public tools.
* Adding a daemon or event listener.
* Changing GUI pull conflict policies.

## Technical Notes

* Relevant roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 2.
* Persistent contracts: `.trellis/spec/backend/roadmap-memory.md`.
* Likely implementation: `src/tools/sync.ts`.
* Existing tests: `tests/sync.test.ts`.
