# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For deeper reference, see:
- [docs/architecture.md](docs/architecture.md) — full service/component/DB breakdown
- [docs/development.md](docs/development.md) — dev setup, testing, build
- [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) — all keyboard shortcuts

## Context management

Test files (`**/*.test.ts`, `**/*.test.tsx`) are excluded from automatic indexing. When asked to run, write, fix, or review tests, always read the relevant test files explicitly before proceeding.

## Commands

```bash
# Development — starts Tauri app with Vite dev server (port 1420)
npm run tauri dev

# Build production app
npm run tauri build

# Vite dev server only (no Tauri)
npm run dev

# Run all tests (single run)
npm run test

# Run tests in watch mode
npm run test:watch

# Run a single test file
npx vitest run src/stores/uiStore.test.ts

# Type-check only (no emit)
npx tsc --noEmit

# Rust backend only (from src-tauri/)
cargo build
cargo test
```

## Architecture

Tauri v2 desktop app: Rust backend + React 19 frontend communicating via Tauri IPC.

**Rust backend** (`src-tauri/`): System tray, minimize-to-tray, splash screen, OAuth PKCE server (port 17248), single-instance enforcement, autostart. Tauri commands: `start_oauth_server`, `oauth_exchange_token`, `oauth_refresh_token`, `close_splashscreen`, `set_tray_tooltip`, `open_devtools`, 17 IMAP commands (`imap_test_connection`, `imap_list_folders`, `imap_fetch_messages`, `imap_fetch_new_uids`, `imap_search_all_uids`, `imap_fetch_message_body`, `imap_fetch_raw_message`, `imap_set_flags`, `imap_move_messages`, `imap_delete_messages`, `imap_get_folder_status`, `imap_fetch_attachment`, `imap_append_message`, `imap_search_folder`, `imap_sync_folder`, `imap_raw_fetch_diagnostic`, `imap_delta_check`), 2 SMTP commands (`smtp_send_email`, `smtp_test_connection`). Rust IMAP uses `async-imap` + `mail-parser`, SMTP uses `lettre`. Plugins: sql, notification, opener, log, dialog, fs, http, single-instance, autostart, deep-link (`mailto:`), global-shortcut.

**Service layer** (`src/services/`): All business logic. Plain async functions (not classes, except `GmailClient`). Key subdirs: `db/` (SQLite, migrations, FTS5), `email/` (`EmailProvider` abstraction), `gmail/`, `imap/`, `threading/` (JWZ), `ai/` (5 providers: Claude, OpenAI, Gemini, Ollama local, Copilot), `composer/`, `search/`, `filters/`, `queue/`, `tasks/`, `smartLabels/`. Root-level: `emailActions.ts` (offline-aware operations), `badgeManager.ts`, `deepLinkHandler.ts`, `globalShortcut.ts`.

**UI layer** (`src/components/`, `src/stores/`): Nine Zustand stores (`uiStore`, `accountStore`, `threadStore`, `composerStore`, `labelStore`, `contextMenuStore`, `shortcutStore`, `smartFolderStore`, `taskStore`) — simple synchronous state, no middleware.

### Startup sequence (App.tsx)

1. `runMigrations()`
2. Restore persisted settings (theme, sidebar, reading pane, density, font scale, etc.)
3. `shortcutStore.loadKeyMap()`
4. `getAllAccounts()` → init Gmail clients / IMAP providers → `fetchSendAsAliases()` per Gmail account
5. `startBackgroundSync()` (60s), `backfillUncategorizedThreads()`
6. Start checkers: snooze, scheduled send, follow-up, bundles (60s each), queue processor (30s), pre-cache manager (15min)
7. Network status detection (`online`/`offline` → `uiStore.setOnline()`, queue flush on reconnect)
8. `initNotifications()` → `initGlobalShortcut()` → `initDeepLinkHandler()`
9. `updateBadgeCount()` → `close_splashscreen` → show main window

### Database

SQLite via Tauri SQL plugin. 27 migrations (version-tracked in `_migrations`, transactional). Key tables (38 total): `accounts`, `messages` (FTS5 index `messages_fts`, IMAP headers, `auth_results`), `threads` (`is_pinned`, `is_muted`), `thread_labels`, `labels`, `contacts`, `attachments`, `filter_rules`, `scheduled_emails`, `templates`, `signatures`, `settings` (key-value), `ai_cache`, `thread_categories`, `calendar_events`, `follow_up_reminders`, `notification_vips`, `bundle_rules`, `bundled_threads`, `send_as_aliases`, `smart_folders`, `link_scan_results`, `phishing_allowlist`, `quick_steps`, `folder_sync_state` (IMAP UIDVALIDITY/last_uid tracking), `pending_operations` (offline queue), `local_drafts` (offline IMAP drafts), `deleted_imap_uids` (tombstone — prevents re-import of deleted IMAP messages), `writing_style_profiles`, `tasks`, `task_tags`, `smart_label_rules`, `_migrations`.

