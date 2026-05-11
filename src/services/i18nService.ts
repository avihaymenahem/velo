import { getSetting, setSetting } from "@/services/db/settings";
import { SUPPORTED_LOCALES } from "@/locales";
import type { SupportedLocale } from "@/locales";

export async function loadSavedLocale(): Promise<SupportedLocale | null> {
  const saved = await getSetting("locale");
  if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) {
    return saved as SupportedLocale;
  }
  return null;
}

export async function saveLocale(locale: SupportedLocale): Promise<void> {
  await setSetting("locale", locale);
}
