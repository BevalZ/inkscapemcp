# Frontend Development Guidelines

> Project-specific frontend guidelines.

## Overview

There is no frontend application in the current project scope. The confirmed MVP is a local stdio MCP server validated first through Codex CLI. Do not add a web UI, React app, landing page, or browser client unless a future PRD explicitly asks for one.

These files exist because Trellis was initialized as a fullstack project. They document the current no-frontend boundary and the minimum conventions to use if a frontend is later approved.

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | No frontend directory currently; future placement rules | Filled |
| [Component Guidelines](./component-guidelines.md) | Component rules if a UI is introduced later | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Hook rules if React is introduced later | Filled |
| [State Management](./state-management.md) | State boundaries for a future UI | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Frontend quality gate and accessibility rules | Filled |
| [Type Safety](./type-safety.md) | Type and validation rules for future frontend code | Filled |

## Pre-Development Checklist

Before frontend work:

1. Confirm the active PRD explicitly requires a frontend.
2. Read `docs/inkscape-mcp-plan.md` to avoid conflicting with the stdio-first MVP.
3. Read [Directory Structure](./directory-structure.md).
4. Read [Component Guidelines](./component-guidelines.md).
5. Read [State Management](./state-management.md) and [Type Safety](./type-safety.md).
6. Read [Quality Guidelines](./quality-guidelines.md).

## Quality Check

Before completing frontend work:

1. Confirm the frontend was requested by PRD.
2. Confirm it does not replace or obscure the MCP tool workflow.
3. Confirm accessibility basics for every interactive element.
4. Confirm generated previews or file paths reflect backend results, not duplicated frontend state.

**Language**: All documentation should be written in English.

