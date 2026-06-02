export const LANGUAGE_SETTING_KEY = "language";

export const supportedLanguages = ["en", "zh-CN"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];
export type LanguagePreference = "system" | SupportedLanguage;

const languagePreferences = ["system", ...supportedLanguages] as const;

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return supportedLanguages.includes(value as SupportedLanguage);
}

export function isLanguagePreference(value: string | null | undefined): value is LanguagePreference {
  return languagePreferences.includes(value as LanguagePreference);
}

export function getSystemLanguage(): string {
  return navigator.languages?.[0] ?? navigator.language ?? "en";
}

export function normalizeLanguageTag(languageTag: string | null | undefined): SupportedLanguage {
  const normalized = languageTag?.toLowerCase() ?? "";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return "en";
}

export function resolveLanguagePreference(
  preference: LanguagePreference,
  systemLanguage = getSystemLanguage(),
): SupportedLanguage {
  if (isSupportedLanguage(preference)) return preference;
  return normalizeLanguageTag(systemLanguage);
}
