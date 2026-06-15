# Error Handling

> Error contracts for MCP tools and Inkscape integration.

## Overview

Errors must be explicit, recoverable, and tied to the operation that failed. A tool should not silently repair ambiguous input or hide failures behind a successful response.

The MVP has two broad failure classes:

- Validation and write failures: do not replace `current.svg`.
- Inkscape render/export failures after a valid save: keep the SVG and return a warning.

## Error Types

Use typed errors internally:

```typescript
export type ErrorCode =
  | "INVALID_INPUT"
  | "UNSAFE_SVG"
  | "PATH_OUTSIDE_WORKSPACE"
  | "DOC_NOT_FOUND"
  | "ID_CONFLICT"
  | "INKSCAPE_UNAVAILABLE"
  | "INKSCAPE_TIMEOUT"
  | "INKSCAPE_FAILED"
  | "WRITE_FAILED";

export class InkMcpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
```

## Tool Response Pattern

Tool responses should include a clear status and machine-readable error information.

```json
{
  "ok": false,
  "error": {
    "code": "UNSAFE_SVG",
    "message": "SVG contains a forbidden script element.",
    "details": {
      "element": "script"
    }
  }
}
```

Warnings are allowed only when the main document change succeeded:

```json
{
  "ok": true,
  "warnings": [
    {
      "code": "INKSCAPE_FAILED",
      "message": "SVG was saved, but preview rendering failed."
    }
  ]
}
```

## Failure Matrix

| Condition | Result |
|---|---|
| XML parse fails | Do not replace `current.svg`; return `INVALID_INPUT`. |
| SVG root is missing for full replacement | Do not replace `current.svg`; return `INVALID_INPUT`. |
| Dangerous SVG content is found | Do not replace `current.svg`; return `UNSAFE_SVG`. |
| Path resolves outside workspace | Do not access the path; return `PATH_OUTSIDE_WORKSPACE`. |
| Raw fragment id conflicts | Do not apply by default; return `ID_CONFLICT`. |
| Inkscape binary is missing | Tool fails with `INKSCAPE_UNAVAILABLE`. |
| Inkscape call exceeds timeout | Terminate the child process; return `INKSCAPE_TIMEOUT`. |
| Preview render fails after valid save | Keep SVG; return warning and error metadata. |

## Common Mistakes

- Do not catch an error and return a successful MCP result.
- Do not convert all errors to generic strings.
- Do not use Inkscape failure as a reason to delete a valid saved SVG automatically.
- Do not let raw child-process stderr leak sensitive local paths beyond the relevant tool result.

