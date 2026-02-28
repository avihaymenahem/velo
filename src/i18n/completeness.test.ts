import { describe, it, expect } from "vitest";

import commonEN from "./locales/en/common.json";
import sidebarEN from "./locales/en/sidebar.json";
import emailEN from "./locales/en/email.json";
import composerEN from "./locales/en/composer.json";
import settingsEN from "./locales/en/settings.json";
import searchEN from "./locales/en/search.json";
import accountsEN from "./locales/en/accounts.json";
import tasksEN from "./locales/en/tasks.json";
import notificationsEN from "./locales/en/notifications.json";
import calendarEN from "./locales/en/calendar.json";
import attachmentsEN from "./locales/en/attachments.json";
import helpEN from "./locales/en/help.json";

import commonIT from "./locales/it/common.json";
import sidebarIT from "./locales/it/sidebar.json";
import emailIT from "./locales/it/email.json";
import composerIT from "./locales/it/composer.json";
import settingsIT from "./locales/it/settings.json";
import searchIT from "./locales/it/search.json";
import accountsIT from "./locales/it/accounts.json";
import tasksIT from "./locales/it/tasks.json";
import notificationsIT from "./locales/it/notifications.json";
import calendarIT from "./locales/it/calendar.json";
import attachmentsIT from "./locales/it/attachments.json";
import helpIT from "./locales/it/help.json";

const namespaces: Record<string, { en: Record<string, unknown>; italiano: Record<string, unknown> }> = {
  common: { en: commonEN, italiano: commonIT },
  sidebar: { en: sidebarEN, italiano: sidebarIT },
  email: { en: emailEN, italiano: emailIT },
  composer: { en: composerEN, italiano: composerIT },
  settings: { en: settingsEN, italiano: settingsIT },
  search: { en: searchEN, italiano: searchIT },
  accounts: { en: accountsEN, italiano: accountsIT },
  tasks: { en: tasksEN, italiano: tasksIT },
  notifications: { en: notificationsEN, italiano: notificationsIT },
  calendar: { en: calendarEN, italiano: calendarIT },
  attachments: { en: attachmentsEN, italiano: attachmentsIT },
  help: { en: helpEN, italiano: helpIT },
};

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...getKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("Translation completeness", () => {
  for (const [ns, { en, italiano }] of Object.entries(namespaces)) {
    describe(`namespace: ${ns}`, () => {
      it("IT should have all keys from EN", () => {
        const enKeys = getKeys(en);
        const itKeys = getKeys(italiano);
        const missing = enKeys.filter((k) => !itKeys.includes(k));
        expect(missing, `IT missing keys: ${missing.join(", ")}`).toEqual([]);
      });

      it("EN should have all keys from IT (no extra keys in IT)", () => {
        const enKeys = getKeys(en);
        const itKeys = getKeys(italiano);
        const extra = itKeys.filter((k) => !enKeys.includes(k));
        expect(extra, `IT has extra keys: ${extra.join(", ")}`).toEqual([]);
      });

      it("should not have empty string values in EN", () => {
        const enKeys = getKeys(en);
        const empty = enKeys.filter((k) => {
          const parts = k.split(".");
          let val: unknown = en;
          for (const p of parts) val = (val as Record<string, unknown>)[p];
          return val === "";
        });
        expect(empty, `EN has empty values: ${empty.join(", ")}`).toEqual([]);
      });

      it("should not have empty string values in IT", () => {
        const itKeys = getKeys(italiano);
        const empty = itKeys.filter((k) => {
          const parts = k.split(".");
          let val: unknown = italiano;
          for (const p of parts) val = (val as Record<string, unknown>)[p];
          return val === "";
        });
        expect(empty, `IT has empty values: ${empty.join(", ")}`).toEqual([]);
      });
    });
  }
});
