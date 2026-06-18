import * as z from "zod/v4";
import { DOMParser } from "@xmldom/xmldom";
import type { Document as XmlDocument, Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { assertSafeDocId } from "./ids.js";

export const supportedElementTypes = [
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "g",
] as const;

export const docIdSchema = z.string().refine((value) => {
  try {
    assertSafeDocId(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid docId");

export const attributeValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const attributesSchema = z.record(z.string(), attributeValueSchema).default({});
const elementIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/);

export const createDocumentSchema = z.object({
  docId: docIdSchema.optional(),
  title: z.string().min(1).max(200).optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.string().min(1).max(12).default("px"),
  background: z.string().optional(),
});

const syncModeSchema = z.enum(["display_only", "bidirectional"]);
const connectionIdSchema = z.string().regex(/^conn-[A-Za-z0-9_-]{8,80}$/);

export const connectInkscapeWindowSchema = z.object({
  docId: docIdSchema,
  syncMode: syncModeSchema.default("display_only"),
  connectionId: connectionIdSchema.optional(),
  documentPath: z.string().min(1).optional(),
  inferredDocId: docIdSchema.optional(),
  runtimeDocumentId: z.string().min(1).max(200).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const disconnectInkscapeWindowSchema = z.object({
  docId: docIdSchema.optional(),
  connectionId: connectionIdSchema.optional(),
}).refine((input) => input.docId !== undefined || input.connectionId !== undefined, "Provide docId or connectionId");

export const pullGuiStateSchema = z.object({
  docId: docIdSchema,
  connectionId: connectionIdSchema.optional(),
  conflictPolicy: z.enum(["reject", "prefer_gui", "prefer_workspace"]).default("reject"),
  timeoutMs: z.number().int().positive().optional(),
});

export const addElementSchema = z.object({
  docId: docIdSchema,
  type: z.enum(supportedElementTypes),
  attributes: attributesSchema,
  text: z.string().optional(),
  parentId: z.string().optional(),
});

export const updateElementSchema = z.object({
  docId: docIdSchema,
  elementId: z.string().min(1),
  setAttributes: attributesSchema,
  removeAttributes: z.array(z.string()).default([]),
  text: z.string().optional(),
});

export const nudgePathElementSchema = z.object({
  docId: docIdSchema,
  elementId: elementIdSchema,
  dx: z.number().optional(),
  dy: z.number().optional(),
  dxMode: z.enum(["half_width_left", "half_width_right"]).optional(),
  responseMode: z.enum(["full", "compact"]).default("compact"),
});

const pathSegmentSchema = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("M"), x: z.number().finite(), y: z.number().finite() }),
  z.object({ cmd: z.literal("L"), x: z.number().finite(), y: z.number().finite() }),
  z.object({
    cmd: z.literal("C"),
    x1: z.number().finite(),
    y1: z.number().finite(),
    x2: z.number().finite(),
    y2: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    cmd: z.literal("Q"),
    x1: z.number().finite(),
    y1: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({ cmd: z.literal("Z") }),
]);

const pathDataSourceSchema = {
  d: z.string().min(1).optional(),
  segments: z.array(pathSegmentSchema).min(1).optional(),
};

function exactlyOnePathDataSource(input: { d?: string; segments?: unknown[] }) {
  return (input.d === undefined) !== (input.segments === undefined);
}

export const drawPathSchema = z.object({
  docId: docIdSchema,
  parentId: elementIdSchema.optional(),
  elementId: elementIdSchema.optional(),
  attributes: attributesSchema,
  ...pathDataSourceSchema,
}).refine(exactlyOnePathDataSource, "Provide exactly one path source: d or segments");

export const replacePathDataSchema = z.object({
  docId: docIdSchema,
  elementId: elementIdSchema,
  ...pathDataSourceSchema,
}).refine(exactlyOnePathDataSource, "Provide exactly one path source: d or segments");

export const appendPathSegmentSchema = z.object({
  docId: docIdSchema,
  elementId: elementIdSchema,
  ...pathDataSourceSchema,
}).refine(exactlyOnePathDataSource, "Provide exactly one path source: d or segments");

const pathNodeEditSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("move_point"),
    segmentIndex: z.number().int().nonnegative(),
    point: z.enum(["end", "c1", "c2"]),
    dx: z.number().finite().default(0),
    dy: z.number().finite().default(0),
  }),
  z.object({
    type: z.literal("insert_segment"),
    index: z.number().int().nonnegative(),
    segment: pathSegmentSchema,
  }),
  z.object({
    type: z.literal("delete_segment"),
    segmentIndex: z.number().int().nonnegative(),
  }),
]);

