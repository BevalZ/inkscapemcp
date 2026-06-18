import type { Element as XmlElement } from "@xmldom/xmldom";

import {
  fingerprintSvgElements,
  scoreSemanticCandidate,
  type ElementMatchCandidate,
  type ElementSemanticFingerprint,
} from "./semantic-fingerprint.js";
import { InkMcpError } from "./errors.js";
import { inkMcpMetadataElementId } from "./sync-metadata.js";
import { getSvgRoot, parseSvgDocument, serializeSvg } from "./svg-document.js";
import { walkElements } from "./validation.js";

export type IdRepairRejectReason = "low_confidence" | "ambiguous_top_score" | "no_candidate";

export interface IdRepairProposal {
  baselineElementId: string;
  proposedElementId: string;
  confidence: number;
  reasons: string[];
  candidateCount: number;
  topCandidate: ElementMatchCandidate;
  candidates: ElementMatchCandidate[];
}

export interface RejectedIdRepairProposal {
  baselineElementId: string;
  rejectReason: IdRepairRejectReason;
  topScore: number;
  candidateCount: number;
  candidates: ElementMatchCandidate[];
  baselineFingerprint: ElementSemanticFingerprint;
}

export interface IdRepairProposalResult {
  generatedAt: string;
  minConfidence: number;
  summary: {
    baselineElementCount: number;
    currentElementCount: number;
    missingBaselineIdCount: number;
    newCurrentIdCount: number;
    acceptedProposalCount: number;
    rejectedProposalCount: number;
    ambiguousProposalCount: number;
    lowConfidenceProposalCount: number;
    noCandidateProposalCount: number;
  };
  proposals: IdRepairProposal[];
  rejected: RejectedIdRepairProposal[];
}

export interface IdRepairApplyRepair {
  fromElementId: string;
  toElementId: string;
  confidence?: number;
  reasons?: string[];
}

export interface AppliedIdRepair {
  fromElementId: string;
  toElementId: string;
}

export interface IdRepairApplyResult {
  svg: string;
  appliedRepairs: AppliedIdRepair[];
  repairedElementIds: string[];
  rewrittenReferenceCount: number;
}

export function proposeIdRepairsFromSvg(input: {
  baselineSvg: string;
  currentSvg: string;
  minConfidence: number;
  generatedAt?: string;
}): IdRepairProposalResult {
  const baselineFingerprints = fingerprintSvgElements(input.baselineSvg);
  const currentFingerprints = fingerprintSvgElements(input.currentSvg);
  const baselineIds = new Set(definedIds(baselineFingerprints));
  const currentIds = new Set(definedIds(currentFingerprints));
  const missingBaselineFingerprints = baselineFingerprints.filter((fingerprint) => {
    return fingerprint.elementId !== undefined && !currentIds.has(fingerprint.elementId);
  });
  const newCurrentFingerprints = currentFingerprints.filter((fingerprint) => {
    return fingerprint.elementId !== undefined && !baselineIds.has(fingerprint.elementId);
  });

  const proposals: IdRepairProposal[] = [];
  const rejected: RejectedIdRepairProposal[] = [];

  for (const baselineFingerprint of missingBaselineFingerprints) {
    const candidates = newCurrentFingerprints
      .map((fingerprint) => scoreSemanticCandidate(baselineFingerprint, fingerprint))
      .filter((candidate) => candidate.score > 0)
      .sort(compareCandidates);
    const topCandidate = candidates[0];
    const baselineElementId = baselineFingerprint.elementId as string;
    if (!topCandidate) {
      rejected.push({
        baselineElementId,
        rejectReason: "no_candidate",
        topScore: 0,
        candidateCount: 0,
        candidates: [],
        baselineFingerprint,
      });
      continue;
    }

    const tiedTopCandidates = candidates.filter((candidate) => candidate.score === topCandidate.score);
    if (topCandidate.score < input.minConfidence) {
      rejected.push({
        baselineElementId,
        rejectReason: "low_confidence",
        topScore: topCandidate.score,
        candidateCount: candidates.length,
        candidates,
        baselineFingerprint,
      });
      continue;
    }

    if (tiedTopCandidates.length > 1) {
      rejected.push({
        baselineElementId,
        rejectReason: "ambiguous_top_score",
        topScore: topCandidate.score,
        candidateCount: candidates.length,
        candidates,
        baselineFingerprint,
      });
      continue;
    }

    proposals.push({
      baselineElementId,
      proposedElementId: topCandidate.elementId as string,
      confidence: topCandidate.score,
      reasons: topCandidate.reasons,
      candidateCount: candidates.length,
      topCandidate,
      candidates,
    });
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    minConfidence: input.minConfidence,
    summary: {
      baselineElementCount: baselineFingerprints.length,
      currentElementCount: currentFingerprints.length,
      missingBaselineIdCount: missingBaselineFingerprints.length,
      newCurrentIdCount: newCurrentFingerprints.length,
      acceptedProposalCount: proposals.length,
      rejectedProposalCount: rejected.length,
      ambiguousProposalCount: rejected.filter((proposal) => proposal.rejectReason === "ambiguous_top_score").length,
      lowConfidenceProposalCount: rejected.filter((proposal) => proposal.rejectReason === "low_confidence").length,
      noCandidateProposalCount: rejected.filter((proposal) => proposal.rejectReason === "no_candidate").length,
    },
    proposals,
    rejected,
  };
}

