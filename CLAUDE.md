# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Three-layer data flow

1. **Rust backend** (`src-tauri/`): System tray, minimize-to-tray (hide on close), OAuth localhost server (port 17248, PKCE). The only Tauri command is `start_oauth_server`. Plugins: sql (SQLite), notification, opener, log, dialog, fs.

2. **Service layer** (`src/services/`): All business logic. Plain async functions (not classes, except `GmailClient`).
   - `db/` — SQLite queries via `getDb()` singleton from `connection.ts`. Version-tracked migrations in `migrations.ts`. FTS5 full-text search on messages (trigram tokenizer). 17 service files covering accounts, messages, threads, labels, contacts, filters, templates, signatures, attachments, scheduled emails, image allowlist, search, and settings.
   - `gmail/` — `GmailClient` class auto-refreshes tokens 5min before expiry, retries on 401. `tokenManager.ts` caches clients per account in a Map. `syncManager.ts` orchestrates sync (60s interval). `sync.ts` does initial sync (365 days, configurable via `sync_period_days` setting) and delta sync via Gmail History API; falls back to full sync if history expired (~30 days).
   - `composer/` — `draftAutoSave.ts` auto-saves drafts every 3 seconds (debounced). Watches composer state changes via Zustand subscribe.
   - `search/` — `searchParser.ts` parses Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `is:unread/read/starred`, `before:`, `after:`, `label:`). `searchQueryBuilder.ts` builds SQL queries from parsed operators.
   - `filters/` — `filterEngine.ts` auto-applies filters to incoming messages during sync. Criteria use AND logic (case-insensitive substring matching). Actions: applyLabel, archive, trash, star, markRead.
   - `snooze/` — Background interval checkers for snooze unsnooze and scheduled sends.
   - `notifications/` — OS notifications via tauri-plugin-notification.

3. **UI layer** (`src/components/`, `src/stores/`): Five Zustand stores (`uiStore`, `accountStore`, `threadStore`, `composerStore`, `labelStore`) — simple synchronous state, no middleware. Components subscribe directly via hooks.

### Component organization

10 groups, ~38 component files:
- `layout/` — Sidebar, EmailList, ReadingPane, TitleBar
- `email/` — ThreadView, ThreadCard, MessageItem, EmailRenderer, ActionBar, AttachmentList, SnoozeDialog
- `composer/` — Composer (TipTap v3 rich text editor), AddressInput, EditorToolbar, AttachmentPicker, ScheduleSendDialog, SignatureSelector, TemplatePicker, UndoSendToast
- `search/` — CommandPalette, SearchBar, ShortcutsHelp
- `settings/` — SettingsPage, FilterEditor, LabelEditor, SignatureEditor, TemplateEditor
- `accounts/` — AddAccount, AccountSwitcher, SetupClientId
- `labels/` — LabelForm
- `dnd/` — DndProvider (@dnd-kit drag-and-drop: threads → sidebar labels)
- `ui/` — EmptyState, Skeleton

### Multi-window support

Thread pop-out windows via `ThreadWindow.tsx`. Entry point in `main.tsx` checks URL params (`?thread=...&account=...`) to render `<ThreadWindow />` or `<App />`. Window label format: `thread-{threadId}`. Tauri capabilities allow `thread-*` wildcard. Default size: 800x700.

### Startup sequence (App.tsx)

1. `runMigrations()`
2. Restore theme + sidebar state from settings
3. `getAllAccounts()` → `initializeClients()`
4. `startBackgroundSync()` (60s interval)
5. `startSnoozeChecker()` + `startScheduledSendChecker()` (60s intervals)
6. `initNotifications()` (request OS permission)
7. Cleanup on unmount: stop all background checkers

### Cross-component communication

Custom window events: `velo-sync-done`, `velo-toggle-command-palette`, `velo-toggle-shortcuts-help`. Tray emits `tray-check-mail` via Tauri event system.

### Keyboard shortcuts

