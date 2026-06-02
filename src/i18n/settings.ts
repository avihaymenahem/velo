import i18next from "i18next";
import { getSetting, setSetting } from "@/services/db/settings";
import {
  LANGUAGE_SETTING_KEY,
  getSystemLanguage,
  isLanguagePreference,
  resolveLanguagePreference,
  type LanguagePreference,
  type SupportedLanguage,
} from "./language";

function setDocumentLanguage(language: SupportedLanguage): void {
  document.documentElement.lang = language;
}

export async function getLanguagePreference(): Promise<LanguagePreference> {
  const stored = await getSetting(LANGUAGE_SETTING_KEY);
  return isLanguagePreference(stored) ? stored : "system";
}

export async function applyLanguagePreference(
  preference: LanguagePreference,
  systemLanguage = getSystemLanguage(),
): Promise<SupportedLanguage> {
  const language = resolveLanguagePreference(preference, systemLanguage);
  await i18next.changeLanguage(language);
  setDocumentLanguage(language);
  return language;
}

export async function initializeLanguageFromSettings(): Promise<SupportedLanguage> {
  const preference = await getLanguagePreference();
  return applyLanguagePreference(preference);
}

export async function saveLanguagePreference(preference: LanguagePreference): Promise<SupportedLanguage> {
  await setSetting(LANGUAGE_SETTING_KEY, preference);
  return applyLanguagePreference(preference);
}
