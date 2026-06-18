# Write Roadmap Debug And Hardening Loops

## Goal

Create a three-phase debug and hardening plan that follows the same roadmap structure as the advanced InkSMCP roadmap, then use it as the repeatable control checklist for at least five future implementation loops.

## Requirements

- Write three detailed documents under `docs/roadmap/`:
  - Phase 1 debug/hardening checklist.
  - Phase 2 debug/hardening checklist.
  - Phase 3 debug/hardening checklist.
- Each document must include:
  - debug targets
  - hardening targets
  - verification commands and evidence
  - boundary protections
  - suggested loop order
  - candidate Trellis task slices
- Add a five-loop execution template that can be repeated for future work.
- Update `.trellis/spec/backend/roadmap-memory.md` so future agents know these documents exist.
- Do not change runtime behavior in this task.

## Acceptance Criteria

- [x] `docs/roadmap/debug-hardening-phase-1.md` exists and is detailed.
- [x] `docs/roadmap/debug-hardening-phase-2.md` exists and is detailed.
- [x] `docs/roadmap/debug-hardening-phase-3.md` exists and is detailed.
- [x] The documents explicitly align with Phase 1/2/3 roadmap boundaries.
- [x] The documents include a repeatable five-loop process.
- [x] Roadmap memory links to the new documents.
- [ ] Markdown is searchable and `git diff --check` passes.

## Out Of Scope

- Runtime code changes.
- New MCP tools.
- Rewriting the existing phase roadmap docs.
