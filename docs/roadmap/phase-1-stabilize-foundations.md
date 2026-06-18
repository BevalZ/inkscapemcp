# Phase 1 Roadmap: Stabilize Current Foundations

## Purpose

Phase 1 turns the current InkSMCP foundation into a dependable precision-editing platform. The goal is not to expand into every Inkscape feature yet. The goal is to make the existing sync, refresh, query, path, and operation machinery predictable enough that later advanced tools can build on it without re-solving identity, conflict, and recovery problems.

Recommended default: implement this phase before broad feature expansion. A stable editing substrate is more valuable than a large but brittle tool surface.

## Current Baseline

The project already has these foundations:

- Workspace SVG files are authoritative by default.
- Bidirectional GUI sync is explicit and opt-in.
- GUI pull validates document identity, connection identity, revision, and content hash.
- Current-state reads and writes pre-pull GUI state for active bidirectional connections.
- Automatic same-window refresh exists through active-window attribute sync or the companion extension.
- Inkscape `file-rebase` is not used by default because it can crash on Windows Inkscape 1.4.x.
- Conservative same-id non-overlap merge exists for GUI pulls.
- Semantic fingerprints and candidate matching exist as read-only query helpers.
- Controlled SVG import, external export, vectorization artifacts, and GUI diagnostics have initial foundations.

Phase 1 assumes these behaviors remain true.

## Product Goal

An agent should be able to perform repeated precise edits in an open Inkscape workflow without accidentally replacing the whole document, targeting the wrong window, losing unsaved GUI work, or leaving the user to manually refresh after ordinary operations.

## Non-Goals

- Do not add arbitrary Inkscape action execution.
- Do not make GUI mouse/keyboard automation the primary path.
- Do not add HTTP transport, database persistence, or a background system service.
- Do not automatically rewrite user ids unless the repair operation is explicit or the policy is clearly documented.
- Do not attempt near-1:1 bitmap vectorization in this phase.

## Workstream 1: Identity Handshake Hardening

### Problem

Current identity validation is sufficient for the implemented bidirectional sync boundary, but later multi-window and fine-editing workflows need stronger proof that MCP is talking to the intended document and window.

### Recommended Plan

1. Add a formal connection handshake result returned by `connect_inkscape_window`.
2. Include a capability summary for the active companion extension:
   - installed pull action
   - installed push action
   - extension version
   - supported manifest version
   - whether `windowId` was observed
   - whether `runtimeDocumentId` was observed
3. Persist the negotiated handshake fields in the connection sidecar.
4. Require later GUI pull/push manifests to match the negotiated fields when present.
5. Surface identity readiness through `get_gui_sync_status`.

### Candidate Fields

```json
{
  "connectionId": "fish-window-1",
  "docId": "fish",
  "syncMode": "bidirectional",
  "handshake": {
    "manifestVersion": 1,
    "extensionVersion": "0.2.0",
    "runtimeDocumentId": "inkscape-runtime-doc-id",
    "windowId": "inkscape-window-id",
    "supportsPull": true,
    "supportsPush": true,
    "supportsSameWindowRefresh": true
  }
}
```

### Acceptance Criteria

- A connected document reports a stable identity summary.
- Missing optional identity fields remain allowed when Inkscape cannot provide them.
- If a connection recorded `windowId` or `runtimeDocumentId`, later mismatches reject with `SYNC_IDENTITY_MISMATCH`.
- Status output clearly distinguishes "connected but weak identity" from "connected with full identity".

## Workstream 2: Persistent Explicit Polling

### Problem

Current polling is in-process and explicit. It is safe, but it does not survive server restart and does not give enough lifecycle detail for long editing sessions.

### Recommended Plan

1. Persist polling preferences separately from live timers.
2. Keep polling disabled by default.
3. Restart polling only for connections that explicitly opted into persistent polling.
4. Add a monotonic poll generation id so stale timers cannot update status after restart.
5. Record last successful pull, last skipped pull, last conflict, and last error.
6. Add backoff after repeated errors.

### Candidate Tool Changes

