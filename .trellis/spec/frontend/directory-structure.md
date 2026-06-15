# Directory Structure

> Frontend organization for a future UI.

## Current Project Shape

No frontend code exists. The MVP is a stdio MCP server; do not create frontend directories during Phase 1.

## If A Frontend Is Approved Later

Use a separate top-level app directory so the MCP server remains clear:

```text
apps/
  web/
    src/
      components/
      features/
      hooks/
      lib/
      styles/
```

Do not put React components under backend `src/tools` or `src/core`.

## Module Organization

- `components/`: reusable UI primitives.
- `features/`: domain workflows such as document browser or preview panel.
- `hooks/`: React hooks that coordinate UI state.
- `lib/`: frontend-only utilities and API clients.
- `styles/`: global CSS or design tokens if the chosen framework uses them.

## Naming Conventions

- Component files use PascalCase: `PreviewPanel.tsx`.
- Hook files use camelCase with `use` prefix: `useDocumentPreview.ts`.
- Feature folders use kebab-case: `document-browser/`.

## Examples

Current correct behavior:

```text
No apps/web directory exists because no PRD asks for a frontend.
```

Wrong behavior:

```text
src/components/PreviewPanel.tsx
```

This would mix frontend code into the backend MCP server tree.

