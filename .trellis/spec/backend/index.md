# Backend Development Guidelines

> Project-specific backend guidelines for the Inkscape MCP server.

## Overview

The backend is planned as a local, single-user TypeScript MCP server over stdio. The server manages SVG documents inside a workspace and uses Inkscape CLI for rendering, export, query, and optional GUI opening.

Primary product plan: `docs/inkscape-mcp-plan.md`.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Database Guidelines](./database-guidelines.md) | Filesystem persistence and no-database boundary | Filled |
| [Error Handling](./error-handling.md) | Error types, failure semantics, MCP responses | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns, tests | Filled |
| [Logging Guidelines](./logging-guidelines.md) | Operation logs, log levels, sensitive data rules | Filled |
| [Roadmap Memory](./roadmap-memory.md) | Three-phase advanced InkSMCP roadmap and durable planning contracts | Filled |

## Pre-Development Checklist

Before backend implementation:

1. Read `docs/inkscape-mcp-plan.md`.
2. Read [Directory Structure](./directory-structure.md).
3. Read [Error Handling](./error-handling.md).
4. Read [Quality Guidelines](./quality-guidelines.md).
5. Read [Logging Guidelines](./logging-guidelines.md).
6. Read [Database Guidelines](./database-guidelines.md) before adding persistence or metadata.
7. Read [Roadmap Memory](./roadmap-memory.md) before planning major sync, Inkscape workflow, or vectorization expansion.

## Quality Check

Before completing backend work:

1. Confirm no tool writes outside the configured workspace.
2. Confirm every write operation snapshots first.
3. Confirm raw SVG is parsed and safety-filtered before save.
4. Confirm Inkscape-dependent tools fail explicitly when Inkscape is unavailable.
5. Confirm tests cover any changed validation, workspace, history, or Inkscape adapter behavior.

**Language**: All documentation should be written in English.
