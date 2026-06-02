import i18n from "./index";
import {
  LANGUAGE_SETTING_KEY,
  isLanguagePreference,
  resolveLanguagePreference,
} from "./language";
import { resources } from "./resources";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .filter(Boolean);
}

describe("i18n foundation", () => {
  it("keeps English and Simplified Chinese locale keys in sync", () => {
    const englishNamespaces = Object.keys(resources.en);
    const chineseNamespaces = Object.keys(resources["zh-CN"]);

    expect(chineseNamespaces).toEqual(englishNamespaces);

    for (const namespace of englishNamespaces) {
      const englishKeys = flattenKeys(resources.en[namespace]).sort();
      const chineseKeys = flattenKeys(resources["zh-CN"][namespace]).sort();
      expect(chineseKeys).toEqual(englishKeys);
    }
  });

  it("resolves supported and system language preferences", () => {
    expect(LANGUAGE_SETTING_KEY).toBe("language");
    expect(isLanguagePreference("system")).toBe(true);
    expect(isLanguagePreference("en")).toBe(true);
    expect(isLanguagePreference("zh-CN")).toBe(true);
    expect(isLanguagePreference("ja")).toBe(false);

    expect(resolveLanguagePreference("en", "zh-CN")).toBe("en");
    expect(resolveLanguagePreference("zh-CN", "en-US")).toBe("zh-CN");
    expect(resolveLanguagePreference("system", "zh-Hans-CN")).toBe("zh-CN");
    expect(resolveLanguagePreference("system", "fr-FR")).toBe("en");
  });

  it("initializes i18next with English fallback and Chinese strings", () => {
    expect(i18n.t("common:actions.save", { lng: "en" })).toBe("Save");
    expect(i18n.t("common:actions.save", { lng: "zh-CN" })).toBe("保存");
    expect(i18n.t("settings:language.label", { lng: "zh-CN" })).toBe("语言");
  });

  it("formats localized counts with the active plural rules", () => {
    expect(i18n.t("email:list.conversationCount", { count: 1, lng: "en" })).toBe(
      "1 conversation",
    );
    expect(i18n.t("email:list.conversationCount", { count: 2, lng: "en" })).toBe(
      "2 conversations",
    );
    expect(i18n.t("email:list.conversationCount", { count: 2, lng: "zh-CN" })).toBe(
      "2 个会话",
    );
  });
});
