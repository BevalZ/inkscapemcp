#!/usr/bin/env python3
"""Pull workspace SVG into Inkscape, or push current GUI SVG into InkSMCP."""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


CONFIG_FILENAME = "inksmcp-extension.json"
DOC_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
CONNECTION_ID_PATTERN = re.compile(r"^conn-[A-Za-z0-9_-]{8,80}$")
REQUEST_ID_PATTERN = re.compile(r"^pull-[A-Za-z0-9_.-]{8,96}$")
INKSMCP_MARKER_ID = "inksmcp-sync-metadata"
INKSMCP_MARKER_ATTR = "data-inksmcp-connection"


class ExtensionConfigError(ValueError):
    """Raised when the extension cannot resolve a safe workspace document."""


def extension_dir() -> Path:
    return Path(__file__).resolve().parent


def load_config(config_dir: Path | None = None) -> dict[str, Any]:
    config_path = (config_dir or extension_dir()) / CONFIG_FILENAME
    if not config_path.exists():
        return {}
    try:
        with config_path.open("r", encoding="utf-8") as handle:
            config = json.load(handle)
    except OSError as error:
        raise ExtensionConfigError(f"Could not read {config_path}: {error}") from error
    except json.JSONDecodeError as error:
        raise ExtensionConfigError(f"Invalid JSON in {config_path}: {error}") from error
    if not isinstance(config, dict):
        raise ExtensionConfigError(f"{config_path} must contain a JSON object.")
    return config


def resolve_workspace_root(explicit_root: str | None, config: dict[str, Any]) -> Path:
    raw_root = (explicit_root or "").strip() or os.environ.get("INKSMCP_WORKSPACE", "").strip()
    if not raw_root:
        configured = config.get("workspaceRoot")
        if isinstance(configured, str):
            raw_root = configured.strip()
    if not raw_root:
        raise ExtensionConfigError(
            "No workspace root configured. Run npm run install:inkscape-extension or enter Workspace root override."
        )
    return Path(raw_root).expanduser().resolve()


def assert_safe_doc_id(doc_id: str) -> str:
    if not DOC_ID_PATTERN.fullmatch(doc_id):
        raise ExtensionConfigError(
            "Document id must be 1-64 characters and contain only letters, numbers, underscores, or hyphens."
        )
    return doc_id


def infer_doc_id(workspace_root: Path, candidates: list[str | None]) -> str | None:
    drawings_dir = (workspace_root / "drawings").resolve()
    for candidate in candidates:
        if not candidate:
            continue
        try:
            candidate_path = Path(candidate).expanduser().resolve()
            relative = candidate_path.relative_to(drawings_dir)
        except (OSError, ValueError):
            continue
        if len(relative.parts) == 2 and relative.parts[1].lower() == "current.svg":
            doc_id = relative.parts[0]
            if DOC_ID_PATTERN.fullmatch(doc_id):
                return doc_id
    return None


def resolve_doc_id(
    explicit_doc_id: str | None,
    workspace_root: Path,
    config: dict[str, Any],
    document_path: str | None,
    input_file: str | None,
) -> tuple[str, str | None]:
    explicit = (explicit_doc_id or "").strip()
    inferred = infer_doc_id(workspace_root, [document_path, input_file])
    if explicit and inferred and explicit != inferred:
        raise ExtensionConfigError(
            f"Explicit document id '{explicit}' conflicts with inferred document id '{inferred}'."
        )
    doc_id = explicit or inferred or ""
    if not doc_id:
        configured_doc_id = config.get("activeDocId")
        if isinstance(configured_doc_id, str):
            doc_id = configured_doc_id.strip()
    if not doc_id:
        raise ExtensionConfigError("Enter Document id, or open an InkSMCP current.svg so it can be inferred.")
    return assert_safe_doc_id(doc_id), inferred


def resolve_current_svg_path(workspace_root: Path, doc_id: str) -> Path:
    safe_doc_id = assert_safe_doc_id(doc_id)
    current_svg = (workspace_root / "drawings" / safe_doc_id / "current.svg").resolve()
    try:
        current_svg.relative_to(workspace_root)
    except ValueError as error:
        raise ExtensionConfigError("Resolved current.svg path escapes the configured workspace.") from error
    if not current_svg.is_file():
        raise ExtensionConfigError(f"Workspace document was not found: {current_svg}")
    return current_svg


