# Logging Guidelines

> Logging conventions for local MCP operations.

## Overview

The MVP uses lightweight operation logs, not centralized logging. Logs are for local debugging and auditability after AI-driven edits.

Each document may write to:

```text
workspace/drawings/{docId}/operations.log
```

## Log Levels

- `debug`: optional development details; disabled by default.
- `info`: successful lifecycle events such as document creation, export, preview render.
- `warn`: recoverable issues such as preview failure after SVG save.
- `error`: failed operations such as unsafe SVG, path violation, Inkscape timeout.

## Structured Log Format

Write one JSON object per line.

```json
{
  "timestamp": "2026-06-16T00:00:00.000Z",
  "level": "info",
  "docId": "logo-draft",
  "toolName": "insert_svg_fragment",
  "inputSummary": {
    "parentId": "root",
    "fragmentBytes": 512
  },
  "snapshotPath": "workspace/drawings/logo-draft/history/20260616-000000.svg",
  "status": "ok",
  "previewPath": "workspace/drawings/logo-draft/preview.png"
}
```

## What To Log

- tool name
- timestamp
- `docId`
- input summary, not full input
- snapshot path for write operations
- result status
- preview/export path when available
- Inkscape binary path chosen at startup
- timeout and exit code for Inkscape failures

## What Not To Log

- full raw SVG payloads
- full PNG/image payloads
- remote URLs, because remote references are forbidden and should be rejected
- environment variables other than known non-secret config keys
- arbitrary local filesystem paths outside the workspace

## Common Mistakes

- Do not duplicate history snapshots inside logs.
- Do not log child-process command strings built from untrusted input.
- Do not rely on logs as the source of truth; `current.svg` and `history/` are authoritative.