### Styling

Tailwind CSS v4 — `@theme {}` for custom properties, `@custom-variant dark` in `globals.css`. Dark mode via `<html class="dark">`. Font scale via `font-scale-{small|default|large|xlarge}` on `<html>`.

Semantic tokens: `bg-bg-primary/secondary/tertiary/hover/selected`, `text-text-primary/secondary/tertiary`, `border-border-primary/secondary`, `bg-accent/accent-hover/accent-light`, `bg-danger/warning/success`, `bg-sidebar-bg`, `text-sidebar-text`. Glass effects: `.glass-panel`, `.glass-modal`, `.glass-backdrop`. 8 accent presets in `src/constants/themes.ts`. Icons: `lucide-react`.

## Testing

Vitest + jsdom. `globals: true`. Tests colocated with source. Zustand pattern: `useStore.setState()` in `beforeEach`, assert via `.getState()`. ~132 test files.

## Key Gotchas

- **Tauri SQL plugin config**: `preload` in tauri.conf.json must be an array `["sqlite:velo.db"]` — NOT an object
- **Tauri Emitter trait**: Must `use tauri::Emitter;` to call `.emit()` on windows
- **Tauri capabilities**: Any new plugin needs explicit permissions in `src-tauri/capabilities/default.json`. Windows allow `"main"`, `"splashscreen"`, `"thread-*"` wildcard
- **Tauri window config**: macOS uses `titleBarStyle: "Overlay"`, Windows/Linux removes decorations in Rust. 1200x800 default, 800x600 min
- **Single instance**: `tauri-plugin-single-instance` must be first plugin registered
- **Minimize-to-tray**: Use `.on_window_event()` on the Builder, not `window.on_window_event()`
- **Windows AUMID**: Set explicitly in Rust (`com.velomail.app`) for notification identity
- **OAuth (Gmail)**: Localhost server tries ports 17248-17251. PKCE, no client secret. Client ID in SQLite settings
- **IMAP message IDs**: Format is `imap-{accountId}-{folder}-{uid}` — not the RFC Message-ID header
- **IMAP security mapping**: UI shows "SSL/TLS"/"STARTTLS"/"None" but stores "ssl"/"starttls"/"none"
- **IMAP UIDVALIDITY**: If changed, all cached UIDs invalid → full folder resync
- **IMAP tombstone**: Deleted IMAP messages tracked in `deleted_imap_uids` table to prevent re-import during sync
- **IMAP passwords**: Encrypted AES-256-GCM in SQLite. Optional `imap_username` column overrides email as login
- **IMAP local drafts**: Drafts for IMAP accounts tracked in `local_drafts` table; appended to Drafts folder on send/discard
- **Provider abstraction**: All sync/send goes through `EmailProvider` — use `getEmailProvider(account)` from `providerFactory.ts`, never call Gmail/IMAP directly from components
- **Offline mode**: All email modify ops go through `emailActions.ts` (optimistic UI + local DB + queue). Never call `getGmailClient()` directly for mutations. Queue processor: 30s, exponential backoff (60s→300s→900s→3600s)
- **Network detection**: `uiStore.isOnline` via `navigator.onLine` + window events. Queue flushes on reconnect
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`. Target ES2021, `moduleDetection: "force"`
- **Path alias**: `@/*` → `src/*`
- **Email HTML rendering**: DOMPurify sanitization in sandboxed iframe (`allow-same-origin` only). Remote images blocked by default (`data-blocked-src`), allowlist per sender
- **Thread deletion**: Two-stage — trash first, then permanent delete from DB if already in trash
- **AI providers**: 5 providers — Claude, OpenAI, Gemini, Ollama (local HTTP, `ollama_server_url`/`ollama_model` settings), Copilot. API keys/URLs in SQLite settings. Results cached in `ai_cache`
- **Draft auto-save**: 3s debounce on composer state changes
- **Gmail History API**: Expires ~30 days → automatic full sync fallback
- **Vite build**: Multi-page — `index.html` + `splashscreen.html`. HMR on port 1421 when `TAURI_DEV_HOST` set
- **CSP**: Allows googleapis.com, anthropic.com, openai.com, generativelanguage.googleapis.com, gravatar.com, googleusercontent.com
- **Phishing detection**: 10 heuristic rules, sensitivity configurable (low/default/high), cached in `link_scan_results`
- **Mute threads**: Sets `is_muted`, auto-archives. Suppressed from notifications during delta sync
- **Smart folders**: Dynamic tokens `__LAST_7_DAYS__`, `__LAST_30_DAYS__`, `__TODAY__` in saved searches
- **Help page**: In-app at `/help/$topic`. Content in `src/constants/helpContent.ts`. After adding a new feature, run `/document-feature`
- **Cross-component events**: `velo-sync-done`, `velo-toggle-command-palette`, `velo-toggle-shortcuts-help`, `velo-toggle-ask-inbox`, `velo-move-to-folder`. Tray emits `tray-check-mail` via Tauri event system
