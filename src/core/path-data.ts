import { InkMcpError, toErrorPayload } from "./errors.js";

export type PathSegment =
  | { cmd: "M"; x: number; y: number }
  | { cmd: "L"; x: number; y: number }
  | { cmd: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { cmd: "Q"; x1: number; y1: number; x: number; y: number }
  | { cmd: "Z" };

export type EditablePathSegment =
  | { cmd: "M" | "m"; x: number; y: number }
  | { cmd: "L" | "l"; x: number; y: number }
  | { cmd: "H" | "h"; x: number }
  | { cmd: "V" | "v"; y: number }
  | { cmd: "C" | "c"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { cmd: "Q" | "q"; x1: number; y1: number; x: number; y: number }
  | ArcPathSegment
  | { cmd: "Z" | "z" };

export type ArcPathSegment = {
  cmd: "A" | "a";
  rx: number;
  ry: number;
  xAxisRotation: number;
  largeArcFlag: number;
  sweepFlag: number;
  x: number;
  y: number;
};

export type SmoothCubicPathSegment = {
  cmd: "S" | "s";
  x2: number;
  y2: number;
  x: number;
  y: number;
};

export type QueryPathSegment = EditablePathSegment | SmoothCubicPathSegment;

export type EditablePathPoint = "end" | "c1" | "c2";

export type EditablePathPointMap = Partial<Record<EditablePathPoint, { x: number; y: number }>>;
export type PathNodeNormalizeMode = "absolute" | "relative";

export interface PathSegmentInfo<TSegment extends QueryPathSegment = QueryPathSegment> {
  index: number;
  cmd: TSegment["cmd"];
  relative: boolean;
  basePoint: { x: number; y: number };
  raw: TSegment;
  queryPoints: EditablePathPoint[];
  availablePoints: EditablePathPoint[];
  points: EditablePathPointMap;
  absolutePoints: EditablePathPointMap;
}

export type EditablePathSegmentInfo = PathSegmentInfo<EditablePathSegment>;
export type QueryPathSegmentInfo = PathSegmentInfo<QueryPathSegment>;

export interface NormalizedPathSegmentInfo<TSegmentInfo extends PathSegmentInfo = QueryPathSegmentInfo> {
  index: number;
  cmd: TSegmentInfo["cmd"];
  relative: boolean;
  queryPoints: EditablePathPoint[];
  availablePoints: EditablePathPoint[];
  points: EditablePathPointMap;
}

export type NormalizedEditablePathSegmentInfo = NormalizedPathSegmentInfo<EditablePathSegmentInfo>;
export type NormalizedQueryPathSegmentInfo = NormalizedPathSegmentInfo<QueryPathSegmentInfo>;

export type PathNodeEdit =
  | {
      type: "move_point";
      segmentIndex: number;
      point: EditablePathPoint;
      dx?: number;
      dy?: number;
    }
  | {
      type: "set_point_absolute";
      segmentIndex: number;
      point: EditablePathPoint;
      x: number;
      y: number;
    }
  | {
      type: "set_point_relative";
      segmentIndex: number;
      point: EditablePathPoint;
      x: number;
      y: number;
    }
  | {
      type: "insert_segment";
      index: number;
      segment: PathSegment;
    }
  | {
      type: "delete_segment";
      segmentIndex: number;
    };

export interface PathDataInput {
  d?: string;
  segments?: PathSegment[];
}

interface PathDataValidationOptions {
  requireMoveTo?: boolean;
  requireEditableCommands?: boolean;
}

type PathToken = { type: "command" | "number"; value: string; offset: number; endOffset: number };

interface PathCommandContext {
  command: string;
  commandIndex: number;
  tokenIndex: number;
  offset: number;
  endOffset: number;
}

export interface PathDataValidationSummary {
  ok: true;
  d: string;
  requireMoveTo: boolean;
  segmentCount: number;
  commandCounts: Record<string, number>;
  unsupportedCommandCount: number;
  relativeCommandCount: number;
  absoluteCommandCount: number;
  availablePointCount: number;
  queryPointCount: number;
  editablePointSummary: Array<{
    segmentIndex: number;
    cmd: QueryPathSegment["cmd"];
    relative: boolean;
    queryPoints: EditablePathPoint[];
    availablePoints: EditablePathPoint[];
  }>;
}

export interface PathDataValidationFailure {
  ok: false;
  d: string;
  requireMoveTo: boolean;
  error: ReturnType<typeof toErrorPayload>;
}

export type PathDataValidationResult = PathDataValidationSummary | PathDataValidationFailure;

const commandParamCounts: Record<string, number> = {
  M: 2,
  m: 2,
  L: 2,
  l: 2,
  H: 1,
  h: 1,
  V: 1,
  v: 1,
  C: 6,
  c: 6,
  S: 4,
  s: 4,
  Q: 4,
  q: 4,
  T: 2,
  t: 2,
  A: 7,
  a: 7,
  Z: 0,
  z: 0,
};

const commandTokenPattern = /^[MmZzLlHhVvCcSsQqTtAa]$/;
const numberTokenPattern = /^[-+]?(?:(?:\d*\.\d+)|(?:\d+\.?))(?:[eE][-+]?\d+)?$/;
const pathTokenPattern = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:(?:\d*\.\d+)|(?:\d+\.?))(?:[eE][-+]?\d+)?/g;

export function pathDataFromInput(input: PathDataInput, options: PathDataValidationOptions = {}): string {
  const hasRawPath = input.d !== undefined;
  const hasSegments = input.segments !== undefined;
  if (hasRawPath === hasSegments) {
    throw new InkMcpError("INVALID_INPUT", "Provide exactly one path source: d or segments.");
  }

  const pathData = hasRawPath ? input.d?.trim() ?? "" : pathSegmentsToD(input.segments ?? []);
  validatePathData(pathData, options);
  return pathData;
}

export function pathSegmentsToD(segments: PathSegment[]): string {
  if (segments.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path segments must not be empty.");
  }

  return editablePathSegmentsToD(segments);
}

export function editablePathSegmentsToD(segments: EditablePathSegment[]): string {
  if (segments.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path segments must not be empty.");
  }

  return segments.map((segment) => {
    switch (segment.cmd) {
      case "M":
      case "m":
      case "L":
      case "l":
        return `${segment.cmd}${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "H":
      case "h":
        return `${segment.cmd}${formatPathNumber(segment.x)}`;
      case "V":
      case "v":
        return `${segment.cmd}${formatPathNumber(segment.y)}`;
      case "C":
      case "c":
        return `${segment.cmd}${formatPathNumber(segment.x1)} ${formatPathNumber(segment.y1)} ${formatPathNumber(segment.x2)} ${formatPathNumber(segment.y2)} ${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "Q":
      case "q":
        return `${segment.cmd}${formatPathNumber(segment.x1)} ${formatPathNumber(segment.y1)} ${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "A":
      case "a":
        return `${segment.cmd}${formatPathNumber(segment.rx)} ${formatPathNumber(segment.ry)} ${formatPathNumber(segment.xAxisRotation)} ${formatPathNumber(segment.largeArcFlag)} ${formatPathNumber(segment.sweepFlag)} ${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "Z":
      case "z":
        return segment.cmd;
    }
  }).join(" ");
}

export function parseEditablePathData(pathData: string): EditablePathSegment[] {
  validatePathData(pathData, { requireMoveTo: true, requireEditableCommands: true });
  const tokens = tokenizePathData(pathData.trim());
  const segments: EditablePathSegment[] = [];
  let index = 0;
  let currentCommand: string | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "command") {
      currentCommand = token.value;
      index += 1;
    } else if (!currentCommand) {
      throw new InkMcpError("INVALID_INPUT", "Path number appeared before any command.");
    }

    const command = currentCommand;
    if (!command) {
      throw new InkMcpError("INVALID_INPUT", "Path command is missing.");
    }
    assertEditablePathCommand(command);

    if (command === "Z" || command === "z") {
      segments.push({ cmd: command });
      currentCommand = undefined;
      continue;
    }

    const paramCount = commandParamCounts[command];
    while (index < tokens.length && tokens[index].type !== "command") {
      const values: number[] = [];
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        const value = tokens[index];
        if (!value || value.type !== "number") {
          throw new InkMcpError("INVALID_INPUT", "Path command has an incomplete parameter set.", { command });
        }
        values.push(Number(value.value));
        index += 1;
      }
      segments.push(editableSegmentFromValues(currentCommand, values));
      if (currentCommand === "M") currentCommand = "L";
      if (currentCommand === "m") currentCommand = "l";
    }
  }

  return segments;
}