def resolve_gui_pull_paths(workspace_root: Path, request_id: str) -> tuple[Path, Path]:
    if not REQUEST_ID_PATTERN.fullmatch(request_id):
        raise ExtensionConfigError("Invalid GUI pull request id.")
    gui_pull_dir = (workspace_root / "gui-pull").resolve()
    try:
        gui_pull_dir.relative_to(workspace_root)
    except ValueError as error:
        raise ExtensionConfigError("Resolved gui-pull path escapes the configured workspace.") from error
    gui_pull_dir.mkdir(parents=True, exist_ok=True)
    return gui_pull_dir / f"{request_id}.svg", gui_pull_dir / f"{request_id}.json"


def require_connection_id(connection_id: str | None) -> str:
    value = (connection_id or "").strip()
    if not CONNECTION_ID_PATTERN.fullmatch(value):
        raise ExtensionConfigError("Invalid or missing InkSMCP connection id.")
    return value


def validate_svg_file(svg_path: Path) -> None:
    try:
        root = ElementTree.parse(svg_path).getroot()
    except ElementTree.ParseError as error:
        raise ExtensionConfigError(f"Workspace SVG is not well-formed XML: {error}") from error
    if root.tag.split("}", 1)[-1] != "svg":
        raise ExtensionConfigError("Workspace document must have an <svg> root.")


def ensure_connection_marker(
    root: Any,
    connection_id: str,
    doc_id: str,
    sync_mode: str,
    document_path: str | None,
    inferred_doc_id: str | None,
    runtime_document_id: str | None = None,
    window_id: str | None = None,
) -> None:
    marker = None
    for element in root.iter():
        if element.get("id") == INKSMCP_MARKER_ID:
            marker = element
            break
    payload = {
        "connectionId": connection_id,
        "docId": doc_id,
        "syncMode": sync_mode,
        "documentPath": document_path,
        "inferredDocId": inferred_doc_id,
        "runtimeDocumentId": runtime_document_id,
        "windowId": window_id,
        "updatedAt": iso_now(),
    }
    if marker is None:
        marker = root.makeelement("metadata", {}) if hasattr(root, "makeelement") else ElementTree.Element("metadata")
        root.insert(0, marker)
    marker.set("id", INKSMCP_MARKER_ID)
    marker.set(INKSMCP_MARKER_ATTR, json.dumps(payload, separators=(",", ":")))
    marker.text = ""


def validate_connection_marker(root: Any, connection_id: str, doc_id: str) -> None:
    for element in root.iter():
        if element.get("id") != INKSMCP_MARKER_ID:
            continue
        raw = element.get(INKSMCP_MARKER_ATTR)
        if not raw:
            break
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as error:
            raise ExtensionConfigError("InkSMCP connection marker is invalid JSON.") from error
        if payload.get("connectionId") != connection_id or payload.get("docId") != doc_id:
            raise ExtensionConfigError("InkSMCP connection marker does not match this connection.")
        return
    raise ExtensionConfigError("InkSMCP connection marker was not found in the current document.")


def sync_svg_tree(current_root: Any, target_root: Any) -> None:
    """Mutate the current SVG root to match the target root.

    Keeping the live root object avoids swapping the whole document object out from
    under the active Inkscape window. For ordinary MCP edits this preserves the
    existing GUI document object and updates attributes/text/children in place.
    """

    for attribute_name in list(current_root.attrib):
        if attribute_name not in target_root.attrib:
            del current_root.attrib[attribute_name]
    for attribute_name, attribute_value in target_root.attrib.items():
        current_root.set(attribute_name, attribute_value)

    current_root.text = target_root.text
    current_root.tail = target_root.tail

    current_children = list(current_root)
    target_children = list(target_root)
    if _can_sync_children_in_place(current_children, target_children):
        for current_child, target_child in zip(current_children, target_children):
            sync_svg_tree(current_child, target_child)
        return

    for child in current_children:
        current_root.remove(child)
    for child in target_children:
        current_root.append(deepcopy(child))


def _can_sync_children_in_place(current_children: list[Any], target_children: list[Any]) -> bool:
    if len(current_children) != len(target_children):
        return False
    for current_child, target_child in zip(current_children, target_children):
        if _element_signature(current_child) != _element_signature(target_child):
            return False
    return True


def _element_signature(element: Any) -> tuple[str, str | None]:
    return element.tag, element.get("id")


