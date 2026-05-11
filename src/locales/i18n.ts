import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en/translation.json";
import fr from "./fr/translation.json";
import ar from "./ar/translation.json";

export const SUPPORTED_LOCALES = ["en", "fr", "ar"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

export const LOCALE_DIRS: Record<SupportedLocale, "ltr" | "rtl"> = {
  en: "ltr",
  fr: "ltr",
  ar: "rtl",
};

export function getBrowserLocale(): SupportedLocale {
  const browserLangs = navigator.languages ?? [navigator.language];
  for (const lang of browserLangs) {
    const code = lang.split("-")[0] as SupportedLocale;
    if (SUPPORTED_LOCALES.includes(code)) return code;
  }
  return "en";
}

let initialized = false;

export async function initI18n(language?: string): Promise<typeof i18n> {
  if (initialized) return i18n;

  const lng = language ?? getBrowserLocale();

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
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

export function changeLanguage(lng: SupportedLocale): void {
  i18n.changeLanguage(lng);
}

export { i18n };