export function parsePathDataForQuery(pathData: string): QueryPathSegment[] {
  validatePathData(pathData, { requireMoveTo: true });
  const tokens = tokenizePathData(pathData.trim());
  const segments: QueryPathSegment[] = [];
  let index = 0;
  let currentCommand: string | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "command") {
      currentCommand = token.value;
      index += 1;
    } else if (!currentCommand) {
      throw new InkMcpError("INVALID_INPUT", "Path number appeared before any command.");
    }

    const command = currentCommand;
    if (!command) {
      throw new InkMcpError("INVALID_INPUT", "Path command is missing.");
    }
    assertQueryPathCommand(command);

    if (command === "Z" || command === "z") {
      segments.push({ cmd: command });
      currentCommand = undefined;
      continue;
    }

    const paramCount = commandParamCounts[command];
    while (index < tokens.length && tokens[index].type !== "command") {
      const values: number[] = [];
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        const value = tokens[index];
        if (!value || value.type !== "number") {
          throw new InkMcpError("INVALID_INPUT", "Path command has an incomplete parameter set.", { command });
        }
        values.push(Number(value.value));
        index += 1;
      }
      segments.push(querySegmentFromValues(currentCommand, values));
      if (currentCommand === "M") currentCommand = "L";
      if (currentCommand === "m") currentCommand = "l";
    }
  }

  return segments;
}

