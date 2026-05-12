# i18n & Localization

## Supported Locales

| Locale | Code | Direction |
|--------|------|-----------|
| English | `en` | LTR |
| French | `fr` | LTR |
| Arabic | `ar` | RTL |
| Japanese | `ja` | LTR |
| Italian | `it` | LTR |
| Japanese | `ja` | LTR | ✅ |
| Italian | `it` | LTR | ✅ |

## Locale Directory Structure

```
src/locales/
├── i18n.ts              # i18next init, SUPPORTED_LOCALES, LOCALE_DIRS
├── index.ts             # Re-exports
├── en/translation.json  # English strings
├── fr/translation.json  # French strings
└── ar/translation.json  # Arabic strings
```

## Usage in Components

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation();
  return <p>{t("nav.inbox")}</p>;
}
```

Nested keys use dot notation: `t("thread.unread")`, `t("settings.language")`. Interpolation: `t("nav.nMore", { n: 5 })`.

## Adding a New Locale

1. Create `src/locales/{code}/translation.json` with translated strings
2. Add the code to `SUPPORTED_LOCALES` in `src/locales/i18n.ts`
3. Add label + direction to `LOCALE_NAMES` and `LOCALE_DIRS`
4. Import and register the JSON in `initI18n()` resources
5. Add font stack to `src/styles/globals.css` if the script needs it (e.g., Tajawal for Arabic)

## RTL Support

- `uiStore.textDirection` is set automatically from `LOCALE_DIRS` when switching locales
- Applied to `<html>` as `dir="rtl"` — Tailwind v4 handles layout mirroring natively
- TipTap composer supports `dir="rtl"` via the `textAlign` extension

## Language Persistence

Locale is stored in the SQLite `settings` table:

```ts
setSetting("locale", locale);       // save
getSetting("locale");               // restore on startup
getBrowserLocale();                 // fallback to navigator.language
```

`initI18n()` is called early in `App.tsx` startup, before components render. The saved locale is read from settings; if none found, the browser locale is auto-detected.
