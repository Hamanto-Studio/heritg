import type { AppData } from "./types";

const UI_LANGUAGE_KEY = "heritg_ui_language";

export const readUiLanguage = (
  storage: Pick<Storage, "getItem"> = localStorage,
  browserLanguage = navigator.language
): AppData["language"] => {
  try {
    const stored = storage.getItem(UI_LANGUAGE_KEY);
    if (stored === "en" || stored === "id") return stored;
  } catch {
    // Browser privacy settings can make localStorage unavailable.
  }
  return browserLanguage.toLowerCase().startsWith("id") ? "id" : "en";
};

export const saveUiLanguage = (
  language: AppData["language"],
  storage: Pick<Storage, "setItem"> = localStorage
): void => {
  try {
    storage.setItem(UI_LANGUAGE_KEY, language);
  } catch {
    // The encrypted app state remains authoritative if this preference cannot be written.
  }
};

export const applyUiLanguage = (
  documentElement: Pick<HTMLElement, "lang">,
  storage: Pick<Storage, "getItem"> = localStorage,
  browserLanguage = navigator.language
): AppData["language"] => {
  const language = readUiLanguage(storage, browserLanguage);
  documentElement.lang = language;
  return language;
};