def resolve_requested_svg(
    explicit_doc_id: str | None,
    explicit_workspace_root: str | None,
    document_path: str | None,
    input_file: str | None,
    config_dir: Path | None = None,
) -> tuple[str, Path, Path]:
    config = load_config(config_dir)
    workspace_root = resolve_workspace_root(explicit_workspace_root, config)
    doc_id, _inferred_doc_id = resolve_doc_id(explicit_doc_id, workspace_root, config, document_path, input_file)
    current_svg = resolve_current_svg_path(workspace_root, doc_id)
    validate_svg_file(current_svg)
    return doc_id, workspace_root, current_svg


def resolve_push_request(
    explicit_doc_id: str | None,
    explicit_workspace_root: str | None,
    explicit_connection_id: str | None,
    explicit_request_id: str | None,
    document_path: str | None,
    input_file: str | None,
    config_dir: Path | None = None,
) -> tuple[str, str | None, Path, str, str, Path, Path]:
    config = load_config(config_dir)
    workspace_root = resolve_workspace_root(explicit_workspace_root, config)
    doc_id, inferred_doc_id = resolve_doc_id(explicit_doc_id, workspace_root, config, document_path, input_file)
    current_svg = resolve_current_svg_path(workspace_root, doc_id)
    validate_svg_file(current_svg)
    connection_id = require_connection_id(explicit_connection_id or config.get("connectionId"))
    request_id = (explicit_request_id or config.get("requestId") or "").strip()
    svg_path, manifest_path = resolve_gui_pull_paths(workspace_root, request_id)
    return doc_id, inferred_doc_id, workspace_root, connection_id, request_id, svg_path, manifest_path


