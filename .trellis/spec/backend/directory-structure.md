# Directory Structure

> Backend organization for the Inkscape MCP server.

## Current Project Shape

This repository is still in planning/scaffolding state. There is no runtime source tree yet. The authoritative implementation plan is `docs/inkscape-mcp-plan.md`.

The backend will be a local, single-user TypeScript MCP server. It should expose stdio MCP tools, manage workspace SVG documents, and call Inkscape through a CLI adapter.

## Planned Directory Layout

Use this layout when implementation starts:

```text
src/
  server.ts
  tools/
    document.ts
    elements.ts
    preview.ts
    export.ts
    history.ts
    archive.ts
  core/
    svg-document.ts
    svg-ops.ts
    validation.ts
    ids.ts
    errors.ts
  adapters/
    inkscape-cli.ts
    workspace.ts
  logging/
    operation-log.ts
tests/
  svg-ops.test.ts
  inkscape-cli.integration.test.ts
workspace/
  drawings/
  archive/
  fonts/
```

Keep MCP tool registration thin. Tool files should validate inputs, call core services, and format MCP responses. SVG mutation, safety filtering, history, and workspace path checks belong under `core/` and `adapters/`, not inline inside `server.ts`.

## Module Responsibilities

- `server.ts`: starts stdio MCP transport and registers tools.
- `tools/*`: one file per user-facing tool area.
- `core/svg-document.ts`: load, parse, serialize, and validate SVG documents.
- `core/svg-ops.ts`: controlled element operations and atomic batches.
- `core/validation.ts`: Zod schemas and SVG safety filters.
- `core/ids.ts`: safe `docId` and element id generation.
- `core/errors.ts`: typed errors used by tools and adapters.
- `adapters/inkscape-cli.ts`: binary discovery, timeout handling, export/query/open calls.
- `adapters/workspace.ts`: workspace path resolution, snapshot paths, archive paths.
- `logging/operation-log.ts`: lightweight per-document operation logs.

## Naming Conventions

- Use kebab-case file names for modules: `svg-document.ts`, `inkscape-cli.ts`.
- Use camelCase for functions and variables.
- Use PascalCase for classes and exported TypeScript types.
- Tool names must match the documented MCP tool names: `create_document`, `insert_svg_fragment`, `render_preview`.
- `docId` is a path-safe identifier; user-facing display names belong in `title`.

## Examples

Good module boundary:

```typescript
// tools/preview.ts
export async function renderPreview(input: RenderPreviewInput, ctx: ToolContext) {
  const doc = await ctx.workspace.readDocument(input.docId);
  const preview = await ctx.inkscape.renderPng(doc.currentSvgPath, input);
  return formatPreviewResult(preview);
}
```

Wrong boundary:

```typescript
// server.ts
// Avoid parsing SVG, resolving workspace paths, spawning Inkscape, and formatting
// MCP output in one large tool callback.
```

## Common Mistakes

- Do not put business logic directly in MCP registration callbacks.
- Do not let tools resolve arbitrary filesystem paths.
- Do not add a frontend or HTTP server to satisfy the Phase 1 stdio MCP scope.
- Do not create cross-document utilities until a PRD explicitly requires cross-document behavior.

