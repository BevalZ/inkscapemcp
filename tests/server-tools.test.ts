import { describe, expect, it } from "vitest";

import { createServer } from "../src/server.js";

describe("MCP tool registration", () => {
  it("registers validate_path_data", () => {
    const server = createServer() as unknown as { _registeredTools?: Record<string, unknown> };

    expect(server._registeredTools).toHaveProperty("validate_path_data");
  });
});
