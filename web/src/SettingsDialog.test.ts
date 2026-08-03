import { describe, expect, it } from "vitest";

import { archivePasswordIsReady } from "./SettingsDialog";

describe("encrypted backup password validation", () => {
  it("allows both password fields to be empty", () => {
    expect(archivePasswordIsReady("", "")).toBe(true);
  });

  it("requires matching non-empty passwords with at least 15 NFC code points", () => {
    expect(archivePasswordIsReady("short", "short")).toBe(false);
    expect(archivePasswordIsReady("long enough pass", "different pass!!")).toBe(false);
    expect(archivePasswordIsReady("long enough pass", "long enough pass")).toBe(true);
  });
});