export function describeEditablePathData(pathData: string): EditablePathSegmentInfo[] {
  const segments = parseEditablePathData(pathData);
  return describePathSegments(segments) as EditablePathSegmentInfo[];
}

export function describePathDataForQuery(pathData: string): QueryPathSegmentInfo[] {
  const segments = parsePathDataForQuery(pathData);
  return describePathSegments(segments);
}

export function normalizedEditablePathSegments(
  segments: EditablePathSegmentInfo[],
  mode: PathNodeNormalizeMode,
): NormalizedEditablePathSegmentInfo[] {
  return segments.map((segment) => ({
    index: segment.index,
    cmd: segment.cmd,
    relative: segment.relative,
    queryPoints: segment.queryPoints,
    availablePoints: segment.availablePoints,
    points: normalizedEditablePathPoints(segment, mode),
  }));
}

export function normalizedQueryPathSegments(
  segments: QueryPathSegmentInfo[],
  mode: PathNodeNormalizeMode,
): NormalizedQueryPathSegmentInfo[] {
  return segments.map((segment) => ({
    index: segment.index,
    cmd: segment.cmd,
    relative: segment.relative,
    queryPoints: segment.queryPoints,
    availablePoints: segment.availablePoints,
    points: normalizedPathPoints(segment, mode),
  }));
}

export function normalizedEditablePathPoints(
  segment: EditablePathSegmentInfo,
  mode: PathNodeNormalizeMode,
): EditablePathPointMap {
  return normalizedPathPoints(segment, mode);
}

export function normalizedPathPoints(
  segment: QueryPathSegmentInfo,
  mode: PathNodeNormalizeMode,
): EditablePathPointMap {
  if (mode === "absolute") return segment.absolutePoints;

  const points: EditablePathPointMap = {};
  for (const pointName of segment.queryPoints) {
    const absolutePoint = segment.absolutePoints[pointName];
    if (!absolutePoint) continue;
    points[pointName] = {
      x: absolutePoint.x - segment.basePoint.x,
      y: absolutePoint.y - segment.basePoint.y,
    };
  }
  return points;
}

function describePathSegments(segments: QueryPathSegment[]): QueryPathSegmentInfo[] {
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };

  return segments.map((segment, index) => {
    const relative = isRelativeCommand(segment.cmd);
    const points: EditablePathPointMap = {};
    const absolutePoints: EditablePathPointMap = {};
    const base = current;

    switch (segment.cmd) {
      case "M":
      case "m":
      case "L":
      case "l":
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.end = resolvePathPoint(base, points.end, relative);
        current = absolutePoints.end;
        if (segment.cmd === "M" || segment.cmd === "m") {
          subpathStart = current;
        }
        break;
      case "H":
      case "h":
        points.end = { x: segment.x, y: relative ? 0 : base.y };
        absolutePoints.end = {
          x: relative ? base.x + segment.x : segment.x,
          y: base.y,
        };
        current = absolutePoints.end;
        break;
      case "V":
      case "v":
        points.end = { x: relative ? 0 : base.x, y: segment.y };
        absolutePoints.end = {
          x: base.x,
          y: relative ? base.y + segment.y : segment.y,
        };
        current = absolutePoints.end;
        break;
      case "C":
      case "c":
        points.c1 = { x: segment.x1, y: segment.y1 };
        points.c2 = { x: segment.x2, y: segment.y2 };
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.c1 = resolvePathPoint(base, points.c1, relative);
        absolutePoints.c2 = resolvePathPoint(base, points.c2, relative);
        absolutePoints.end = resolvePathPoint(base, points.end, relative);
        current = absolutePoints.end;
        break;
      case "S":
      case "s":
        points.c2 = { x: segment.x2, y: segment.y2 };
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.c2 = resolvePathPoint(base, points.c2, relative);
        absolutePoints.end = resolvePathPoint(base, points.end, relative);
        current = absolutePoints.end;
        break;
      case "Q":
      case "q":
        points.c1 = { x: segment.x1, y: segment.y1 };
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.c1 = resolvePathPoint(base, points.c1, relative);
        absolutePoints.end = resolvePathPoint(base, points.end, relative);
        current = absolutePoints.end;
        break;
      case "A":
      case "a":
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.end = resolvePathPoint(base, points.end, relative);
        current = absolutePoints.end;
        break;
      case "Z":
      case "z":
        current = subpathStart;
        break;
    }

    return {
      index,
      cmd: segment.cmd,
      relative,
      basePoint: { ...base },
      raw: segment,
      queryPoints: queryPathPoints(segment),
      availablePoints: availablePathPoints(segment),
      points,
      absolutePoints,
    };
  });
}

export function applyPathNodeEdits(pathData: string, edits: PathNodeEdit[]): string {
  const segments = parseEditablePathData(pathData);

  for (const edit of edits) {
    switch (edit.type) {
      case "move_point":
        movePathPoint(segments, edit);
        break;
      case "set_point_absolute":
        setPathPointAbsolute(segments, edit);
        break;
      case "set_point_relative":
        setPathPointRelative(segments, edit);
        break;
      case "insert_segment":
        insertPathSegment(segments, edit);
        break;
      case "delete_segment":
        deletePathSegment(segments, edit.segmentIndex);
        break;
    }
  }

  const nextD = editablePathSegmentsToD(segments);
  validatePathData(nextD, { requireMoveTo: true });
  return nextD;
}

