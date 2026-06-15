# Database Guidelines

> Persistence conventions for this project.

## Current Decision

The MVP has no database, ORM, migration system, or server-side multi-user storage. Persistence is filesystem-based under the configured workspace.

Source of truth:

- `workspace/drawings/{docId}/current.svg`
- `workspace/drawings/{docId}/history/`
- `workspace/drawings/{docId}/operations.log`
- `workspace/archive/`
- optional `workspace/fonts/` in Phase 2

## File Persistence Rules

- Default workspace is `./workspace`.
- `INKSMCP_WORKSPACE` may override the workspace.
- Every resolved path must stay inside the configured workspace.
- External SVG files must be imported into the workspace before editing.
- The server edits workspace copies, not original external files.
- Every write creates a full snapshot before changing `current.svg`.
- Same-document writes are serialized.
- Different documents may run in parallel.

## Metadata

If metadata is needed, store it beside the document as JSON, not in a database:

```text
workspace/drawings/{docId}/metadata.json
```

Example shape:

```json
{
  "docId": "logo-draft",
  "title": "Logo draft",
  "createdAt": "2026-06-16T00:00:00.000Z",
  "updatedAt": "2026-06-16T00:01:00.000Z",
  "archived": false
}
```

## Atomic Write Pattern

Write to a temporary file, validate it, then replace the target file.

```typescript
await writeFile(tempPath, svgText, "utf8");
await validateSvgFile(tempPath);
await rename(tempPath, currentSvgPath);
```

Do not partially mutate `current.svg` in place.

## Migrations

There are no migrations in the MVP. If workspace metadata changes later, add an explicit workspace version field and a migration command in a separate PRD.

## Common Mistakes

- Do not introduce SQLite/Postgres just to track local SVG files.
- Do not store complete raw SVG payloads in operation logs; history snapshots already hold the full content.
- Do not physically delete documents in the MVP; archive them.

