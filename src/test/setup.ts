import "@testing-library/jest-dom/vitest";

// Initialize i18next with English translations for tests
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../i18n/locales/en.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- initImmediate is a valid i18next option but missing from strict types
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  initImmediate: false,
} as any);