export function validatePathData(pathData: string, options: PathDataValidationOptions = {}): void {
  const trimmed = pathData.trim();
  if (!trimmed) {
    throw new InkMcpError("INVALID_INPUT", "Path data must not be empty.", {
      offset: 0,
      tokenIndex: 0,
    });
  }

  const tokens = tokenizePathData(trimmed);
  if (tokens[0]?.type !== "command") {
    throw new InkMcpError("INVALID_INPUT", "Path data must start with an SVG path command.", {
      tokenIndex: 0,
      offset: tokens[0]?.offset ?? 0,
      token: tokens[0]?.value,
    });
  }
  if (options.requireMoveTo !== false && !["M", "m"].includes(tokens[0].value)) {
    throw new InkMcpError("INVALID_INPUT", "Complete path data must start with M or m.", {
      command: tokens[0].value,
      commandIndex: 0,
      tokenIndex: 0,
      offset: tokens[0].offset,
    });
  }

  let index = 0;
  let currentCommand: string | undefined;
  let currentCommandContext: PathCommandContext | undefined;
  let commandIndex = -1;
  let segmentIndex = 0;
  let zeroParamSegmentIndex: number | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "command") {
      commandIndex += 1;
      currentCommand = token.value;
      currentCommandContext = {
        command: token.value,
        commandIndex,
        tokenIndex: index,
        offset: token.offset,
        endOffset: token.endOffset,
      };
      zeroParamSegmentIndex = undefined;
      if (options.requireEditableCommands === true) {
        assertEditablePathCommand(currentCommand, {
          ...commandDiagnosticDetails(currentCommand, currentCommandContext, segmentIndex),
          expectedParamCount: commandParamCounts[currentCommand],
        });
      }
      index += 1;
      if (commandParamCounts[currentCommand] === 0) {
        zeroParamSegmentIndex = segmentIndex;
        segmentIndex += 1;
        continue;
      }
    } else if (!currentCommand) {
      throw new InkMcpError("INVALID_INPUT", "Path number appeared before any command.", {
        tokenIndex: index,
        offset: token.offset,
        token: token.value,
      });
    }

    const paramCount = currentCommand ? commandParamCounts[currentCommand] : undefined;
    if (paramCount === undefined) {
      throw new InkMcpError("INVALID_INPUT", "Unsupported SVG path command.", {
        ...(currentCommandContext
          ? commandDiagnosticDetails(currentCommand, currentCommandContext, segmentIndex)
          : { command: currentCommand }),
      });
    }
    if (paramCount === 0) {
      throw new InkMcpError("INVALID_INPUT", "Close-path command cannot be followed by implicit numbers.", {
        ...commandDiagnosticDetails(currentCommand, currentCommandContext, zeroParamSegmentIndex ?? segmentIndex),
        tokenIndex: index,
        offset: token.offset,
        token: token.value,
      });
    }

    let consumed = 0;
    while (index < tokens.length && tokens[index].type !== "command") {
      const availableParamCount = countConsecutiveNumberTokens(tokens, index);
      if (availableParamCount < paramCount) {
        throw new InkMcpError("INVALID_INPUT", "Path command has an incomplete parameter set.", {
          ...incompleteParameterDetails(
            trimmed,
            tokens,
            currentCommand,
            currentCommandContext,
            index,
            availableParamCount,
            paramCount,
            segmentIndex,
          ),
        });
      }
      const values: number[] = [];
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        const value = tokens[index];
        if (!value || value.type !== "number") {
          throw new InkMcpError("INVALID_INPUT", "Path command has an incomplete parameter set.", {
            ...incompleteParameterDetails(
              trimmed,
              tokens,
              currentCommand,
              currentCommandContext,
              index,
              paramIndex,
              paramCount,
              segmentIndex,
            ),
          });
        }
        values.push(Number(value.value));
        index += 1;
      }
      validatePathCommandParameters(currentCommand, values, {
        ...commandDiagnosticDetails(currentCommand, currentCommandContext, segmentIndex),
        expectedParamCount: paramCount,
      });
      consumed += paramCount;
      segmentIndex += 1;
      if (currentCommand === "M") currentCommand = "L";
      if (currentCommand === "m") currentCommand = "l";
    }

    if (consumed === 0) {
      throw new InkMcpError("INVALID_INPUT", "Path command has no parameters.", {
        ...missingParameterDetails(
          trimmed,
          tokens,
          currentCommand,
          currentCommandContext,
          index,
          paramCount,
          segmentIndex,
        ),
      });
    }
  }
}

export function isValidPathData(pathData: string, options: PathDataValidationOptions = {}): boolean {
  try {
    validatePathData(pathData, options);
    return true;
  } catch {
    return false;
  }
}

