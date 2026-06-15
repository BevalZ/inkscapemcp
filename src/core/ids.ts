import { randomUUID } from "node:crypto";

import { InkMcpError } from "./errors.js";

const DOC_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ELEMENT_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;

export function assertSafeDocId(docId: string): string {
  if (!DOC_ID_PATTERN.test(docId)) {
    throw new InkMcpError(
      "INVALID_INPUT",
      "docId must be 1-64 characters and contain only letters, numbers, underscores, or hyphens.",
      { docId },
    );
  }
  return docId;
}

export function createDocId(title = "document"): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return assertSafeDocId(`${stem || "document"}-${randomUUID().slice(0, 8)}`);
}

export function assertSafeElementId(id: string): string {
  if (!ELEMENT_ID_PATTERN.test(id)) {
    throw new InkMcpError("INVALID_INPUT", "Element id is not a safe SVG id.", { id });
  }
  return id;
}

export function createElementId(type = "element"): string {
  const safeType = type.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "element";
  return assertSafeElementId(`${safeType}-${randomUUID().slice(0, 8)}`);
}

export function makeUniqueElementId(base: string, existingIds: Set<string>): string {
  const safeBase = base.replace(/[^A-Za-z0-9_.:-]+/g, "-").replace(/^-+|-+$/g, "") || "element";
  let candidate = assertSafeElementId(safeBase);
  let index = 1;

  while (existingIds.has(candidate)) {
    candidate = assertSafeElementId(`${safeBase}-${index}`);
    index += 1;
  }

  existingIds.add(candidate);
  return candidate;
}
