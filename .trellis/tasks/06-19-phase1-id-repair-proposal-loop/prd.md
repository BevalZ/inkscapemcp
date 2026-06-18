# Implement Phase 1 Id Repair Proposal Loop

## Goal

Implement the next Phase 1 precision-editing foundation slice: add a read-only `propose_id_repairs` tool that compares a known-good baseline snapshot with the current workspace SVG and proposes likely element id remappings when ids changed or disappeared.

The outcome should help agents recover targeting intent after Inkscape or manual editing changes ids, while keeping repair application as a separate future step.

## Boundary Decision

Recommended boundary for this loop:

1. Add `propose_id_repairs({ docId, baselineSnapshotId, minConfidence?, includeRejected?, responseMode? })`.
2. Compare a history snapshot/checkpoint SVG to the current workspace SVG.
3. Detect baseline ids that are missing from the current SVG.
4. Use existing semantic fingerprints and matching signals to rank current elements as repair candidates.
5. Return only proposals and rejected/ambiguous candidates; do not mutate `current.svg`.
6. Keep proposal data response-only for this loop; no artifact persistence yet.
7. Pre-pull active bidirectional GUI state through current-state read semantics before comparing.
8. Support compact/full response modes for token control.

This loop intentionally does not add `apply_id_repairs`, proposal artifact persistence, automatic repair, id rewriting, dependency reference rewriting, cross-document repair, or visual scoring.

## Requirements

- Preserve workspace-authoritative default behavior.
- `propose_id_repairs` must be read-only: no snapshots, metadata updates, operation logs, operation-diff artifacts, preview artifacts, or GUI refresh.
- The tool must require an explicit `baselineSnapshotId` and read it only from `workspace/drawings/{docId}/history/`.
- Unsafe or missing snapshot ids must reject through existing history snapshot validation.
- The tool must pre-pull active bidirectional GUI state before reading current SVG.
- `minConfidence` must default to a conservative value and constrain accepted proposals.
- A proposal is accepted only when the top candidate meets `minConfidence` and is not tied with another candidate at the same score.
- Ambiguous, low-confidence, and no-match cases must be reported but not applied.
- Compact response must return counts and accepted proposal summaries without full fingerprint payloads.
- Full response must include candidate evidence/fingerprints for accepted and optionally rejected candidates.
- `includeRejected: true` must include rejected candidates; false must omit them from compact/full responses.
- The tool must reuse existing semantic fingerprint logic rather than adding a parallel matcher.
- Do not use Inkscape `file-rebase`.
- Do not add arbitrary Inkscape actions.
- Do not add GUI mouse/keyboard automation.

## Acceptance Criteria

- [x] MCP registers `propose_id_repairs`.
- [x] `propose_id_repairs` accepts `docId`, `baselineSnapshotId`, `minConfidence`, `includeRejected`, and `responseMode`.
- [x] Missing/unsafe snapshot ids reject without changing workspace state.
- [x] The tool pre-pulls active bidirectional GUI state before comparing current SVG.
- [x] Read-only calls do not create snapshots, logs, operation diffs, preview artifacts, metadata updates, or GUI refresh.
- [x] Renamed elements with strong semantic matches produce accepted proposals.
- [x] Low-confidence matches are rejected when below `minConfidence`.
- [x] Tied top candidates are rejected as ambiguous.
- [x] Compact mode returns counts and accepted proposal summaries without full fingerprint payloads.
- [x] Full mode returns candidate evidence/fingerprints.
- [x] `includeRejected` controls rejected proposal visibility.
- [x] README documents the id repair proposal contract and read-only guardrails.
- [x] `.trellis/spec/backend/roadmap-memory.md` records the new Phase 1 id repair proposal contract.
- [x] `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.

## Definition Of Done

- The implementation is committed as a coherent work commit.
- The task is archived after successful validation.
- A journal entry records this loop and remaining Phase 1 follow-ups.

## Technical Approach

- Add `proposeIdRepairsSchema` near query/snapshot schemas.
- Add a core module for id repair proposals that reuses `fingerprintSvgElements` and semantic match scoring.
- Implement `proposeIdRepairs` in `src/tools/document.ts`.
- Register the tool in `src/server.ts`.
- Add tests for renamed ids, ambiguity, threshold rejection, rejected visibility, read-only invariants, and bidirectional pre-pull.

## Decision (ADR-lite)

**Context**: Phase 1 already exposes semantic fingerprints and candidate matching. Agents need a safer workflow for recovering element identity when ids change before any write-side repair is introduced.

**Decision**: Add a read-only proposal tool first. It requires an explicit baseline snapshot, produces ranked remapping candidates, and refuses to apply or persist repairs in this loop.

**Consequences**: Agents can inspect likely id remaps without risking SVG mutation. A later `apply_id_repairs` loop can consume the same proposal shape, add snapshot-first writes, and handle dependency/reference updates explicitly.

## Out Of Scope

- `apply_id_repairs`.
- Proposal artifact persistence or listing.
- Automatic id rewriting.
- Updating `url(#id)`, `href="#id"`, markers, clips, masks, gradients, symbols, or external references.
- Cross-document repair.
- Visual comparison or raster scoring.
- Repairing missing elements that no longer exist in any recognizable form.

## Technical Notes

- Primary roadmap: `docs/roadmap/phase-1-stabilize-foundations.md`, Workstream 3.
- Debug loop plan: `docs/roadmap/debug-hardening-phase-1.md`.
- Durable memory: `.trellis/spec/backend/roadmap-memory.md`.
- Prior foundations: `query_document` semantic fingerprints, `diff_document_snapshots`, `create_checkpoint`, and snapshot reading.
- Likely implementation files:
  - `src/core/id-repair.ts`
  - `src/core/semantic-fingerprint.ts`
  - `src/core/validation.ts`
  - `src/server.ts`
  - `src/tools/document.ts`
  - `tests/id-repair.test.ts`
