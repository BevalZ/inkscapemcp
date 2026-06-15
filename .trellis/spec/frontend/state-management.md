# State Management

> State boundaries for a future frontend.

## Overview

No frontend state layer exists. If a frontend is added later, it must not become the source of truth for SVG documents. The backend workspace owns documents, history, previews, exports, and operation logs.

## State Categories

- Local UI state: selected tab, modal open state, temporary form fields.
- Server state: document metadata, preview paths, export results, history list.
- Derived state: UI-only summaries such as "has warnings".
- Forbidden frontend state: authoritative raw SVG, history snapshots, workspace paths outside returned metadata.

## When To Use Global State

Avoid global state until a frontend PRD proves it is needed. Prefer local component state and data-fetching cache first.

Global state may be justified for:

- active document id
- theme or density preference
- user-visible connection status

It is not justified for duplicating backend document content.

## Server State

Server state should come from backend responses. If a request fails, show the backend error code and message instead of guessing recovery behavior.

Example status model:

```typescript
type PreviewState =
  | { status: "idle" }
  | { status: "rendering"; docId: string }
  | { status: "ready"; docId: string; previewPath: string }
  | { status: "failed"; docId: string; errorCode: string; message: string };
```

## Common Mistakes

- Treating a displayed PNG as proof that SVG state is current.
- Allowing UI state to select implicit edit targets; backend tools require explicit ids.
- Keeping unsaved raw SVG in global state without backend validation.