export const editPathNodesSchema = z.object({
  docId: docIdSchema,
  elementId: elementIdSchema,
  edits: z.array(pathNodeEditSchema).min(1),
});

export const queryPathNodesSchema = z.object({
  docId: docIdSchema,
  elementId: elementIdSchema,
  skipPrePull: z.boolean().default(false),
  allowStaleRead: z.boolean().default(false),
});

export const deleteElementSchema = z.object({
  docId: docIdSchema,
  elementId: z.string().min(1),
});

export const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    elementType: z.enum(supportedElementTypes),
    attributes: attributesSchema,
    text: z.string().optional(),
    parentId: z.string().optional(),
  }),
  z.object({
    type: z.literal("update"),
    elementId: z.string().min(1),
    setAttributes: attributesSchema,
    removeAttributes: z.array(z.string()).default([]),
    text: z.string().optional(),
  }),
  z.object({
    type: z.literal("delete"),
    elementId: z.string().min(1),
  }),
]);

export const applySvgOperationsSchema = z.object({
  docId: docIdSchema,
  operations: z.array(operationSchema).min(1),
});

export const insertSvgFragmentSchema = z.object({
  docId: docIdSchema,
  parentId: z.string().optional(),
  fragment: z.string().min(1),
  renameConflictingIds: z.boolean().default(false),
});

export const replaceDocumentSvgSchema = z.object({
  docId: docIdSchema,
  svg: z.string().min(1),
  confirmFullDocumentReplacement: z.boolean().default(false),
});

const editableAttributeNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/)
  .refine((value) => value !== "id", "id cannot be changed by value replacement");

export const replaceAttributeValuesSchema = z.object({
  docId: docIdSchema,
  replacements: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string(),
        attributeNames: z.array(editableAttributeNameSchema).min(1).optional(),
        styleProperties: z.array(editableAttributeNameSchema).min(1).optional(),
      }),
    )
    .min(1),
  scopeElementIds: z.array(elementIdSchema).min(1).optional(),
});

export const queryDocumentSchema = z.object({
  docId: docIdSchema,
  elementId: z.string().optional(),
  skipPrePull: z.boolean().default(false),
  allowStaleRead: z.boolean().default(false),
});

export const renderPreviewSchema = z.object({
  docId: docIdSchema,
  width: z.number().positive().optional(),
  dpi: z.number().positive().optional(),
  background: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  skipPrePull: z.boolean().default(false),
});

export const exportDocumentSchema = z.object({
  docId: docIdSchema,
  format: z.enum(["svg", "png", "pdf"]),
  filename: z.string().min(1).max(120).optional(),
  width: z.number().positive().optional(),
  dpi: z.number().positive().optional(),
  textToPath: z.boolean().default(false),
  timeoutMs: z.number().int().positive().optional(),
  skipPrePull: z.boolean().default(false),
  includeInkMcpMetadata: z.boolean().default(false),
});

export const openInInkscapeSchema = z.object({
  docId: docIdSchema,
});

export const refreshInInkscapeSchema = z.object({
  docId: docIdSchema,
  allowUnstableRebase: z.boolean().default(false),
  useCompanionExtension: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
});

export const listHistorySchema = z.object({
  docId: docIdSchema,
});

export const rollbackDocumentSchema = z.object({
  docId: docIdSchema,
  snapshotId: z.string().min(1),
  confirmDiscardGuiState: z.boolean().default(false),
});

export const archiveDocumentSchema = z.object({
  docId: docIdSchema,
});

export const importFontSchema = z.object({
  sourcePath: z.string().min(1),
  filename: z.string().min(1).max(120).optional(),
});

export const pathGeometryBaseSchema = z.object({
  docId: docIdSchema,
  elementIds: z.array(elementIdSchema).min(1),
  resultId: elementIdSchema.optional(),
  autoConvertToPath: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
});

export const pathGeometryMultiSchema = pathGeometryBaseSchema.extend({
  elementIds: z.array(elementIdSchema).min(2),
});

export const pathDifferenceSchema = z.object({
  docId: docIdSchema,
  baseId: elementIdSchema,
  cutterIds: z.array(elementIdSchema).min(1),
  resultId: elementIdSchema.optional(),
  autoConvertToPath: z.boolean().default(true),
  timeoutMs: z.number().int().positive().optional(),
});

