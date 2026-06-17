import { InkMcpError } from "./errors.js";

export type PathSegment =
  | { cmd: "M"; x: number; y: number }
  | { cmd: "L"; x: number; y: number }
  | { cmd: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { cmd: "Q"; x1: number; y1: number; x: number; y: number }
  | { cmd: "Z" };

export type EditablePathSegment =
  | { cmd: "M" | "m"; x: number; y: number }
  | { cmd: "L" | "l"; x: number; y: number }
  | { cmd: "C" | "c"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { cmd: "Q" | "q"; x1: number; y1: number; x: number; y: number }
  | { cmd: "Z" | "z" };

export type EditablePathPoint = "end" | "c1" | "c2";

export type EditablePathPointMap = Partial<Record<EditablePathPoint, { x: number; y: number }>>;

export interface EditablePathSegmentInfo {
  index: number;
  cmd: EditablePathSegment["cmd"];
  relative: boolean;
  raw: EditablePathSegment;
  availablePoints: EditablePathPoint[];
  points: EditablePathPointMap;
  absolutePoints: EditablePathPointMap;
}

export type PathNodeEdit =
  | {
      type: "move_point";
      segmentIndex: number;
      point: EditablePathPoint;
      dx?: number;
      dy?: number;
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
}

type PathToken = { type: "command" | "number"; value: string };

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
      case "C":
      case "c":
        return `${segment.cmd}${formatPathNumber(segment.x1)} ${formatPathNumber(segment.y1)} ${formatPathNumber(segment.x2)} ${formatPathNumber(segment.y2)} ${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "Q":
      case "q":
        return `${segment.cmd}${formatPathNumber(segment.x1)} ${formatPathNumber(segment.y1)} ${formatPathNumber(segment.x)} ${formatPathNumber(segment.y)}`;
      case "Z":
      case "z":
        return segment.cmd;
    }
  }).join(" ");
}

export function parseEditablePathData(pathData: string): EditablePathSegment[] {
  validatePathData(pathData, { requireMoveTo: true });
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

export function describeEditablePathData(pathData: string): EditablePathSegmentInfo[] {
  const segments = parseEditablePathData(pathData);
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
      case "Q":
      case "q":
        points.c1 = { x: segment.x1, y: segment.y1 };
        points.end = { x: segment.x, y: segment.y };
        absolutePoints.c1 = resolvePathPoint(base, points.c1, relative);
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
      raw: segment,
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
    throw new InkMcpError("INVALID_INPUT", "Path data must not be empty.");
  }

  const tokens = tokenizePathData(trimmed);
  if (tokens[0]?.type !== "command") {
    throw new InkMcpError("INVALID_INPUT", "Path data must start with an SVG path command.");
  }
  if (options.requireMoveTo !== false && !["M", "m"].includes(tokens[0].value)) {
    throw new InkMcpError("INVALID_INPUT", "Complete path data must start with M or m.");
  }

  let index = 0;
  let currentCommand: string | undefined;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "command") {
      currentCommand = token.value;
      index += 1;
      if (commandParamCounts[currentCommand] === 0) continue;
    } else if (!currentCommand) {
      throw new InkMcpError("INVALID_INPUT", "Path number appeared before any command.");
    }

    const paramCount = currentCommand ? commandParamCounts[currentCommand] : undefined;
    if (paramCount === undefined) {
      throw new InkMcpError("INVALID_INPUT", "Unsupported SVG path command.", { command: currentCommand });
    }
    if (paramCount === 0) {
      throw new InkMcpError("INVALID_INPUT", "Close-path command cannot be followed by implicit numbers.");
    }

    let consumed = 0;
    while (index < tokens.length && tokens[index].type !== "command") {
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        const value = tokens[index];
        if (!value || value.type !== "number") {
          throw new InkMcpError("INVALID_INPUT", "Path command has an incomplete parameter set.", {
            command: currentCommand,
          });
        }
        index += 1;
      }
      consumed += paramCount;
      if (currentCommand === "M") currentCommand = "L";
      if (currentCommand === "m") currentCommand = "l";
    }

    if (consumed === 0) {
      throw new InkMcpError("INVALID_INPUT", "Path command has no parameters.", { command: currentCommand });
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

function tokenizePathData(pathData: string): PathToken[] {
  const tokens: PathToken[] = [];
  pathTokenPattern.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pathTokenPattern.exec(pathData)) !== null) {
    const gap = pathData.slice(cursor, match.index);
    if (!/^[\s,]*$/.test(gap)) {
      throw new InkMcpError("INVALID_INPUT", "Path data contains invalid characters.");
    }

    const value = match[0];
    if (commandTokenPattern.test(value)) {
      tokens.push({ type: "command", value });
    } else if (numberTokenPattern.test(value)) {
      tokens.push({ type: "number", value });
    } else {
      throw new InkMcpError("INVALID_INPUT", "Path data contains an invalid token.", { token: value });
    }
    cursor = match.index + value.length;
  }

  if (!/^[\s,]*$/.test(pathData.slice(cursor))) {
    throw new InkMcpError("INVALID_INPUT", "Path data contains invalid trailing characters.");
  }
  if (tokens.length === 0) {
    throw new InkMcpError("INVALID_INPUT", "Path data must contain at least one command.");
  }

  return tokens;
}

function formatPathNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new InkMcpError("INVALID_INPUT", "Path segment numbers must be finite.", { value });
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function assertEditablePathCommand(command: string): asserts command is EditablePathSegment["cmd"] {
  if (!["M", "m", "L", "l", "C", "c", "Q", "q", "Z", "z"].includes(command)) {
    throw new InkMcpError("INVALID_INPUT", "edit_path_nodes supports only M, L, C, Q, and Z path commands.", {
      command,
    });
  }
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
    case "C":
    case "c":
      return { cmd: command, x1: values[0], y1: values[1], x2: values[2], y2: values[3], x: values[4], y: values[5] };
    case "Q":
    case "q":
      return { cmd: command, x1: values[0], y1: values[1], x: values[2], y: values[3] };
    case "Z":
    case "z":
      return { cmd: command };
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
    if (!("x" in segment)) {
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

function isRelativeCommand(command: EditablePathSegment["cmd"]): boolean {
  if (command === "Z" || command === "z") return false;
  return command === command.toLowerCase() && command !== command.toUpperCase();
}

function resolvePathPoint(base: { x: number; y: number }, point: { x: number; y: number }, relative: boolean) {
  return relative ? { x: base.x + point.x, y: base.y + point.y } : point;
}

function availablePathPoints(segment: EditablePathSegment): EditablePathPoint[] {
  switch (segment.cmd) {
    case "M":
    case "m":
    case "L":
    case "l":
      return ["end"];
    case "C":
    case "c":
      return ["c1", "c2", "end"];
    case "Q":
    case "q":
      return ["c1", "end"];
    case "Z":
    case "z":
      return [];
  }
}
