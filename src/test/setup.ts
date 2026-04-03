import "@testing-library/jest-dom/vitest";

// Initialize i18next with English translations for tests
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../i18n/locales/en.json";

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
