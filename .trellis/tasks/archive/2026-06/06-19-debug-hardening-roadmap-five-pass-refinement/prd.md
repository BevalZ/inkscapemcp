# Debug Hardening Roadmap Five-Pass Refinement

## Goal

Refine the existing three debug and hardening roadmap documents so they provide a complete next-step checklist for debugging, hardening, and capability expansion across the three long-term project phases.

## Requirements

- Update the existing documents:
  - `docs/roadmap/debug-hardening-phase-1.md`
  - `docs/roadmap/debug-hardening-phase-2.md`
  - `docs/roadmap/debug-hardening-phase-3.md`
- Keep the three-phase structure aligned with:
  - `docs/roadmap/phase-1-stabilize-foundations.md`
  - `docs/roadmap/phase-2-advanced-svg-inkscape-workflows.md`
  - `docs/roadmap/phase-3-near-1-1-vectorization.md`
  - `.trellis/spec/backend/roadmap-memory.md`
- Add a clear five-pass refinement model to each phase document, with at least five rounds of review/deepening that cover:
  - contract and invariant audit
  - failure and edge-case audit
  - observability and evidence audit
  - automation and regression-test audit
  - rollout, recovery, and follow-up audit
- For each phase, provide actionable next-step checklists that can seed future Trellis tasks.
- Preserve project safety boundaries: workspace confinement, snapshot-before-write, read-only query/diagnostic behavior, explicit bidirectional sync, allowlisted Inkscape execution, and artifact-first vectorization.

## Acceptance Criteria

- [ ] All three debug-hardening phase documents include an explicit five-pass refinement section.
- [ ] Each pass has concrete audit questions, candidate work items, verification evidence, and stop conditions.
- [ ] Each document has enough next-step detail to create multiple bounded Trellis tasks without relying on chat context.
- [ ] Phase 1 emphasizes sync, refresh, query, path, diff, replay, and recovery reliability.
- [ ] Phase 2 emphasizes structured SVG/Inkscape operations, dependency-aware mutation, text/assets, visual regression, and allowlisted actions.
- [ ] Phase 3 emphasizes artifact-first vectorization, metrics, editability, semantic reconstruction, OCR, screenshot diagnostics, and agent plan verification.
- [ ] Documentation remains in English.
- [ ] Markdown links and headings remain stable and readable.

## Definition Of Done

- Documentation updated.
- Markdown sanity checks pass where practical.
- Git diff reviewed for accidental unrelated changes.
- Work committed with a docs-focused commit.

## Technical Approach

Use the current roadmap docs as authoritative inputs. Strengthen the existing `debug-hardening-phase-*` documents instead of creating parallel plans. Add shared structure across all three documents while preserving phase-specific content and boundaries.

## Decision (ADR-lite)

**Context**: The user asked for all next-step debug and hardening checklist items, split into three phases, written into three documents, and repeated for at least five rounds.

**Decision**: Use the existing three `debug-hardening-phase-*` documents as the canonical artifacts and add a five-pass refinement matrix to each. This keeps future agents on the same documentation path already referenced by roadmap memory.

**Consequences**: The docs become longer but more directly executable. Future tasks can pick a phase, pass, and candidate item without re-deriving the hardening strategy from chat.

## Out Of Scope

- Implementing runtime MCP features in this task.
- Adding new tool schemas or changing TypeScript behavior.
- Creating a separate roadmap hierarchy outside `docs/roadmap/`.
- Rewriting the long-form phase roadmap files unless needed for link consistency.

## Technical Notes

- Existing documents already contain initial debug targets, hardening loops, execution templates, and boundaries.
- This task should deepen those documents with explicit five-pass audit/checklist structure rather than replacing their current sections.
