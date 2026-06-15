# Type Safety

> Type safety conventions for future frontend code.

## Overview

No frontend TypeScript code exists today. If a frontend is added, use TypeScript and share or generate types from backend contracts where practical.

## Type Organization

- Component-local prop types stay near the component.
- Backend response/request types should live in a shared package or generated client if a frontend becomes real.
- Avoid redefining MCP tool result shapes independently in UI code.

Example:

```typescript
export type RenderPreviewResult = {
  ok: true;
  docId: string;
  previewPath: string;
  warnings?: Array<{ code: string; message: string }>;
};
```

## Validation

Runtime validation belongs at the boundary:

- backend validates tool inputs with Zod
- frontend validates form inputs before submit only for UX
- backend remains authoritative for safety and workspace checks

## Common Patterns

Use discriminated unions for async UI states and backend results:

```typescript
type ToolResult<T> =
  | { ok: true; data: T; warnings?: Warning[] }
  | { ok: false; error: ToolError };
```

## Forbidden Patterns

- No `any` for backend responses.
- No broad type assertions such as `as unknown as`.
- No stringly-typed status flags when a union is clearer.
- No frontend-only recreation of backend validation logic for security decisions.

