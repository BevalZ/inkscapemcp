#!/usr/bin/env python3
"""Pull an InkSMCP workspace SVG into the current Inkscape window."""

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


def validate_svg_file(svg_path: Path) -> None:
    try:
        root = ElementTree.parse(svg_path).getroot()
    except ElementTree.ParseError as error:
        raise ExtensionConfigError(f"Workspace SVG is not well-formed XML: {error}") from error
    if root.tag.split("}", 1)[-1] != "svg":
        raise ExtensionConfigError("Workspace document must have an <svg> root.")


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
    doc_id = (explicit_doc_id or "").strip()
    if not doc_id:
        doc_id = infer_doc_id(workspace_root, [document_path, input_file]) or ""
    if not doc_id:
        configured_doc_id = config.get("activeDocId")
        if isinstance(configured_doc_id, str):
            doc_id = configured_doc_id.strip()
    if not doc_id:
        raise ExtensionConfigError("Enter Document id, or open an InkSMCP current.svg so it can be inferred.")
    current_svg = resolve_current_svg_path(workspace_root, doc_id)
    validate_svg_file(current_svg)
    return doc_id, workspace_root, current_svg


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


def run_inkex_extension() -> None:
    import inkex
    from inkex.elements import load_svg

    class PullWorkspaceDocument(inkex.EffectExtension):
        def add_arguments(self, pars: Any) -> None:
            pars.add_argument("--tab")
            pars.add_argument("--doc_id", default="")
            pars.add_argument("--workspace_root", default="")

        def effect(self) -> None:
            doc_id, workspace_root, current_svg = resolve_requested_svg(
                self.options.doc_id,
                self.options.workspace_root,
                os.environ.get("DOCUMENT_PATH"),
                self.options.input_file if isinstance(self.options.input_file, str) else None,
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