export function summarizePathDataValidation(
  pathData: string,
  options: PathDataValidationOptions = {},
): PathDataValidationResult {
  const d = pathData.trim();
  const requireMoveTo = options.requireMoveTo !== false;
  try {
    validatePathData(d, { requireMoveTo });
    const segments = describePathDataForQueryWithOptions(d, { requireMoveTo });
    const commandCounts: Record<string, number> = {};
    let relativeCommandCount = 0;
    let absoluteCommandCount = 0;
    let availablePointCount = 0;
    let queryPointCount = 0;
    const editablePointSummary = segments.map((segment) => {
      commandCounts[segment.cmd] = (commandCounts[segment.cmd] ?? 0) + 1;
      if (segment.relative) {
        relativeCommandCount += 1;
      } else {
        absoluteCommandCount += 1;
      }
      availablePointCount += segment.availablePoints.length;
      queryPointCount += segment.queryPoints.length;
      return {
        segmentIndex: segment.index,
        cmd: segment.cmd,
        relative: segment.relative,
        queryPoints: segment.queryPoints,
        availablePoints: segment.availablePoints,
      };
    });
    return {
      ok: true,
      d,
      requireMoveTo,
      segmentCount: segments.length,
      commandCounts,
      unsupportedCommandCount: 0,
      relativeCommandCount,
      absoluteCommandCount,
      availablePointCount,
      queryPointCount,
      editablePointSummary,
    };
  } catch (error) {
    return {
      ok: false,
      d,
      requireMoveTo,
      error: toErrorPayload(error),
    };
  }
}

function tokenizePathData(pathData: string): PathToken[] {
  const tokens: PathToken[] = [];
  pathTokenPattern.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pathTokenPattern.exec(pathData)) !== null) {
    const gap = pathData.slice(cursor, match.index);
    if (!/^[\s,]*$/.test(gap)) {
      throw new InkMcpError("INVALID_INPUT", "Path data contains invalid characters.", {
        ...invalidTextDetails(pathData, cursor, match.index),
      });
    }

    const value = match[0];
    if (commandTokenPattern.test(value)) {
      tokens.push({ type: "command", value, offset: match.index, endOffset: match.index + value.length });
    } else if (numberTokenPattern.test(value)) {
      tokens.push({ type: "number", value, offset: match.index, endOffset: match.index + value.length });
    } else {
      throw new InkMcpError("INVALID_INPUT", "Path data contains an invalid token.", {
        token: value,
        offset: match.index,
        endOffset: match.index + value.length,
      });
    }
    cursor = match.index + value.length;
  }

  if (!/^[\s,]*$/.test(pathData.slice(cursor))) {
    throw new InkMcpError("INVALID_INPUT", "Path data contains invalid trailing characters.", {
      ...invalidTextDetails(pathData, cursor, pathData.length),
    });
  }
  if (tokens.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path data must contain at least one command.", {
      offset: 0,
      tokenIndex: 0,
    });
  }

  return tokens;
}

function formatPathNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InkMcpError("INVALID_INPUT", "Path segment numbers must be finite.", { value });
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function assertEditablePathCommand(
  command: string,
  details: Record<string, unknown> = {},
): asserts command is EditablePathSegment["cmd"] {
  if (!["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "Q", "q", "A", "a", "Z", "z"].includes(command)) {
    throw new InkMcpError("INVALID_INPUT", "edit_path_nodes supports only M, L, H, V, C, Q, A, and Z path commands.", {
      command,
      ...details,
    });
  }
}

function assertQueryPathCommand(
  command: string,
  details: Record<string, unknown> = {},
): asserts command is QueryPathSegment["cmd"] {
  if (!["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "S", "s", "Q", "q", "A", "a", "Z", "z"].includes(command)) {
    throw new InkMcpError("INVALID_INPUT", "query_path_nodes supports only M, L, H, V, C, S, Q, A, and Z path commands.", {
      command,
      ...details,
    });
  }
}

function validatePathCommandParameters(
  command: string | undefined,
  values: number[],
  details: Record<string, unknown>,
): void {
  if (command !== "A" && command !== "a") return;
  const largeArcFlag = values[3];
  const sweepFlag = values[4];
  if (!isArcFlag(largeArcFlag)) {
    throw new InkMcpError("INVALID_INPUT", "Arc path large-arc flag must be 0 or 1.", {
      command,
      flag: "largeArcFlag",
      value: largeArcFlag,
      paramIndex: 3,
      ...details,
    });
  }
  if (!isArcFlag(sweepFlag)) {
    throw new InkMcpError("INVALID_INPUT", "Arc path sweep flag must be 0 or 1.", {
      command,
      flag: "sweepFlag",
      value: sweepFlag,
      paramIndex: 4,
      ...details,
    });
  }
}

function isArcFlag(value: number): boolean {
  return value === 0 || value === 1;
}

function commandDiagnosticDetails(
  command: string | undefined,
  context: PathCommandContext | undefined,
  segmentIndex: number,
): Record<string, unknown> {
  if (!context) return { command, segmentIndex };

  return {
    command,
    segmentIndex,
    commandIndex: context.commandIndex,
    commandTokenIndex: context.tokenIndex,
    commandOffset: context.offset,
    tokenIndex: context.tokenIndex,
    offset: context.offset,
    ...(command && command !== context.command
      ? { sourceCommand: context.command, implicitCommand: true }
      : {}),
  };
}

function incompleteParameterDetails(
  pathData: string,
  tokens: PathToken[],
  command: string | undefined,
  context: PathCommandContext | undefined,
  parameterStartIndex: number,
  actualParamCount: number,
  expectedParamCount: number,
  segmentIndex: number,
): Record<string, unknown> {
  const failureToken = tokens[parameterStartIndex + actualParamCount];
  return {
    ...commandDiagnosticDetails(command, context, segmentIndex),
    expectedParamCount,
    actualParamCount,
    missingParamCount: expectedParamCount - actualParamCount,
    tokenIndex: failureToken ? parameterStartIndex + actualParamCount : tokens.length,
    offset: failureToken?.offset ?? pathData.length,
    ...(failureToken ? { token: failureToken.value } : {}),
  };
}

function missingParameterDetails(
  pathData: string,
  tokens: PathToken[],
  command: string | undefined,
  context: PathCommandContext | undefined,
  index: number,
  expectedParamCount: number,
  segmentIndex: number,
): Record<string, unknown> {
  const failureToken = tokens[index];
  return {
    ...commandDiagnosticDetails(command, context, segmentIndex),
    expectedParamCount,
    actualParamCount: 0,
    missingParamCount: expectedParamCount,
    tokenIndex: failureToken ? index : tokens.length,
    offset: failureToken?.offset ?? pathData.length,
    ...(failureToken ? { token: failureToken.value } : {}),
  };
}

function countConsecutiveNumberTokens(tokens: PathToken[], startIndex: number): number {
  let count = 0;
  for (let index = startIndex; index < tokens.length && tokens[index].type === "number"; index += 1) {
    count += 1;
  }
  return count;
}

function invalidTextDetails(pathData: string, startOffset: number, endOffset: number) {
  const text = pathData.slice(startOffset, endOffset);
  const invalidOffsetInText = text.search(/[^\s,]/);
  const offset = invalidOffsetInText >= 0 ? startOffset + invalidOffsetInText : startOffset;
  const invalidText = pathData.slice(offset, endOffset).trim();
  return {
    offset,
    endOffset,
    invalidText: invalidText.slice(0, 40),
  };
}

function describeEditablePathDataWithOptions(
  pathData: string,
  options: PathDataValidationOptions,
): EditablePathSegmentInfo[] {
  const requireMoveTo = options.requireMoveTo !== false;
  if (requireMoveTo) return describeEditablePathData(pathData);

  const syntheticPath = `M0 0 ${pathData}`;
  const segments = describeEditablePathData(syntheticPath);
  return segments.slice(1).map((segment, index) => ({
    ...segment,
    index,
  }));
}

function describePathDataForQueryWithOptions(
  pathData: string,
  options: PathDataValidationOptions,
): QueryPathSegmentInfo[] {
  const requireMoveTo = options.requireMoveTo !== false;
  if (requireMoveTo) return describePathDataForQuery(pathData);

  const syntheticPath = `M0 0 ${pathData}`;
  const segments = describePathDataForQuery(syntheticPath);
  return segments.slice(1).map((segment, index) => ({
    ...segment,
    index,
  }));
}

function editableSegmentFromValues(command: string | undefined, values: number[]): EditablePathSegment {
  if (!command) {
    throw new InkMcpError("INVALID_INPUT", "Path command is missing.");
  }
  assertEditablePathCommand(command);
  switch (command) {
    case "M":
    case "m":
    case "L":
    case "l":
      return { cmd: command, x: values[0], y: values[1] };
    case "H":
    case "h":
      return { cmd: command, x: values[0] };
    case "V":
    case "v":
      return { cmd: command, y: values[0] };
    case "C":
    case "c":
      return { cmd: command, x1: values[0], y1: values[1], x2: values[2], y2: values[3], x: values[4], y: values[5] };
    case "Q":
    case "q":
      return { cmd: command, x1: values[0], y1: values[1], x: values[2], y: values[3] };
    case "A":
    case "a":
      return {
        cmd: command,
        rx: values[0],
        ry: values[1],
        xAxisRotation: values[2],
        largeArcFlag: values[3],
        sweepFlag: values[4],
        x: values[5],
        y: values[6],
      };
    case "Z":
    case "z":
      return { cmd: command };
  }
}

function querySegmentFromValues(command: string | undefined, values: number[]): QueryPathSegment {
  if (!command) {
    throw new InkMcpError("INVALID_INPUT", "Path command is missing.");
  }
  assertQueryPathCommand(command);
  switch (command) {
    case "M":
    case "m":
    case "L":
    case "l":
    case "H":
    case "h":
    case "V":
    case "v":
    case "C":
    case "c":
    case "Q":
    case "q":
    case "Z":
    case "z":
      return editableSegmentFromValues(command, values);
    case "S":
    case "s":
      return { cmd: command, x2: values[0], y2: values[1], x: values[2], y: values[3] };
    case "A":
    case "a":
      return {
        cmd: command,
        rx: values[0],
        ry: values[1],
        xAxisRotation: values[2],
        largeArcFlag: values[3],
        sweepFlag: values[4],
        x: values[5],
        y: values[6],
      };
  }
}

function insertPathSegment(segments: EditablePathSegment[], edit: Extract<PathNodeEdit, { type: "insert_segment" }>) {
  if (edit.index > segments.length) {
    throw new InkMcpError("INVALID_INPUT", "Path segment insertion index is out of range.", {
      index: edit.index,
      segmentCount: segments.length,
    });
  }
  segments.splice(edit.index, 0, edit.segment);
}

function deletePathSegment(segments: EditablePathSegment[], segmentIndex: number) {
  const segment = segments[segmentIndex];
  if (!segment) {
    throw new InkMcpError("INVALID_INPUT", "Path segment index is out of range.", {
      segmentIndex,
      segmentCount: segments.length,
    });
  }
  segments.splice(segmentIndex, 1);
  if (segments.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path must retain at least one segment.");
  }
}

function movePathPoint(segments: EditablePathSegment[], edit: Extract<PathNodeEdit, { type: "move_point" }>) {
  const segment = segments[edit.segmentIndex];
  if (!segment) {
    throw new InkMcpError("INVALID_INPUT", "Path segment index is out of range.", {
      segmentIndex: edit.segmentIndex,
      segmentCount: segments.length,
    });
  }

  const dx = edit.dx ?? 0;
  const dy = edit.dy ?? 0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new InkMcpError("INVALID_INPUT", "Path point deltas must be finite.", { dx, dy });
  }

  const point = edit.point;
  if (point === "end") {
    if (segment.cmd === "H" || segment.cmd === "h") {
      if (dy !== 0) {
        throw new InkMcpError("INVALID_INPUT", "H path endpoints cannot move vertically without converting the command.", {
          segmentIndex: edit.segmentIndex,
          command: segment.cmd,
          dy,
        });
      }
      segment.x += dx;
      return;
    }
    if (segment.cmd === "V" || segment.cmd === "v") {
      if (dx !== 0) {
        throw new InkMcpError("INVALID_INPUT", "V path endpoints cannot move horizontally without converting the command.", {
          segmentIndex: edit.segmentIndex,
          command: segment.cmd,
          dx,
        });
      }
      segment.y += dy;
      return;
    }
    if (!("x" in segment) || !("y" in segment)) {
      throw new InkMcpError("INVALID_INPUT", "Selected path segment has no endpoint.", {
        segmentIndex: edit.segmentIndex,
        command: segment.cmd,
      });
    }
    segment.x += dx;
    segment.y += dy;
    return;
  }

  if (point === "c1") {
    if (!("x1" in segment)) {
      throw new InkMcpError("INVALID_INPUT", "Selected path segment has no c1 control point.", {
        segmentIndex: edit.segmentIndex,
        command: segment.cmd,
      });
    }
    segment.x1 += dx;
    segment.y1 += dy;
    return;
  }

  if (!("x2" in segment)) {
    throw new InkMcpError("INVALID_INPUT", "Selected path segment has no c2 control point.", {
      segmentIndex: edit.segmentIndex,
      command: segment.cmd,
    });
  }
  segment.x2 += dx;
  segment.y2 += dy;
}

function setPathPointAbsolute(
  segments: EditablePathSegment[],
  edit: Extract<PathNodeEdit, { type: "set_point_absolute" }>,
) {
  setPathPointFromTarget(segments, edit, "absolute");
}

function setPathPointRelative(
  segments: EditablePathSegment[],
  edit: Extract<PathNodeEdit, { type: "set_point_relative" }>,
) {
  setPathPointFromTarget(segments, edit, "relative");
}

function setPathPointFromTarget(
  segments: EditablePathSegment[],
  edit: Extract<PathNodeEdit, { type: "set_point_absolute" | "set_point_relative" }>,
  targetMode: "absolute" | "relative",
) {
  const segment = segments[edit.segmentIndex];
  if (!segment) {
    throw new InkMcpError("INVALID_INPUT", "Path segment index is out of range.", {
      segmentIndex: edit.segmentIndex,
      segmentCount: segments.length,
    });
  }
  if (!Number.isFinite(edit.x) || !Number.isFinite(edit.y)) {
    throw new InkMcpError("INVALID_INPUT", "Path point target coordinates must be finite.", {
      x: edit.x,
      y: edit.y,
    });
  }

  const point = currentEditablePoint(segments, edit);
  const target =
    targetMode === "absolute"
      ? { x: edit.x, y: edit.y }
      : { x: point.base.x + edit.x, y: point.base.y + edit.y };
  const nextPoint = point.relative
    ? { x: target.x - point.base.x, y: target.y - point.base.y }
    : target;

  assignPathPoint(segment, edit.point, nextPoint, point);
}

function currentEditablePoint(
  segments: EditablePathSegment[],
  edit: { segmentIndex: number; point: EditablePathPoint },
): { base: { x: number; y: number }; relative: boolean } {
  const info = (describePathSegments(segments) as EditablePathSegmentInfo[])[edit.segmentIndex];
  if (!info) {
    throw new InkMcpError("INVALID_INPUT", "Path segment index is out of range.", {
      segmentIndex: edit.segmentIndex,
      segmentCount: segments.length,
    });
  }
  const rawPoint = info.points[edit.point];
  const absolutePoint = info.absolutePoints[edit.point];
  if (!rawPoint || !absolutePoint) {
    throw new InkMcpError("INVALID_INPUT", `Selected path segment has no ${edit.point} point.`, {
      segmentIndex: edit.segmentIndex,
      command: info.cmd,
      point: edit.point,
    });
  }
  return {
    base: editableSegmentBase(segments, edit.segmentIndex),
    relative: info.relative,
  };
}

function editableSegmentBase(segments: EditablePathSegment[], segmentIndex: number): { x: number; y: number } {
  let current = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };

  for (let index = 0; index < segmentIndex; index += 1) {
    const segment = segments[index];
    const relative = isRelativeCommand(segment.cmd);
    switch (segment.cmd) {
      case "M":
      case "m":
      case "L":
      case "l":
        current = resolvePathPoint(current, { x: segment.x, y: segment.y }, relative);
        if (segment.cmd === "M" || segment.cmd === "m") {
          subpathStart = current;
        }
        break;
      case "H":
      case "h":
        current = {
          x: relative ? current.x + segment.x : segment.x,
          y: current.y,
        };
        break;
      case "V":
      case "v":
        current = {
          x: current.x,
          y: relative ? current.y + segment.y : segment.y,
        };
        break;
      case "C":
      case "c":
      case "Q":
      case "q":
      case "A":
      case "a":
        current = resolvePathPoint(current, { x: segment.x, y: segment.y }, relative);
        break;
      case "Z":
      case "z":
        current = subpathStart;
        break;
    }
  }

  return current;
}