def write_gui_pull_manifest(
    manifest_path: Path,
    request_id: str,
    connection_id: str,
    requested_doc_id: str,
    inferred_doc_id: str | None,
    document_path: str | None,
    svg_path: Path,
    runtime_document_id: str | None = None,
    window_id: str | None = None,
) -> None:
    manifest = {
        "requestId": request_id,
        "connectionId": connection_id,
        "requestedDocId": requested_doc_id,
        "inferredDocId": inferred_doc_id,
        "documentPath": document_path,
        "runtimeDocumentId": runtime_document_id,
        "windowId": window_id,
        "inkscapeVersion": os.environ.get("INKSCAPE_VERSION", ""),
        "exportedAt": iso_now(),
        "svgPath": str(svg_path),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def write_svg_tree(svg_path: Path, root: Any) -> None:
    if hasattr(root, "getroottree"):
        from lxml import etree as lxml_etree

        svg_path.write_bytes(lxml_etree.tostring(root.getroottree(), encoding="utf-8", xml_declaration=True))
        return
    ElementTree.ElementTree(root).write(svg_path, encoding="utf-8", xml_declaration=True)


def iso_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def run_self_test() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        workspace = root / "workspace"
        doc_dir = workspace / "drawings" / "fish-test"
        doc_dir.mkdir(parents=True)
        svg_path = doc_dir / "current.svg"
        svg_path.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', encoding="utf-8")
        config_dir = root / "extension"
        config_dir.mkdir()
        (config_dir / CONFIG_FILENAME).write_text(json.dumps({"workspaceRoot": str(workspace)}), encoding="utf-8")

        doc_id, workspace_root, current_svg = resolve_requested_svg(
            "",
            "",
            str(svg_path),
            None,
            config_dir,
        )
        assert doc_id == "fish-test"
        assert workspace_root == workspace.resolve()
        assert current_svg == svg_path.resolve()

        (config_dir / CONFIG_FILENAME).write_text(
            json.dumps({"workspaceRoot": str(workspace), "activeDocId": "fish-test"}),
            encoding="utf-8",
        )
        doc_id, workspace_root, current_svg = resolve_requested_svg("", "", None, None, config_dir)
        assert doc_id == "fish-test"
        assert workspace_root == workspace.resolve()
        assert current_svg == svg_path.resolve()

        try:
            resolve_requested_svg("../escape", str(workspace), None, None, config_dir)
        except ExtensionConfigError:
            pass
        else:
            raise AssertionError("unsafe doc id was accepted")

        current = ElementTree.fromstring(
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="fish"><path id="body" fill="#ff99aa" /></g></svg>'
        )
        target = ElementTree.fromstring(
            '<svg xmlns="http://www.w3.org/2000/svg"><g id="fish"><path id="body" fill="#00aa00" /></g></svg>'
        )
        sync_svg_tree(current, target)
        synced_path = current.find(".//{http://www.w3.org/2000/svg}path")
        assert synced_path is not None
        assert synced_path.get("fill") == "#00aa00"

        request_id = "pull-12345678"
        svg_pull, manifest_pull = resolve_gui_pull_paths(workspace, request_id)
        assert svg_pull == (workspace / "gui-pull" / f"{request_id}.svg").resolve()
        assert manifest_pull == (workspace / "gui-pull" / f"{request_id}.json").resolve()

        push_doc_id, push_inferred, _, connection_id, push_request_id, _, _ = resolve_push_request(
            "",
            str(workspace),
            "conn-abcdefgh",
            request_id,
            str(svg_path),
            None,
            config_dir,
        )
        assert push_doc_id == "fish-test"
        assert push_inferred == "fish-test"
        assert connection_id == "conn-abcdefgh"
        assert push_request_id == request_id

        marked = ElementTree.fromstring('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
        ensure_connection_marker(
            marked,
            "conn-abcdefgh",
            "fish-test",
            "bidirectional",
            str(svg_path),
            "fish-test",
            "runtime-1",
            "window-1",
        )
        validate_connection_marker(marked, "conn-abcdefgh", "fish-test")
        pushed_svg_path = workspace / "gui-pull" / "self-test-write.svg"
        write_svg_tree(pushed_svg_path, marked)
        assert ElementTree.parse(pushed_svg_path).getroot().get("width") == "10"

        try:
            validate_connection_marker(
                ElementTree.fromstring('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
                "conn-abcdefgh",
                "fish-test",
            )
        except ExtensionConfigError:
            pass
        else:
            raise AssertionError("missing connection marker was accepted")


def run_inkex_extension() -> None:
    import inkex
    from inkex.elements import load_svg

    class PullWorkspaceDocument(inkex.EffectExtension):
        def add_arguments(self, pars: Any) -> None:
            pars.add_argument("--tab")
            pars.add_argument("--action", default="pull")
            pars.add_argument("--doc_id", default="")
            pars.add_argument("--workspace_root", default="")
            pars.add_argument("--connection_id", default="")
            pars.add_argument("--request_id", default="")
            pars.add_argument("--sync_mode", default="display_only")
            pars.add_argument("--runtime_document_id", default="")
            pars.add_argument("--window_id", default="")

        def effect(self) -> None:
            document_path = os.environ.get("DOCUMENT_PATH")
            input_file = self.options.input_file if isinstance(self.options.input_file, str) else None
            if self.options.action == "push":
                config = load_config()
                runtime_document_id = (
                    self.options.runtime_document_id or config.get("runtimeDocumentId") or ""
                ).strip() or None
                window_id = (self.options.window_id or config.get("windowId") or "").strip() or None
                doc_id, inferred_doc_id, workspace_root, connection_id, request_id, svg_path, manifest_path = resolve_push_request(
                    self.options.doc_id,
                    self.options.workspace_root,
                    self.options.connection_id,
                    self.options.request_id,
                    document_path,
                    input_file,
                )
                root = self.document.getroot()
                validate_connection_marker(root, connection_id, doc_id)
                ensure_connection_marker(
                    root,
                    connection_id,
                    doc_id,
                    self.options.sync_mode,
                    document_path or input_file,
                    inferred_doc_id,
                    runtime_document_id,
                    window_id,
                )
                write_svg_tree(svg_path, root)
                write_gui_pull_manifest(
                    manifest_path,
                    request_id,
                    connection_id,
                    doc_id,
                    inferred_doc_id,
                    document_path or input_file,
                    svg_path,
                    runtime_document_id,
                    window_id,
                )
                self.svg = root
                inkex.errormsg(f"Pushed InkSMCP GUI state for '{doc_id}' to {workspace_root}")
                return

            doc_id, workspace_root, current_svg = resolve_requested_svg(
                self.options.doc_id,
                self.options.workspace_root,
                document_path,
                input_file,
            )
            with current_svg.open("rb") as handle:
                workspace_document = load_svg(handle)
            sync_svg_tree(self.document.getroot(), workspace_document.getroot())
            self.svg = self.document.getroot()
            inkex.errormsg(f"Pulled InkSMCP document '{doc_id}' from {workspace_root}")

    PullWorkspaceDocument().run()


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        run_self_test()
    else:
        try:
            run_inkex_extension()
        except ExtensionConfigError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