`useKeyboardShortcuts` hook in App.tsx — Superhuman-style keys. Skips when input/textarea/contentEditable is focused. Supports two-key sequences (only `g` prefix currently) with 1s timeout via refs.

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate threads down/up |
| `o` / `Enter` | Open thread |
| `e` | Archive |
| `s` | Star/unstar |
| `c` | Compose new email |
| `#` / `Delete` / `Backspace` | Trash (permanent delete if already in trash) |
| `!` | Report spam / Not spam (context-aware) |
| `/` or `Ctrl+K` | Command palette / search |
| `?` | Shortcuts help |
| `Escape` | Close composer → clear multi-select → deselect thread (hierarchical) |
| `Ctrl+Shift+E` | Toggle sidebar |
| `Ctrl+Enter` | Send email (in composer) |
| `g` then `i` | Go to Inbox |
| `g` then `s` | Go to Starred |
| `g` then `t` | Go to Sent |
| `g` then `d` | Go to Drafts |

Multi-select: click to toggle, Shift+click for range. All keyboard actions work on multi-selected threads.

## Styling

Tailwind CSS v4 — uses `@import "tailwindcss"`, `@theme {}` for custom properties, and `@custom-variant dark` in `src/styles/globals.css`. Dark mode toggles via `<html class="dark">` which swaps CSS custom properties.

**Semantic color tokens**: `bg-bg-primary/secondary/tertiary/hover/selected`, `text-text-primary/secondary/tertiary`, `border-border-primary/secondary`, `bg-accent/accent-hover/accent-light`, `bg-danger/warning/success`, `bg-sidebar-bg`, `text-sidebar-text`.

**Glass effects**: `.glass-panel`, `.glass-modal`, `.glass-backdrop` utility classes with blur and shadow properties.

**Background**: Animated gradient blobs (5 blobs with radial gradients, keyframe animations). Light mode uses blue→purple→pink→orange→cyan gradient; dark mode uses darker blues/purples.

**Icons**: `lucide-react` icon library.

## Testing

Vitest + jsdom. Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`). Config: `globals: true` (no imports needed for `describe`, `it`, `expect`). Tests are colocated with source files (e.g., `uiStore.test.ts` next to `uiStore.ts`). Zustand test pattern: `useStore.setState()` in beforeEach, assert via `.getState()`.

## Database

SQLite via Tauri SQL plugin. 4 migrations (version-tracked in `_migrations` table). Custom `splitStatements()` handles BEGIN...END blocks in triggers.

Key tables: `accounts`, `messages` (with FTS5 index), `threads`, `thread_labels`, `labels`, `contacts` (frequency-ranked for autocomplete), `filter_rules` (criteria/actions as JSON), `scheduled_emails` (status: pending/sent/failed), `templates` (with optional keyboard shortcut), `signatures`, `image_allowlist`, `settings` (key-value store).

## Key Gotchas

- **Tauri SQL plugin config**: `preload` in tauri.conf.json must be an array `["sqlite:velo.db"]` — NOT an object/map
- **Tauri Emitter trait**: Must `use tauri::Emitter;` to call `.emit()` on windows
- **Tauri capabilities**: Any new plugin needs explicit permissions added to `src-tauri/capabilities/default.json`. Windows allow `"main"` and `"thread-*"` wildcard
- **Tauri window config**: Custom titlebar (`decorations: false`), 1200x800 default, 800x600 minimum, CSP disabled (`"csp": null`)
- **Minimize-to-tray**: Use `.on_window_event()` on the Builder, not `window.on_window_event()`
- **Windows WebView2**: `Chrome_WidgetWin_0` error on close is benign — ignore it
- **OAuth**: Localhost server tries ports 17248-17251. PKCE flow, no client secret. Client ID stored in SQLite settings table, configured by user in Settings
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` are all enabled. Target ES2021, bundler module resolution, `moduleDetection: "force"`
- **Path alias**: `@/*` maps to `src/*`
- **Email HTML rendering**: DOMPurify sanitization, rendered in sandboxed iframe (`allow-same-origin` only). Strips remote images by default (uses `data-blocked-src` attributes), allowlist per sender
- **Thread deletion**: Two-stage — first trash, then permanent delete from DB if already in trash
- **Snooze**: Removes INBOX label and adds SNOOZED label (not just a flag)
- **Draft auto-save**: 3-second debounce, not configurable
- **Gmail History API**: Expires after ~30 days, triggers automatic full sync fallback
- **Vite HMR**: Uses port 1421 when `TAURI_DEV_HOST` is set
- **Filter engine**: AND logic for criteria, merges actions when multiple filters match same message