function assignPathPoint(
  segment: EditablePathSegment,
  point: EditablePathPoint,
  value: { x: number; y: number },
  context: { base: { x: number; y: number }; relative: boolean },
): void {
  if (point === "end") {
    if (segment.cmd === "H" || segment.cmd === "h") {
      const representedY = context.relative ? 0 : context.base.y;
      if (!samePathCoordinate(value.y, representedY)) {
        throw new InkMcpError("INVALID_INPUT", "H path endpoints cannot change y without converting the command.", {
          command: segment.cmd,
          y: value.y,
          representedY,
        });
      }
      segment.x = value.x;
      return;
    }
    if (segment.cmd === "V" || segment.cmd === "v") {
      const representedX = context.relative ? 0 : context.base.x;
      if (!samePathCoordinate(value.x, representedX)) {
        throw new InkMcpError("INVALID_INPUT", "V path endpoints cannot change x without converting the command.", {
          command: segment.cmd,
          x: value.x,
          representedX,
        });
      }
      segment.y = value.y;
      return;
    }
    if (!("x" in segment) || !("y" in segment)) {
      throw new InkMcpError("INVALID_INPUT", "Selected path segment has no endpoint.", {
        command: segment.cmd,
      });
    }
    segment.x = value.x;
    segment.y = value.y;
    return;
  }

  if (point === "c1") {
    if (!("x1" in segment)) {
      throw new InkMcpError("INVALID_INPUT", "Selected path segment has no c1 control point.", {
        command: segment.cmd,
      });
    }
    segment.x1 = value.x;
    segment.y1 = value.y;
    return;
  }

  if (!("x2" in segment)) {
    throw new InkMcpError("INVALID_INPUT", "Selected path segment has no c2 control point.", {
      command: segment.cmd,
    });
  }
  segment.x2 = value.x;
  segment.y2 = value.y;
}

function samePathCoordinate(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

function isRelativeCommand(command: QueryPathSegment["cmd"]): boolean {
  if (command === "Z" || command === "z") return false;
  return command === command.toLowerCase() && command !== command.toUpperCase();
}

function resolvePathPoint(base: { x: number; y: number }, point: { x: number; y: number }, relative: boolean) {
  return relative ? { x: base.x + point.x, y: base.y + point.y } : point;
}

function queryPathPoints(segment: QueryPathSegment): EditablePathPoint[] {
  switch (segment.cmd) {
    case "M":
    case "m":
    case "L":
    case "l":
    case "H":
    case "h":
    case "V":
    case "v":
    case "A":
    case "a":
      return ["end"];
    case "C":
    case "c":
      return ["c1", "c2", "end"];
    case "S":
    case "s":
      return ["c2", "end"];
    case "Q":
    case "q":
      return ["c1", "end"];
    case "Z":
    case "z":
      return [];
  }
}

function availablePathPoints(segment: QueryPathSegment): EditablePathPoint[] {
  if (segment.cmd === "S" || segment.cmd === "s") return [];
  return queryPathPoints(segment);
}
