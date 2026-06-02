import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultNamespace, namespaces, resources } from "./resources";
import { getSystemLanguage, resolveLanguagePreference } from "./language";

const initialLanguage = resolveLanguagePreference("system", getSystemLanguage());

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  defaultNS: defaultNamespace,
  ns: namespaces,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

document.documentElement.lang = initialLanguage;

export default i18n;