```typescript
start_gui_sync_polling({
  docId,
  connectionId,
  intervalMs,
  timeoutMs,
  persist?: boolean
})
```

```typescript
get_gui_sync_status({
  docId?,
  connectionId?,
  includeHistory?: boolean
})
```

### Acceptance Criteria

- Polling remains off unless explicitly started.
- A server restart restores only persisted polling entries.
- Non-persisted polling entries disappear after restart.
- Polling never overlaps pulls for the same connection.
- Poll status reports conflict, timeout, unavailable extension, and identity mismatch separately.

## Workstream 3: Automatic Id Repair And Remapping

### Problem

Inkscape and SVG editing can change ids. Read-only semantic matching helps identify likely matches, but agents still need a controlled repair path when ids are lost or changed.

### Recommended Plan

1. Keep semantic matching read-only by default.
2. Add an explicit id repair proposal tool.
3. Add a separate apply tool that requires exact proposal ids or a confirmed policy.
4. Never repair ambiguous matches automatically.
5. Preserve a repair log in document history.

### Candidate Tools

```typescript
propose_id_repairs({
  docId,
  baselineSnapshotId?,
  minConfidence?: number,
  includeRejected?: boolean
})
```

```typescript
apply_id_repairs({
  docId,
  proposalId,
  repairs,
  conflictPolicy: "reject" | "rename_newer" | "keep_existing"
})
```

### Matching Signals

- element type
- parent chain
- sibling position
- bounding box
- path geometry hash
- style hash
- text hash
- transform hash
- approximate visual area

### Acceptance Criteria

- Proposal generation does not mutate SVG.
- Apply operation snapshots before write.
- Ambiguous matches below confidence threshold are rejected.
- Existing unrelated ids are never overwritten.
- Repair output includes old id, new id, confidence, and evidence.

## Workstream 4: Stronger Conservative Merge

### Problem

The existing non-overlap merge handles a narrow but important class of GUI/workspace conflicts. Agents need more detail and safer merge coverage before using bidirectional mode heavily.

### Recommended Plan

1. Expand conflict classification before expanding automatic merge.
2. Track changes at element, attribute, text, child-order, and parent levels.
3. Add merge previews that show exactly what would be applied.
4. Keep automatic merge conservative.
5. Add explicit policies for different conflict classes.

### Candidate Conflict Classes

- same id, different attribute keys changed
- same id, same attribute changed differently
- text changed on one side
- text changed on both sides
- element added on one side
- element added on both sides with same id
- element deleted on one side
- element moved to a different parent
- sibling order changed
- parent deleted
- defs, marker, gradient, clipPath, mask dependency changed

### Candidate Policies

- `reject`
- `prefer_gui`
- `prefer_workspace`
- `merge_non_overlapping`
- `preview_only`

### Acceptance Criteria

- Pull conflict output is structured enough for an agent to explain the exact collision.
- Preview mode produces a merge candidate artifact without replacing `current.svg`.
- Automatic merge rejects when dependency order, parentage, or shared attributes are ambiguous.
- Tests cover every conflict class that the merge engine claims to understand.

## Workstream 5: Richer Query And Inspect Tools

### Problem

Precision editing depends on knowing exactly what exists in the SVG. Current query support should become a reliable inspection surface for agents.

### Recommended Plan

1. Add selectable query depth levels.
2. Add path node summaries for all path elements when requested.
3. Add style resolution summaries without rewriting the SVG.
4. Add dependency summaries for defs, gradients, markers, clips, masks, symbols, images, and fonts.
5. Add compact response modes for token efficiency.

### Candidate Tool Changes

```typescript
query_document({
  docId,
  elementId?,
  includeFingerprints?: boolean,
  includePathNodes?: boolean,
  includeResolvedStyle?: boolean,
  includeDependencies?: boolean,
  responseMode?: "compact" | "standard" | "full"
})
```

### Acceptance Criteria

- Compact mode is useful for agents and avoids returning the full SVG tree by default.
- Full mode remains available for deep diagnosis.
- Read-only query tools never snapshot, write logs, or refresh Inkscape.
- Dependency summaries expose enough information to safely edit defs-based features later.

