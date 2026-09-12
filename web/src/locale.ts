export const APP_LANGUAGES = ["en", "id", "ms"] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" && APP_LANGUAGES.includes(value as AppLanguage);

export const browserAppLanguage = (value = typeof navigator === "undefined" ? "en" : navigator.language): AppLanguage => {
  const base = value.toLowerCase().split(/[-_]/)[0];
  return isAppLanguage(base) ? base : "en";
};

export const localeForLanguage = (language: AppLanguage): string =>
  ({ en: "en-US", id: "id-ID", ms: "ms-MY" })[language];
