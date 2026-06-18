import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildActiveWindowAttributeSyncActions,
  companionPushGuiStateAction,
  unsafeActiveWindowRefreshEnv,
} from "../src/adapters/inkscape-cli.js";

describe("InkscapeCli", () => {
  let previousUnsafeRefresh: string | undefined;

  beforeEach(() => {
    previousUnsafeRefresh = process.env[unsafeActiveWindowRefreshEnv];
    delete process.env[unsafeActiveWindowRefreshEnv];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousUnsafeRefresh === undefined) {
      delete process.env[unsafeActiveWindowRefreshEnv];
    } else {
      process.env[unsafeActiveWindowRefreshEnv] = previousUnsafeRefresh;
    }
  });

  it("builds direct active-window attribute sync actions without reloading the document", () => {
    expect(
      buildActiveWindowAttributeSyncActions([
        { elementId: "fish-body", attributeName: "fill", value: "#22c55e" },
        { elementId: "fish-tail", attributeName: "stroke", value: "#15803d" },
      ]),
    ).toBe(
      "select-clear;select-by-id:fish-body;object-set-attribute:fill,#22c55e;select-clear;select-by-id:fish-tail;object-set-attribute:stroke,#15803d;select-clear",
    );
  });

  it("uses the registered companion action id for GUI state push", () => {
    expect(companionPushGuiStateAction).toBe("dev.hydens.inksmcp.push-gui-state.noprefs");
  });
});