## Workstream 6: Path Editing Reliability

### Problem

Path-level edits are central to precise drawing, but they must remain deterministic and testable. The current path tooling should become stronger before adding broad shape recognition and tracing workflows.

### Recommended Plan

1. Extend structured path support incrementally.
2. Add normalized absolute and relative views.
3. Add arc support only after robust parsing and round-trip tests.
4. Add path validation that reports exact segment and parameter errors.
5. Add small geometry helpers for common edits.

### Candidate Tools

```typescript
query_path_nodes({ docId, elementId, normalize?: "none" | "absolute" })
```

```typescript
edit_path_nodes({
  docId,
  elementId,
  edits,
  refresh?: "auto" | "skip"
})
```

```typescript
transform_path_points({
  docId,
  elementId,
  pointSelector,
  transform
})
```

### Acceptance Criteria

- Supported commands round-trip without geometry drift.
- Unsupported commands fail with actionable `INVALID_INPUT` details.
- Attribute-only `d` updates use automatic direct active-window attribute sync where possible.
- Structural path operations return warnings when same-window refresh is best-effort.

## Workstream 7: Operation Diff, Replay, And Recovery

### Problem

Fine editing needs a recovery trail. History snapshots exist, but agents also need concise operation-level diffs and replayable operations.

### Recommended Plan

1. Add operation diff artifacts for every write.
2. Store changed element ids, attribute changes, text changes, and structural changes.
3. Add a dry-run mode for complex operations.
4. Add replay support for deterministic operations.
5. Add recovery helpers for "last good snapshot" and "operation failed after save but before refresh".

### Candidate Tools

```typescript
diff_document_snapshots({
  docId,
  fromSnapshotId,
  toSnapshotId,
  responseMode?: "compact" | "full"
})
```

```typescript
replay_operations({
  docId,
  operations,
  dryRun?: boolean
})
```

```typescript
recover_document({
  docId,
  strategy: "last_snapshot" | "last_successful_write" | "workspace_current"
})
```

### Acceptance Criteria

- Every write can be explained as a compact diff.
- Dry-run never mutates `current.svg`.
- Replay refuses operations that depend on missing ids or stale baselines.
- Recovery operations snapshot before replacing current state.

## Workstream 8: Extension Self-Check And Installer Feedback

### Problem

Users should not have to infer why automatic refresh or bidirectional sync is not working.

### Recommended Plan

1. Extend `diagnose_inkscape_gui`.
2. Add an extension capability self-test.
3. Check action ids, config file, workspace root, extension version, and active document inference.
4. Provide exact remediation steps in structured warnings.

### Acceptance Criteria

- Diagnosis identifies missing files, stale extension version, wrong workspace root, and action unavailable.
- Diagnosis does not mutate SVG or use mouse/keyboard automation.
- Installer tests cover config generation and expected action declarations.

## Recommended Implementation Order

1. Identity handshake and extension self-check.
2. Richer status for sync and polling.
3. Persistent polling preferences with backoff.
4. Operation diff and dry-run foundation.
5. Stronger query modes and dependency summaries.
6. Id repair proposal and explicit apply flow.
7. Stronger merge preview and conflict classes.
8. Path editing reliability extensions.

This order reduces risk because sync identity and diagnostics make every later debugging session cheaper.

## Testing Plan

- Unit tests for handshake metadata validation.
- Unit tests for polling persistence and timer generation.
- Unit tests for id repair proposal ranking and ambiguity rejection.
- Unit tests for merge conflict classes.
- Unit tests for operation diffs and dry-run no-write behavior.
- Tool tests for compact/full query modes.
- Integration tests for extension self-check when Inkscape is available.
- Regression tests proving write failures leave `current.svg` unchanged.

## Definition Of Done

- All new write paths snapshot before mutation.
- All new tools use Zod input schemas.
- All identity-bearing operations reject ambiguity instead of guessing.
- Current open-window refresh remains automatic after supported write operations.
- No new code path uses `file-rebase` unless explicitly requested for manual experiments.
- Typecheck, tests, build, and extension self-test pass.
- README and Trellis spec document the resulting contracts.