export const pathSimplifySchema = pathGeometryBaseSchema;

export const runActionSchema = z.object({
  docId: docIdSchema,
  action: z.enum(["object_to_path", "selection_group", "selection_ungroup", "path_simplify"]),
  elementIds: z.array(elementIdSchema).min(1),
  resultId: elementIdSchema.optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export type SvgDocument = XmlDocument;
export type SvgElement = XmlElement;

export function parseXml(xml: string): XmlDocument {
  const parser = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") {
        throw new InkMcpError("INVALID_INPUT", "XML parse failed.", { message });
      }
    },
  });

  const document = parser.parseFromString(xml, "image/svg+xml");
  const parseError = Array.from(document.getElementsByTagName("parsererror"))[0];
  if (parseError) {
    throw new InkMcpError("INVALID_INPUT", "XML parse failed.", {
      message: parseError.textContent ?? "Unknown parser error",
    });
  }
  return document;
}

export function parseFullSvg(svg: string): XmlDocument {
  const document = parseXml(svg);
  const root = document.documentElement;
  if (!root || root.localName !== "svg") {
    throw new InkMcpError("INVALID_INPUT", "Full document replacement requires an <svg> root.");
  }
  if (!root.getAttribute("viewBox") && !(root.getAttribute("width") && root.getAttribute("height"))) {
    throw new InkMcpError(
      "INVALID_INPUT",
      "Full document replacement requires viewBox or both width and height.",
    );
  }
  validateSafeSvgNode(root);
  return document;
}

export function parseSvgFragment(fragment: string): XmlDocument {
  const document = parseXml(`<svg xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`);
  const root = document.documentElement;
  if (!root) {
    throw new InkMcpError("INVALID_INPUT", "SVG fragment parsing produced no root element.");
  }
  for (const child of elementChildren(root)) {
    if (child.localName === "svg") {
      throw new InkMcpError("INVALID_INPUT", "SVG fragments must not include a complete <svg> root.");
    }
  }
  validateSafeSvgNode(root);
  return document;
}

export function validateSafeSvgNode(node: XmlElement): void {
  for (const element of walkElements(node)) {
    const tag = (element.localName ?? element.nodeName).toLowerCase();
    if (tag === "script" || tag === "foreignobject") {
      throw new InkMcpError("UNSAFE_SVG", `SVG contains forbidden <${tag}> content.`, { element: tag });
    }

    for (let index = 0; index < element.attributes.length; index += 1) {
      const attr = element.attributes.item(index);
      if (!attr) continue;
      validateSafeAttribute(attr.name, attr.value);
    }
  }
}

export function validateSafeAttribute(name: string, value: string): void {
  const lowerName = name.toLowerCase();
  const lowerValue = value.toLowerCase();

  if (lowerName === "xmlns" || lowerName.startsWith("xmlns:")) {
    return;
  }

  if (lowerName.startsWith("on")) {
    throw new InkMcpError("UNSAFE_SVG", "Event handler attributes are not allowed.", { attribute: name });
  }

  if (/(?:https?|ftp):\/\//i.test(value) || /^\/\//.test(value.trim())) {
    throw new InkMcpError("UNSAFE_SVG", "Remote SVG references are not allowed.", { attribute: name });
  }

  if (lowerValue.includes("file:") || lowerValue.includes("data:")) {
    throw new InkMcpError("UNSAFE_SVG", "Local file and data references are not allowed.", { attribute: name });
  }

  const urlRefs = [...value.matchAll(/url\(([^)]+)\)/gi)];
  for (const match of urlRefs) {
    const target = match[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (!target?.startsWith("#")) {
      throw new InkMcpError("UNSAFE_SVG", "Only internal url(#id) references are allowed.", {
        attribute: name,
      });
    }
  }

  if ((lowerName === "href" || lowerName === "xlink:href") && value && !value.startsWith("#")) {
    throw new InkMcpError("UNSAFE_SVG", "href references must be internal fragment references.", {
      attribute: name,
    });
  }
}

export function walkElements(root: XmlElement): XmlElement[] {
  const result: XmlElement[] = [root];
  for (const child of elementChildren(root)) {
    result.push(...walkElements(child));
  }
  return result;
}

export function elementChildren(root: XmlElement): XmlElement[] {
  const children: XmlElement[] = [];
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const child = root.childNodes.item(index);
    if (child && child.nodeType === 1) {
      children.push(child as XmlElement);
    }
  }
  return children;
}
