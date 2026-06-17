export type ErrorCode =
  | "INVALID_INPUT"
  | "UNSAFE_SVG"
  | "PATH_OUTSIDE_WORKSPACE"
  | "DOC_NOT_FOUND"
  | "ID_CONFLICT"
  | "INKSCAPE_UNAVAILABLE"
  | "INKSCAPE_ACTIVE_WINDOW_REFRESH_DISABLED"
  | "INKSCAPE_TIMEOUT"
  | "INKSCAPE_FAILED"
  | "WRITE_FAILED";

export class InkMcpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InkMcpError";
  }
}

export function toErrorPayload(error: unknown) {
  if (error instanceof InkMcpError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  return {
    code: "INVALID_INPUT",
    message: error instanceof Error ? error.message : String(error),
  };
}
