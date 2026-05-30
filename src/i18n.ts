/**
 * Minimal i18n helper.
 *
 * Usage:
 *   import { t } from "@/i18n";
 *   t("sidebar.nav.inbox")                               // → "Inbox"
 *   t("threadView.messageCountPlural", { count: 5 })    // → "5 messages in this thread"
 *
 * Keys are nested paths (dot-separated) into public/locale/en-US.json.
 * Placeholders in values use {name} syntax and are replaced from the params object.
 */

// Import locale JSON directly — Vite resolves this at build-time.
import enUS from "../public/locale/en-US.json";
import itIT from "../public/locale/it-IT.json";

const LOCALES: Record<string, Record<string, unknown>> = {
  "en-US": enUS as Record<string, unknown>,
  "it-IT": itIT as Record<string, unknown>,
};

// Read from localStorage synchronously so module-level t() calls (e.g. ALL_NAV_ITEMS in Sidebar)
// already use the saved locale before any async DB read in App.tsx.
const _saved = typeof localStorage !== "undefined" ? localStorage.getItem("ui_language") : null;
let currentLocale: Record<string, unknown> = (_saved && LOCALES[_saved]) ? LOCALES[_saved] : (enUS as Record<string, unknown>);

export function setLocale(locale: string): void {
  currentLocale = LOCALES[locale] ?? (enUS as Record<string, unknown>);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("ui_language", locale);
  }
}

export function getLocale(): string {
  for (const [key, val] of Object.entries(LOCALES)) {
    if (val === currentLocale) return key;
  }
  return "en-US";
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const raw =
    getNestedValue(currentLocale, key) ??
    getNestedValue(enUS as Record<string, unknown>, key);
  if (raw === undefined) {
    // Fallback: return last segment of the key so UI stays readable in dev
    return key.split(".").pop() ?? key;
  }
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name) => {
    const val = params[name];
    return val !== undefined ? String(val) : `{${name}}`;
  });
}
