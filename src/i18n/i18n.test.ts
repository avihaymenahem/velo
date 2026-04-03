import { describe, it, expect } from "vitest";
import en from "./locales/en.json";
import ja from "./locales/ja.json";

/**
 * Recursively extract all dot-separated key paths from a nested object.
 * e.g. { common: { save: "Save" } } => ["common.save"]
 */
function extractKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...extractKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n translation key parity", () => {
  const enKeys = extractKeys(en as Record<string, unknown>);
  const jaKeys = extractKeys(ja as Record<string, unknown>);

  it("en.json and ja.json have the same set of keys", () => {
    const enSet = new Set(enKeys);
    const jaSet = new Set(jaKeys);

    const missingFromJa = enKeys.filter((k) => !jaSet.has(k));
    const missingFromEn = jaKeys.filter((k) => !enSet.has(k));

    if (missingFromJa.length > 0 || missingFromEn.length > 0) {
      const messages: string[] = [];
      if (missingFromJa.length > 0) {
        messages.push(
          `Keys missing from ja.json:\n  ${missingFromJa.join("\n  ")}`
        );
      }
      if (missingFromEn.length > 0) {
        messages.push(
          `Keys missing from en.json:\n  ${missingFromEn.join("\n  ")}`
        );
      }
      expect.fail(messages.join("\n\n"));
    }
  });

  it("both files have the same number of keys", () => {
    expect(enKeys.length).toBe(jaKeys.length);
  });
});
