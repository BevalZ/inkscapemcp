# Quality Guidelines

> Frontend quality standards if a frontend is introduced later.

## Overview

There is no frontend in the MVP. Any frontend work must be justified by a PRD and must preserve the MCP server as the primary workflow.

## Forbidden Patterns

- No frontend work without an explicit PRD requirement.
- No marketing landing page for this tool unless requested.
- No UI-only document mutations that bypass backend validation.
- No raw remote SVG/image/font references.
- No hidden implicit selection state that changes backend edit targets.

## Required Patterns

- Use TypeScript.
- Represent async states explicitly.
- Surface backend error codes and messages.
- Keep SVG source of truth in the backend workspace.
- Add accessible labels for icon-only buttons.
- Use stable dimensions for preview panes and toolbars.

## Testing Requirements

If a frontend is added:

- unit test state reducers or hooks that encode non-trivial logic
- component test core document actions
- verify keyboard access for toolbars and dialogs
- verify long file paths and error messages do not break layout

## Code Review Checklist

- Does the PRD require this UI?
- Does the UI call backend tools instead of duplicating backend logic?
- Are backend errors visible and actionable?
- Are interactive controls keyboard-accessible?
- Are preview and export paths displayed or available for debugging?

## Common Mistakes

- Building a UI before the MCP tools are usable.
- Treating frontend state as authoritative document state.
- Adding visual polish that hides operational status or errors.

