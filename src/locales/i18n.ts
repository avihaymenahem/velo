import { useState, useEffect } from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en/translation.json";
import fr from "./fr/translation.json";
import ar from "./ar/translation.json";
import ja from "./ja/translation.json";
import it from "./it/translation.json";

export const SUPPORTED_LOCALES = ["en", "fr", "ar", "ja", "it"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
  ja: "日本語",
  it: "Italiano",
};

export const LOCALE_DIRS: Record<SupportedLocale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
  ja: "ltr",
  it: "ltr",
};

export function getBrowserLocale(): SupportedLocale {
  const browserLangs = navigator.languages ?? [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.split("-")[0] as SupportedLocale;
    if (SUPPORTED_LOCALES.includes(code)) return code;
  }
  return "en";
}

let initPromise: Promise<typeof i18n> | null = null;
let initialized = false;

export async function initI18n(language?: string): Promise<typeof i18n> {
  if (initPromise) return initPromise;
  initPromise = doInit(language);
  return initPromise;
}

async function doInit(language?: string): Promise<typeof i18n> {
  if (initialized) return i18n;

  const lng = language ?? getBrowserLocale();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
      ja: { translation: ja },
      it: { translation: it },
    },
    lng,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });

  initialized = true;
  return i18n;
}

export async function changeLanguage(lng: SupportedLocale): Promise<void> {
  if (!initialized) {
    await initI18n();
  }
  return i18n.changeLanguage(lng) as Promise<void>;
}

export function useI18nReady(): boolean {
  const [ready, setReady] = useState(initialized);
  useEffect(() => {
    if (!initialized) {
      initI18n().then(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);
  return ready;
}

export { i18n };
