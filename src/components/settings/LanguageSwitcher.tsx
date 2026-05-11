import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LOCALE_NAMES, changeLanguage } from "@/locales";
import type { SupportedLocale } from "@/locales";
import { useUIStore } from "@/stores/uiStore";
import { saveLocale } from "@/services/i18nService";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);

  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm text-text-secondary">{t("settings.language")}</span>
        <p className="text-xs text-text-tertiary mt-0.5">
          {t("settings.languageDescription")}
        </p>
      </div>
      <select
        value={locale}
        onChange={(e) => {
          const val = e.target.value as SupportedLocale;
          changeLanguage(val);
          setLocale(val);
          saveLocale(val);
        }}
        className="w-48 bg-bg-tertiary text-text-primary text-sm px-3 py-1.5 rounded-md border border-border-primary focus:border-accent outline-none"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
