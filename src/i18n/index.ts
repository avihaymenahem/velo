import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import commonEN from "./locales/en/common.json";
import sidebarEN from "./locales/en/sidebar.json";
import emailEN from "./locales/en/email.json";
import composerEN from "./locales/en/composer.json";
import settingsEN from "./locales/en/settings.json";
import searchEN from "./locales/en/search.json";
import accountsEN from "./locales/en/accounts.json";
import tasksEN from "./locales/en/tasks.json";
import notificationsEN from "./locales/en/notifications.json";

import commonIT from "./locales/it/common.json";
import sidebarIT from "./locales/it/sidebar.json";
import emailIT from "./locales/it/email.json";
import composerIT from "./locales/it/composer.json";
import settingsIT from "./locales/it/settings.json";
import searchIT from "./locales/it/search.json";
import accountsIT from "./locales/it/accounts.json";
import tasksIT from "./locales/it/tasks.json";
import notificationsIT from "./locales/it/notifications.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "it", name: "Italiano" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEN,
        sidebar: sidebarEN,
        email: emailEN,
        composer: composerEN,
        settings: settingsEN,
        search: searchEN,
        accounts: accountsEN,
        tasks: tasksEN,
        notifications: notificationsEN,
      },
      it: {
        common: commonIT,
        sidebar: sidebarIT,
        email: emailIT,
        composer: composerIT,
        settings: settingsIT,
        search: searchIT,
        accounts: accountsIT,
        tasks: tasksIT,
        notifications: notificationsIT,
      },
    },
    supportedLngs: ["en", "it"],
    load: "languageOnly",
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    lng: "en",
  });

/**
 * Detect the OS system locale via Tauri plugin-os.
 * Falls back to navigator.language if Tauri is not available (e.g. in tests).
 */
async function detectSystemLanguage(): Promise<string> {
  try {
    const { locale } = await import("@tauri-apps/plugin-os");
    const osLocale = await locale();
    if (osLocale) {
      return osLocale.split("-")[0]!;
    }
  } catch {
    // Tauri not available (tests, plain browser)
  }
  return navigator.language?.split("-")[0] ?? "en";
}

/**
 * Change the app language and persist it to SQLite settings.
 */
export async function setAppLanguage(lang: SupportedLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  const { setSetting } = await import("@/services/db/settings");
  await setSetting("language", lang);
}

/**
 * Reset to system language (Tauri OS detection) and clear persisted preference.
 */
export async function resetToSystemLanguage(): Promise<void> {
  const { setSetting } = await import("@/services/db/settings");
  await setSetting("language", "system");
  const detected = await detectSystemLanguage();
  const supported = SUPPORTED_LANGUAGES.some((l) => l.code === detected);
  await i18n.changeLanguage(supported ? detected : "en");
}

/**
 * Load persisted language from SQLite. If not set or "system", detect from OS.
 * Call this early in app init, after migrations.
 */
export async function loadPersistedLanguage(): Promise<void> {
  const { getSetting } = await import("@/services/db/settings");
  const saved = await getSetting("language");
  if (saved && saved !== "system" && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
    await i18n.changeLanguage(saved);
  } else {
    // No explicit preference — detect from OS
    const detected = await detectSystemLanguage();
    const supported = SUPPORTED_LANGUAGES.some((l) => l.code === detected);
    await i18n.changeLanguage(supported ? detected : "en");
  }
}

/**
 * Check if the user has explicitly chosen a language (vs using system default).
 */
export async function getPersistedLanguage(): Promise<string | null> {
  const { getSetting } = await import("@/services/db/settings");
  const saved = await getSetting("language");
  if (saved && saved !== "system" && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
    return saved;
  }
  return null;
}

export default i18n;