export function applyIdRepairsToSvg(input: {
  currentSvg: string;
  repairs: IdRepairApplyRepair[];
}): IdRepairApplyResult {
  const repairs = normalizeApplyRepairs(input.repairs);
  const document = parseSvgDocument(input.currentSvg);
  const root = getSvgRoot(document);
  const elementsById = collectElementsById(root);

  for (const repair of repairs) {
    const currentElements = elementsById.get(repair.toElementId) ?? [];
    if (currentElements.length === 0) {
      throw new InkMcpError("INVALID_INPUT", "Current element id for id repair was not found.", {
        toElementId: repair.toElementId,
      });
    }
    if (currentElements.length > 1) {
      throw new InkMcpError("INVALID_INPUT", "Current element id for id repair is not unique.", {
        toElementId: repair.toElementId,
        count: currentElements.length,
      });
    }
    const targetElements = elementsById.get(repair.fromElementId) ?? [];
    if (targetElements.length > 0) {
      throw new InkMcpError("ID_CONFLICT", "Target repaired element id already exists in the current document.", {
        fromElementId: repair.fromElementId,
        toElementId: repair.toElementId,
        count: targetElements.length,
      });
    }
  }

  for (const repair of repairs) {
    const [element] = elementsById.get(repair.toElementId) ?? [];
    element?.setAttribute("id", repair.fromElementId);
  }

  const idMap = new Map(repairs.map((repair) => [repair.toElementId, repair.fromElementId]));
  let rewrittenReferenceCount = 0;
  for (const element of walkElements(root)) {
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes.item(index);
      if (!attribute || attribute.name === "id") continue;
      const rewritten = rewriteInternalIdReferences(attribute.name, attribute.value, idMap);
      if (rewritten !== attribute.value) {
        element.setAttribute(attribute.name, rewritten);
        rewrittenReferenceCount += 1;
      }
    }
  }

  return {
    svg: serializeSvg(document),
    appliedRepairs: repairs.map(({ fromElementId, toElementId }) => ({ fromElementId, toElementId })),
    repairedElementIds: repairs.map((repair) => repair.fromElementId),
    rewrittenReferenceCount,
  };
}

function definedIds(fingerprints: ElementSemanticFingerprint[]): string[] {
  return fingerprints
    .map((fingerprint) => fingerprint.elementId)
    .filter((elementId): elementId is string => elementId !== undefined);
}

function compareCandidates(left: ElementMatchCandidate, right: ElementMatchCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  return (left.elementId ?? "").localeCompare(right.elementId ?? "");
}

function normalizeApplyRepairs(repairs: IdRepairApplyRepair[]): AppliedIdRepair[] {
  if (repairs.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "apply_id_repairs requires at least one repair.");
  }

  const fromIds = new Set<string>();
  const toIds = new Set<string>();
  return repairs.map((repair, index) => {
    assertRepairElementId(repair.fromElementId, "fromElementId", index);
    assertRepairElementId(repair.toElementId, "toElementId", index);
    if (repair.fromElementId === repair.toElementId) {
      throw new InkMcpError("INVALID_INPUT", "Id repair cannot rename an element to the same id.", {
        index,
        elementId: repair.fromElementId,
      });
    }
    if (fromIds.has(repair.fromElementId)) {
      throw new InkMcpError("INVALID_INPUT", "Duplicate repaired target id in id repairs.", {
        index,
        fromElementId: repair.fromElementId,
      });
    }
    if (toIds.has(repair.toElementId)) {
      throw new InkMcpError("INVALID_INPUT", "Duplicate current element id in id repairs.", {
        index,
        toElementId: repair.toElementId,
      });
    }
    fromIds.add(repair.fromElementId);
    toIds.add(repair.toElementId);
    return {
      fromElementId: repair.fromElementId,
      toElementId: repair.toElementId,
    };
  });
}

function assertRepairElementId(elementId: string, field: "fromElementId" | "toElementId", index: number): void {
  if (elementId === inkMcpMetadataElementId) {
    throw new InkMcpError("INVALID_INPUT", "InkSMCP metadata id cannot be repaired as a normal SVG element id.", {
      index,
      field,
      elementId,
    });
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/.test(elementId)) {
    throw new InkMcpError("INVALID_INPUT", "Invalid element id in id repair.", {
      index,
      field,
      elementId,
    });
  }
}

function collectElementsById(root: XmlElement): Map<string, XmlElement[]> {
  const byId = new Map<string, XmlElement[]>();
  for (const element of walkElements(root)) {
    const id = element.getAttribute("id");
    if (!id) continue;
    const existing = byId.get(id) ?? [];
    existing.push(element);
    byId.set(id, existing);
  }
  return byId;
}

function rewriteInternalIdReferences(attributeName: string, value: string, idMap: Map<string, string>): string {
  let rewritten = value;
  for (const [fromId, toId] of idMap) {
    rewritten = rewriteUrlReference(rewritten, fromId, toId);
    rewritten = rewriteHrefReference(attributeName, rewritten, fromId, toId);
    rewritten = rewriteIdRefList(attributeName, rewritten, fromId, toId);
  }
  return rewritten;
}

function rewriteUrlReference(value: string, fromId: string, toId: string): string {
  return value.replace(new RegExp(`url\\(\\s*(['"]?)#${escapeRegExp(fromId)}\\1\\s*\\)`, "g"), `url(#${toId})`);
}

function rewriteHrefReference(attributeName: string, value: string, fromId: string, toId: string): string {
  const normalized = attributeName.toLowerCase();
  if ((normalized === "href" || normalized === "xlink:href") && value === `#${fromId}`) {
    return `#${toId}`;
  }
  return value;
}

function rewriteIdRefList(attributeName: string, value: string, fromId: string, toId: string): string {
  const normalized = attributeName.toLowerCase();
  if (normalized !== "aria-labelledby" && normalized !== "aria-describedby") {
    return value;
  }
  return value
    .split(/\s+/)
    .map((part) => (part === fromId ? toId : part))
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
