import type { Element as XmlElement } from "@xmldom/xmldom";

import { InkMcpError } from "./errors.js";
import { describeEditablePathData, type EditablePathSegmentInfo } from "./path-data.js";
import { walkElements } from "./validation.js";

export interface PathNodeWarning {
  code: "UNSUPPORTED_PATH_DATA";
  elementId?: string;
  pathIndex: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface CompactPathNodeSummary {
  elementId?: string;
  pathIndex: number;
  segmentCount: number;
  commandCounts: Record<string, number>;
  relativeSegmentCount: number;
  editablePointCount: number;
  normalize?: "absolute";
  normalizedPointCount?: number;
  normalizedCommandPoints?: Record<string, string[]>;
}

export interface FullPathNodeSummary extends CompactPathNodeSummary {
  d: string;
  segments: EditablePathSegmentInfo[];
  normalizedSegments?: NormalizedPathNodeSegmentSummary[];
}

export interface NormalizedPathNodeSegmentSummary {
  index: number;
  cmd: EditablePathSegmentInfo["cmd"];
  relative: boolean;
  availablePoints: EditablePathSegmentInfo["availablePoints"];
  points: EditablePathSegmentInfo["absolutePoints"];
}

export type QueryPathNodeSummary = {
  totalPathCount: number;
  describedPathCount: number;
  unsupportedPathCount: number;
  normalize?: "absolute";
  paths: CompactPathNodeSummary[] | FullPathNodeSummary[];
  warnings: PathNodeWarning[];
};

export function summarizePathNodesForQuery(
  root: XmlElement,
  responseMode: "compact" | "standard" | "full",
  options: { normalize?: "none" | "absolute" } = {},
): QueryPathNodeSummary {
  const pathElements = walkElements(root).filter((element) => (element.localName ?? element.nodeName) === "path");
  const includeSegments = responseMode !== "compact";
  const includeNormalized = options.normalize === "absolute";
  const paths: Array<CompactPathNodeSummary | FullPathNodeSummary> = [];
  const warnings: PathNodeWarning[] = [];

  pathElements.forEach((element, pathIndex) => {
    const elementId = element.getAttribute("id") ?? undefined;
    const d = element.getAttribute("d");
    if (!d) {
      warnings.push({
        code: "UNSUPPORTED_PATH_DATA",
        elementId,
        pathIndex,
        message: "Path element has no d attribute.",
        details: { reason: "missing_d" },
      });
      return;
    }

    try {
      const segments = describeEditablePathData(d);
      const compact = compactPathNodeSummary({ elementId, pathIndex, segments, normalize: options.normalize });
      paths.push(
        includeSegments
          ? {
              ...compact,
              d,
              segments,
              ...(includeNormalized ? { normalizedSegments: normalizedSegments(segments) } : {}),
            }
          : compact,
      );
    } catch (error) {
      warnings.push(pathNodeWarning({ elementId, pathIndex, error }));
    }
  });

  return {
    totalPathCount: pathElements.length,
    describedPathCount: paths.length,
    unsupportedPathCount: warnings.length,
    ...(includeNormalized ? { normalize: "absolute" as const } : {}),
    paths: includeSegments ? (paths as FullPathNodeSummary[]) : (paths as CompactPathNodeSummary[]),
    warnings,
  };
}

function compactPathNodeSummary(input: {
  elementId?: string;
  pathIndex: number;
  segments: EditablePathSegmentInfo[];
  normalize?: "none" | "absolute";
}): CompactPathNodeSummary {
  const includeNormalized = input.normalize === "absolute";
  return {
    elementId: input.elementId,
    pathIndex: input.pathIndex,
    segmentCount: input.segments.length,
    commandCounts: commandCounts(input.segments),
    relativeSegmentCount: input.segments.filter((segment) => segment.relative).length,
    editablePointCount: input.segments.reduce((sum, segment) => sum + segment.availablePoints.length, 0),
    ...(includeNormalized
      ? {
          normalize: "absolute" as const,
          normalizedPointCount: input.segments.reduce((sum, segment) => sum + Object.keys(segment.absolutePoints).length, 0),
          normalizedCommandPoints: normalizedCommandPoints(input.segments),
        }
      : {}),
  };
}

function normalizedSegments(segments: EditablePathSegmentInfo[]): NormalizedPathNodeSegmentSummary[] {
  return segments.map((segment) => ({
    index: segment.index,
    cmd: segment.cmd,
    relative: segment.relative,
    availablePoints: segment.availablePoints,
    points: segment.absolutePoints,
  }));
}

function normalizedCommandPoints(segments: EditablePathSegmentInfo[]): Record<string, string[]> {
  const points: Record<string, Set<string>> = {};
  for (const segment of segments) {
    const commandPoints = points[segment.cmd] ?? new Set<string>();
    for (const pointName of Object.keys(segment.absolutePoints).sort()) {
      commandPoints.add(pointName);
    }
    points[segment.cmd] = commandPoints;
  }
  return Object.fromEntries(Object.entries(points).map(([command, names]) => [command, [...names].sort()]));
}

function commandCounts(segments: EditablePathSegmentInfo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const segment of segments) {
    counts[segment.cmd] = (counts[segment.cmd] ?? 0) + 1;
  }
  return counts;
}

function pathNodeWarning(input: { elementId?: string; pathIndex: number; error: unknown }): PathNodeWarning {
  if (input.error instanceof InkMcpError) {
    return {
      code: "UNSUPPORTED_PATH_DATA",
      elementId: input.elementId,
      pathIndex: input.pathIndex,
      message: input.error.message,
      details: { errorCode: input.error.code, ...input.error.details },
    };
  }

  return {
    code: "UNSUPPORTED_PATH_DATA",
    elementId: input.elementId,
    pathIndex: input.pathIndex,
    message: input.error instanceof Error ? input.error.message : String(input.error),
  };
}
