# Architecture Overview

## Three-Layer Architecture

```
+--------------------------+
|     React 19 + Zustand   |   UI Layer (src/components/, src/stores/)
|  Components + 12 Stores  |
+--------------------------+
|     Service Layer         |   Business Logic (src/services/)
|  DB / Email / AI / Sync   |
|  Campaigns / Workflows /  |
|  PGP / Contacts / etc.    |
+--------------------------+
|     Tauri v2 + Rust       |   Native Layer (src-tauri/)
|  System / IMAP / SMTP /   |
|  SQLite / PGP / OAuth     |
+--------------------------+
```

Communication: UI calls service functions directly (in-process). Services call Rust via `@tauri-apps/api/core` `invoke()` for IMAP, SMTP, PGP, and CSV parsing. State is managed by Zustand stores that subscribe components to reactive slices.

## Zustand Stores

12 stores in `src/stores/` — synchronous, no middleware:

| Store | Purpose |
|-------|---------|
| `uiStore` | Theme, locale, sidebar, layout, online status |
| `accountStore` | Account list, active account |
| `threadStore` | Thread list, selection, loading |
| `composerStore` | Compose state |
| `labelStore` | Labels CRUD |
| `contextMenuStore` | Right-click menu |
| `shortcutStore` | Custom keyboard bindings |
| `smartFolderStore` | Saved searches |
| `taskStore` | Tasks, filters, grouping |
| `campaignStore` | Campaigns and stats |
| `contactStore` | Contact list/filter (if added) |
| `calendarStore` | Calendar events |

Test pattern: `useStore.setState()` in `beforeEach`, assert via `.getState()`.

## i18n Approach

- `i18next` + `react-i18next` with JSON locale files
- 3 locales: `en`, `fr`, `ar` (LTR + RTL)
- `uiStore.locale` + `uiStore.textDirection` persisted to SQLite settings
- Browser locale auto-detected on first launch
- Components use `useTranslation()` hook with dot-notation keys

## Database Migration System

Version-tracked in `_migrations` table. Migrations defined as an array in `src/services/db/migrations.ts` (27 migrations, transactional). Custom `splitStatements()` handles `BEGIN...END` blocks inside triggers. Run on every startup via `runMigrations()`.

```ts
{ version: 27, description: "PGP encryption keys", sql: `CREATE TABLE ...` }
```

## Available Tauri Commands

### Core
`start_oauth_server`, `close_splashscreen`, `set_tray_tooltip`, `open_devtools`

### IMAP (11)
`imap_test_connection`, `imap_list_folders`, `imap_fetch_messages`, `imap_fetch_new_uids`, `imap_fetch_message_body`, `imap_set_flags`, `imap_move_messages`, `imap_delete_messages`, `imap_get_folder_status`, `imap_fetch_attachment`, `imap_append_message`

### SMTP (2)
`smtp_send_email`, `smtp_test_connection`

### Contacts
`parse_csv` (Rust CSV parser with flexible column mapping)

### PGP (3)
`generate_key`, `get_key_info_cmd`, `encrypt`

## How to Add a New Feature

1. **Create migration** — add entry in `src/services/db/migrations.ts`
2. **Create DB service** — add file in `src/services/db/` for SQL queries
3. **Create service layer** — add file in `src/services/` with business logic
4. **Create store** — add Zustand store in `src/stores/`
5. **Create components** — add UI in `src/components/`
6. **Wire in SettingsPage** — add tab + section if it's a configuration feature
7. **Document** — run `/document-feature` to add help card and update docs
8. **Add Tauri capabilities** — if new Rust commands are needed, add permissions in `src-tauri/capabilities/default.json`

## Key Conventions

- Services are plain async functions (not classes), except `GmailClient`
- All email modifications go through `emailActions.ts` (offline-aware)
- All sync/send goes through `EmailProvider` abstraction
- Tests are colocated with source files (`file.test.ts` next to `file.ts`)
- TypeScript strict mode: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- Path alias: `@/*` maps to `src/*`
- No comments in code unless necessary
