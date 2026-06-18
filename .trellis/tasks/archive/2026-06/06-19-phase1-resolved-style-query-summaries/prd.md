# Implement Phase 1 Resolved Style Query Summaries

## Goal

Add a read-only `query_document({ includeResolvedStyle: true })` option that summarizes effective SVG styling for queried elements. This improves precision-edit planning without mutating SVG, calling Inkscape, or pretending to provide full browser CSS computation.

## Requirements

- Add `includeResolvedStyle` to `query_document`.
- The style summary must be read-only: no snapshots, metadata updates, logs, operation diffs, or Inkscape refresh.
- The summary should combine inherited presentation attributes, inherited inline `style` declarations, local presentation attributes, and local inline `style` declarations.
- Local values override inherited values; inline style declarations override presentation attributes at the same element.
- Support a conservative property set useful for editing:
  - `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`
  - `fill-opacity`, `opacity`, `display`, `visibility`
  - `font-family`, `font-size`, `font-weight`, `font-style`, `text-anchor`
  - `clip-path`, `mask`, `filter`, `marker-start`, `marker-mid`, `marker-end`
- Return source information per property so an agent can tell whether a value came from an inherited attribute, inherited style, local attribute, or local style.
- Compact mode should include counts and compact per-element style summaries, not the full element tree.
- Standard/full mode should include resolved style details alongside the tree.
- Unsupported CSS features such as selectors, `<style>` sheets, CSS variables, `!important`, and external stylesheets must be reported as warnings/limitations, not silently treated as fully resolved.

## Acceptance Criteria

- [ ] Querying with `includeResolvedStyle: true` returns effective style summaries for target elements.
- [ ] Inheritance and local override behavior is tested.
- [ ] Compact mode returns counts plus compact style summaries and omits full tree payload.
- [ ] Standard/full mode includes detailed style source records.
- [ ] Query remains read-only and does not refresh Inkscape.
- [ ] Existing query dependency/path/fingerprint behavior remains green.

## Definition of Done

- Tests added for core style summary and `query_document` response modes.
- `npm run typecheck`, `npm test`, `npm run build`, `python inkscape-extension/inksmcp_pull.py --self-test`, and `git diff --check` pass.
- README documents the new query option and its limitations.
- `.trellis/spec/backend/roadmap-memory.md` records the durable contract.
- Task work is committed separately from archive and journal bookkeeping.

## Technical Approach

Implement a small core summarizer under `src/core/` that walks the parsed SVG tree and computes a conservative style map for each element by carrying inherited style state through the tree. Expose it through `query_document` only when requested. Do not add dependencies or call Inkscape for computed style; this is an SVG authoring summary, not a rendering-engine computed style.

## Decision (ADR-lite)

Context: Agents need to know the effective style before making precise edits, but full CSS cascade/rendering computation is broader than Phase 1.

Decision: Add a conservative resolved-style summary that covers presentation attributes and inline style declarations with inheritance and source tracking. Explicitly warn about unsupported CSS cascade features.

Consequences: The tool becomes much more useful for common SVG documents while staying deterministic and read-only. Later Phase 2/3 work can add richer CSS stylesheet parsing or Inkscape-rendered inspection without changing this base contract.

## Out of Scope

- Full CSS selector cascade.
- External stylesheets or remote CSS.
- CSS variables, media queries, animations, and `!important` precedence.
- Renderer-specific computed values from Inkscape.
- Mutating styles or normalizing SVG style declarations.

## Technical Notes

- Relevant roadmap item: `docs/roadmap/phase-1-stabilize-foundations.md` Workstream 5.
- Existing files:
  - `src/tools/document.ts`
  - `src/core/validation.ts`
  - `tests/query-document.test.ts`
  - `README.md`
  - `.trellis/spec/backend/roadmap-memory.md`
- Existing query patterns to reuse:
  - `includeDependencies`
  - `includePathNodes`
  - compact vs standard/full response behavior
