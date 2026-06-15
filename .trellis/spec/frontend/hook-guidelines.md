# Hook Guidelines

> React hook conventions if a frontend is introduced later.

## Overview

No hooks exist today. Future hooks should be UI coordination helpers only. The backend workspace and MCP tools remain the source of truth.

## Custom Hook Patterns

Hooks should wrap one concern:

```typescript
export function usePreviewStatus(docId: string) {
  // Track UI polling or subscription state for one document preview.
}
```

Do not combine document mutation, rendering, and export into one large hook.

## Data Fetching

No frontend data-fetching library has been selected. If a web UI is added, choose and document a single approach before implementation.

Rules for any approach:

- Treat backend responses as authoritative.
- Do not derive document state from stale preview images.
- Do not cache raw SVG after a failed safety check.

## Naming Conventions

- Hook names must start with `use`.
- Hook files should match exported hook names: `usePreviewStatus.ts`.
- Hooks that call backend APIs should include the domain noun: `useDocumentHistory`, not `useData`.

## Common Mistakes

- Mirroring the whole SVG document into React global state.
- Using hooks to bypass backend workspace validation.
- Hiding backend errors behind generic UI failure states.

