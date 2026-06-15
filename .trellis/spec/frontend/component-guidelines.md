# Component Guidelines

> Component conventions if a frontend is introduced later.

## Overview

There are no current components. A future frontend must support the MCP workflow rather than replace it. It should be quiet, utilitarian, and focused on document inspection, preview, and export status.

## Component Structure

Use small, typed components with explicit props:

```tsx
type PreviewPanelProps = {
  previewPath: string;
  status: "idle" | "rendering" | "ready" | "failed";
  onOpenInInkscape: () => void;
};

export function PreviewPanel(props: PreviewPanelProps) {
  // Render state from props; do not fetch document state here.
}
```

## Props Conventions

- Define props with `type`, close to the component.
- Keep backend result shapes in shared types, not duplicated inline.
- Avoid passing raw SVG strings through broad component trees.
- Prefer explicit callbacks such as `onRenderPreview`, not generic `onAction`.

## Styling Patterns

No styling system has been selected. If a frontend PRD selects one, document it here before implementation.

Until then:

- Do not add a CSS framework speculatively.
- Do not create marketing/landing-page UI.
- Keep operational UIs compact and scan-friendly.

## Accessibility

- Buttons must have visible labels or accessible names.
- Icon-only controls need tooltips and `aria-label`.
- Preview status changes should be communicated in text, not color only.
- Keyboard navigation must reach document actions and export controls.

## Common Mistakes

- Creating a frontend to compensate for unfinished MCP tools.
- Storing document truth in component state instead of the backend workspace.
- Rendering raw SVG from unfiltered content.
- Adding decorative UI that makes document inspection harder.

