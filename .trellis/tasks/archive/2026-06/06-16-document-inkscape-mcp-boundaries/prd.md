# Document Inkscape MCP Boundaries

## Goal

Update the project planning document so the Inkscape MCP design reflects the boundaries already confirmed with the user. The update should make Phase 1 and Phase 2 scope explicit enough to guide implementation without reopening settled decisions.

## Requirements

- Add a confirmed boundaries section to `docs/inkscape-mcp-plan.md`.
- Update Phase 1 to cover the agreed MVP:
  - local single-user stdio MCP server
  - workspace-managed documents only
  - SVG file as source of truth
  - basic SVG elements, basic styles, groups, and raw SVG/XML insertion/replacement
  - safety filtering for dangerous SVG content
  - write-before-change snapshots, history listing, and rollback
  - PNG preview generation with file path metadata
  - SVG/PNG/PDF export
  - optional GUI open, with no automatic GUI sync guarantee
  - Codex CLI as the first validation client
  - minimum automated tests
- Update Phase 2 to include:
  - `import_font`
  - path geometry tools executed by Inkscape and wrapped as explicit MCP tools
  - optional MCP resources
  - a stronger Inkscape action allowlist
- Document the key exclusions from Phase 1:
  - MCP resources and prompts
  - HTTP transport
  - automatic Inkscape GUI synchronization
  - full Inkscape layer semantics
  - object lock/hidden state management
  - external image import
  - network assets or remote references
  - physical document deletion
  - image understanding or aesthetic analysis
- Document raw SVG behavior:
  - allow raw SVG/XML by default
  - reject dangerous content such as scripts, `foreignObject`, event attributes, external URLs, and unsafe file references
  - support `insert_svg_fragment` and `replace_document_svg`
  - require snapshots before full replacement
  - allow multiple top-level elements in fragments
  - reject full `<svg>` roots in fragments
  - reject id conflicts by default, with optional conflict renaming
  - require explicit canvas size for full document replacement
- Document runtime boundaries:
  - default workspace is `./workspace`, configurable through `INKSMCP_WORKSPACE`
  - Inkscape binary discovery prefers `INKSCAPE_BIN`
  - server may start without Inkscape, but Inkscape-dependent tools fail explicitly
  - Inkscape calls have configurable timeouts with a maximum cap
  - no default SVG, fragment, history, or preview size limits
  - same-document writes are serialized; different documents may run in parallel
- Preserve the existing English documentation style.

## Acceptance Criteria

- [x] `docs/inkscape-mcp-plan.md` contains a clear confirmed boundaries section.
- [x] Phase 1 and Phase 2 scope match the confirmed user decisions.
- [x] Tool surface and safety boundary sections reflect raw SVG support and history behavior.
- [x] The document no longer implies `eps` export is in Phase 1.
- [x] The document states path geometry is Phase 2 and Inkscape-executed.
- [x] Markdown renders cleanly and has no obvious duplicate/conflicting sections.

## Definition of Done

- Documentation updated.
- Trellis PRD created for the work.
- Relevant Trellis/spec guidance read before modifying files.
- Lightweight verification performed by inspecting the changed markdown.

## Out of Scope

- Implementing the MCP server.
- Adding package tooling or tests.
- Updating `.trellis/spec/` project guidelines unless this task reveals reusable project guidance.
- Creating commits.

## Technical Notes

- Current plan file: `docs/inkscape-mcp-plan.md`.
- Current README links to the plan and likely does not need changes.
- Backend spec index says all documentation should be written in English.
- Shared Trellis thinking guide requires searching before changing values; this task modifies planning text rather than code constants.
