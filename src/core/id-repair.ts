import {
  fingerprintSvgElements,
  scoreSemanticCandidate,
  type ElementMatchCandidate,
  type ElementSemanticFingerprint,
} from "./semantic-fingerprint.js";

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

function definedIds(fingerprints: ElementSemanticFingerprint[]): string[] {
  return fingerprints
    .map((fingerprint) => fingerprint.elementId)
    .filter((elementId): elementId is string => elementId !== undefined);
}

function compareCandidates(left: ElementMatchCandidate, right: ElementMatchCandidate): number {
  if (right.score !== left.score) return right.score - left.score;
  return (left.elementId ?? "").localeCompare(right.elementId ?? "");
}
