# Inkscape Companion Extension Refresh

## Sources

- Inkscape INX overview: https://inkscape.gitlab.io/extensions/documentation/authors/inx-overview.html
- Inkscape interpreter documentation: https://inkscape.gitlab.io/extensions/documentation/authors/interpreters.html
- Local Inkscape 1.4.3 examples:
  - `D:\Software\Scoop\apps\inkscape\current\share\inkscape\extensions\color_custom.inx`
  - `D:\Software\Scoop\apps\inkscape\current\share\inkscape\extensions\color_custom.py`
  - `D:\Software\Scoop\apps\inkscape\current\share\inkscape\extensions\inkex\extensions.py`

## Findings

- A normal Inkscape effect extension is declared by an `.inx` file and implemented by a script referenced with `<command location="inx" interpreter="python">...`.
- `inkex.EffectExtension` receives the current document from Inkscape, mutates or replaces the in-memory SVG, then writes SVG back to Inkscape. This applies the result to the current window instead of opening another process window.
- The extension should be pull-based: Inkscape invokes `MCP > Pull Workspace Document`, reads `workspace/drawings/<docId>/current.svg`, and returns that SVG to the current window.
- Inkscape registers installed effect extensions as actions. On this machine, the installed action appears in `--action-list` as `dev.hydens.inksmcp.pull-workspace-document` and `dev.hydens.inksmcp.pull-workspace-document.noprefs`.
- Direct `--active-window --actions=dev.hydens.inksmcp.pull-workspace-document.noprefs` does not expose the extension action in the active window.
- MCP can invoke the no-prefs action through `--actions=active-window-start;dev.hydens.inksmcp.pull-workspace-document.noprefs;active-window-end` after successful writes. This avoids the unstable external `inkscape --active-window --actions=file-rebase` path that crashed Inkscape 1.4.3 on Windows.
- During action-chain invocation, Inkscape may not provide a useful current document path to the extension. The MCP adapter writes `activeDocId` to `inksmcp-extension.json` before triggering the action; the extension falls back to that field.
- Already-open Inkscape windows do not necessarily know about newly installed extension actions. Restart Inkscape once after installation.

## Design Decision

Build a lightweight companion extension:

- no background service
- no DBus and no unstable `file-rebase` automation
- no direct writes back into the MCP workspace
- workspace root comes from an explicit GUI parameter, `INKSMCP_WORKSPACE`, or an installer-written config file
- `docId` comes from an explicit GUI parameter or is inferred when the current Inkscape document path is already `workspace/drawings/<docId>/current.svg`
- MCP write tools trigger the extension action automatically by default; manual menu use remains a diagnostic fallback

The MCP server remains the source of truth; the extension is the same-window refresh mechanism used by automatic MCP refresh.
