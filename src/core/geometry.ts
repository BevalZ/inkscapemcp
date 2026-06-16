import { InkMcpError } from "./errors.js";
import type { Element as XmlElement } from "@xmldom/xmldom";
import { assertSafeElementId, makeUniqueElementId } from "./ids.js";
import {
  collectElementIds,
  findElementById,
  parseSvgDocument,
  serializeSvg,
} from "./svg-document.js";
import { walkElements } from "./validation.js";

export type GeometryOperation =
  | "path_union"
  | "path_difference"
  | "path_intersection"
  | "path_exclusion"
  | "path_combine"
  | "path_break_apart"
  | "path_simplify"
  | "run_action";

export interface PreparedGeometry {
  selectedIds: string[];
  unaffectedIds: Set<string>;
  warnings: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
}

export function prepareGeometrySvg(
  svg: string,
  selectedIds: string[],
  options: { resultId?: string; autoConvertToPath?: boolean },
): PreparedGeometry {
  const document = parseSvgDocument(svg);
  const allIds = collectElementIds(document);
  const uniqueSelectedIds = [...new Set(selectedIds.map((id) => assertSafeElementId(id)))];

  for (const id of uniqueSelectedIds) {
    findElementById(document, id);
  }

  if (options.resultId) {
    assertSafeElementId(options.resultId);
    if (allIds.has(options.resultId) && !uniqueSelectedIds.includes(options.resultId)) {
      throw new InkMcpError("ID_CONFLICT", "resultId already exists in the document.", { resultId: options.resultId });
    }
  }

  const warnings: PreparedGeometry["warnings"] = [];
  if (options.autoConvertToPath !== false) {
    const textIds = uniqueSelectedIds.filter((id) => (findElementById(document, id).localName ?? "") === "text");
    if (textIds.length > 0) {
      warnings.push({
        code: "TEXT_CONVERTED_TO_PATH",
        message: "Selected text may no longer be editable after autoConvertToPath.",
        details: { elementIds: textIds },
      });
    }
  }

  const unaffectedIds = new Set([...allIds].filter((id) => !uniqueSelectedIds.includes(id)));
  return { selectedIds: uniqueSelectedIds, unaffectedIds, warnings };
}

export function finalizeGeometrySvg(
  svg: string,
  prepared: PreparedGeometry,
  options: { resultId?: string },
): { svg: string; resultIds: string[] } {
  const document = parseSvgDocument(svg);
  const root = document.documentElement;
  if (!root) {
    throw new InkMcpError("INVALID_INPUT", "Geometry result has no SVG root.");
  }
  const resultElements = walkElements(root).filter((element) => {
    if (element === root) return false;
    if (isNonDrawingElement(element)) return false;
    const id = element.getAttribute("id");
    return id ? !prepared.unaffectedIds.has(id) : element.localName !== "svg";
  });

  if (resultElements.length === 0) {
    throw new InkMcpError("INKSCAPE_FAILED", "Inkscape geometry did not produce a result element.");
  }

  const existingIds = collectElementIds(document);
  const resultIds: string[] = [];

  for (let index = 0; index < resultElements.length; index += 1) {
    const element = resultElements[index];
    const currentId = element.getAttribute("id");
    let nextId = currentId;

    if (options.resultId) {
      nextId = index === 0 ? options.resultId : makeUniqueElementId(`${options.resultId}-${index + 1}`, existingIds);
    } else if (!nextId) {
      nextId = makeUniqueElementId("path-result", existingIds);
    }

    if (nextId && nextId !== currentId) {
      element.setAttribute("id", assertSafeElementId(nextId));
    }
    resultIds.push(element.getAttribute("id") ?? nextId);
  }

  return { svg: serializeSvg(document), resultIds };
}

function isNonDrawingElement(element: XmlElement): boolean {
  const name = (element.localName ?? element.nodeName).toLowerCase();
  return ["defs", "namedview", "metadata", "title", "desc"].includes(name);
}
