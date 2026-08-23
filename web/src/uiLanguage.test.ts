import { describe, expect, it, vi } from "vitest";

import { applyUiLanguage, readUiLanguage, saveUiLanguage } from "./uiLanguage";

describe("UI language preference", () => {
  it.each(["en", "id"] as const)("uses persisted %s before browser language", (language) => {
    const storage = { getItem: vi.fn(() => language) };
    const element = { lang: "" };

    expect(applyUiLanguage(element, storage, language === "en" ? "id-ID" : "en-US")).toBe(language);
    expect(element.lang).toBe(language);
  });

  it("falls back safely and stores only the language preference", () => {
    expect(readUiLanguage({ getItem: () => null }, "id-ID")).toBe("id");
    expect(readUiLanguage({ getItem: () => "unexpected" }, "en-US")).toBe("en");
    const setItem = vi.fn();
    saveUiLanguage("id", { setItem });
    expect(setItem).toHaveBeenCalledWith("heritg_ui_language", "id");
  });
});
