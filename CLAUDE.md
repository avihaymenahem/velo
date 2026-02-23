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

1. **Rust backend** (`src-tauri/`): System tray, minimize-to-tray (hide on close), splash screen, OAuth localhost server (port 17248, PKCE), single-instance enforcement, autostart support, IMAP/SMTP client modules. Tauri commands: `start_oauth_server`, `close_splashscreen`, `set_tray_tooltip`, `open_devtools`, plus 11 IMAP commands (`imap_test_connection`, `imap_list_folders`, `imap_fetch_messages`, `imap_fetch_new_uids`, `imap_fetch_message_body`, `imap_set_flags`, `imap_move_messages`, `imap_delete_messages`, `imap_get_folder_status`, `imap_fetch_attachment`, `imap_append_message`) and 2 SMTP commands (`smtp_send_email`, `smtp_test_connection`). Rust IMAP uses `async-imap` + `mail-parser`, SMTP uses `lettre`. Plugins: sql (SQLite), notification, opener, log, dialog, fs, http, single-instance, autostart, deep-link (`mailto:` scheme), global-shortcut. Windows-specific: sets AUMID for proper notification identity.

2. **Service layer** (`src/services/`): All business logic. Plain async functions (not classes, except `GmailClient`).
   - `db/` — SQLite queries via `getDb()` singleton from `connection.ts`. Version-tracked migrations in `migrations.ts`. FTS5 full-text search on messages (trigram tokenizer). 32 service files covering accounts, messages, threads, labels, contacts, filters, templates, signatures, attachments, scheduled emails, image allowlist, search, settings, AI cache, bundle rules, calendar events, follow-up reminders, notification VIPs, thread categories, send-as aliases, smart folders, quick steps, link scan results, phishing allowlist, folder sync state, and smart label rules.
   - `email/` — `EmailProvider` abstraction unifying Gmail API and IMAP/SMTP behind a single interface. `providerFactory.ts` returns appropriate provider based on `account.provider` field ("gmail_api" or "imap"). `gmailProvider.ts` wraps existing GmailClient. `imapSmtpProvider.ts` delegates to Rust IMAP/SMTP Tauri commands.
   - `gmail/` — `GmailClient` class auto-refreshes tokens 5min before expiry, retries on 401. `tokenManager.ts` caches clients per account in a Map. `syncManager.ts` orchestrates sync (60s interval) for both Gmail and IMAP accounts via the EmailProvider abstraction. `sync.ts` does initial sync (365 days, configurable via `sync_period_days` setting) and delta sync via Gmail History API; falls back to full sync if history expired (~30 days). `authParser.ts` parses SPF/DKIM/DMARC from `Authentication-Results` headers. `sendAs.ts` fetches send-as aliases from Gmail API.
   - `imap/` — IMAP-specific services. `tauriCommands.ts` wraps Rust IMAP Tauri commands. `imapSync.ts` orchestrates IMAP initial sync (batch fetch, 50 messages/batch) and delta sync via UIDVALIDITY/last_uid tracking. `folderMapper.ts` maps IMAP folders (special-use flags + well-known names) to Gmail-style labels. `autoDiscovery.ts` provides pre-configured server settings for 7 major providers (Outlook, Yahoo, iCloud, AOL, Zoho, FastMail, GMX). `imapConfigBuilder.ts` builds IMAP/SMTP configs from account records. `messageHelper.ts` handles IMAP message utilities.
   - `threading/` — JWZ threading algorithm (`threadBuilder.ts`) for grouping IMAP messages into conversation threads using Message-ID, References, and In-Reply-To headers. Supports incremental threading, phantom containers for missing references, and subject-based merging.
   - `ai/` — `aiService.ts` provides thread summaries, smart replies, AI compose, text transform, auto-categorization, smart label classification, and task extraction. `providerManager.ts` manages three providers (`providers/claudeProvider.ts`, `providers/openaiProvider.ts`, `providers/geminiProvider.ts`). `askInbox.ts` enables natural language inbox queries. `categorizationManager.ts` auto-sorts threads into Primary/Updates/Promotions/Social/Newsletters. `writingStyleService.ts` analyzes user writing style from sent emails and generates auto-draft replies. `taskExtraction.ts` extracts tasks from email threads via AI. `errors.ts` and `types.ts` define shared AI types. Results cached locally via `db/aiCache.ts`.
   - `google/` — `calendar.ts` handles Google Calendar API (list calendars, fetch events, create events, token refresh).
   - `composer/` — `draftAutoSave.ts` auto-saves drafts every 3 seconds (debounced). Watches composer state changes via Zustand subscribe.
   - `search/` — `searchParser.ts` parses Gmail-style operators (`from:`, `to:`, `subject:`, `has:attachment`, `is:unread/read/starred`, `before:`, `after:`, `label:`). `searchQueryBuilder.ts` builds SQL queries from parsed operators.
   - `filters/` — `filterEngine.ts` auto-applies filters to incoming messages during sync. Criteria use AND logic (case-insensitive substring matching). Actions: applyLabel, archive, trash, star, markRead.
   - `categorization/` — `ruleEngine.ts` applies rule-based categorization (pattern matching on sender/subject) before falling back to AI.
   - `snooze/` — Background interval checkers for snooze unsnooze and scheduled sends.
   - `followup/` — `followupManager.ts` checks for follow-up reminders (threads with no reply after user-set delay).
   - `bundles/` — `bundleManager.ts` manages newsletter bundling with delivery schedules.
   - `notifications/` — `notificationManager.ts` provides OS notifications via tauri-plugin-notification with VIP sender filtering.
   - `contacts/` — `gravatar.ts` fetches Gravatar profile images for contacts.
   - `attachments/` — `cacheManager.ts` handles local attachment caching with size limits. `preCacheManager.ts` background pre-caches recent small attachments (<5MB, 7 days) every 15 minutes.
   - `unsubscribe/` — `unsubscribeManager.ts` handles one-click unsubscribe (RFC 8058 List-Unsubscribe-Post and mailto: fallback).
   - `quickSteps/` — Custom action chain executor with 18 action types. `executor.ts` runs action sequences on threads. `defaults.ts` provides preset templates. `types.ts` defines action chain schema.
   - `queue/` — `queueProcessor.ts` processes offline operation queue every 30s. Compacts redundant ops, retries with exponential backoff (60s→300s→900s→3600s), marks permanently failed ops.
   - `tasks/` — `taskManager.ts` handles recurring task logic: `parseRecurrenceRule`, `calculateNextOccurrence` (daily/weekly/monthly/yearly), `handleRecurringTaskCompletion` (completes current, creates next).
   - `smartLabels/` — AI-powered auto-labeling. `smartLabelService.ts` two-phase matching (criteria fast path + AI classification). `smartLabelManager.ts` sync integration orchestrator. `backfillService.ts` batch-applies to existing inbox emails.
   - Root-level services: `emailActions.ts` (centralized offline-aware email action service — optimistic UI, local DB updates, offline queueing), `badgeManager.ts` (taskbar badge count), `deepLinkHandler.ts` (`mailto:` protocol handling), `globalShortcut.ts` (system-wide compose shortcut).

3. **UI layer** (`src/components/`, `src/stores/`): Nine Zustand stores (`uiStore`, `accountStore`, `threadStore`, `composerStore`, `labelStore`, `contextMenuStore`, `shortcutStore`, `smartFolderStore`, `taskStore`) — simple synchronous state, no middleware. Components subscribe directly via hooks.

### Component organization

14 groups, ~94 component files:
- `layout/` — Sidebar, EmailList, ReadingPane, TitleBar
- `email/` — ThreadView, ThreadCard, MessageItem, EmailRenderer, ActionBar, AttachmentList, SnoozeDialog, ContactSidebar, FollowUpDialog, InlineAttachmentPreview, InlineReply, SmartReplySuggestions, ThreadSummary, AuthBadge, AuthWarningBanner, PhishingBanner, LinkConfirmDialog, CategoryTabs, MoveToFolderDialog
- `composer/` — Composer (TipTap v3 rich text editor), AddressInput, EditorToolbar, AttachmentPicker, ScheduleSendDialog, SignatureSelector, TemplatePicker, UndoSendToast, AiAssistPanel, FromSelector
- `search/` — CommandPalette, SearchBar, ShortcutsHelp, AskInbox
- `settings/` — SettingsPage, FilterEditor, LabelEditor, SignatureEditor, TemplateEditor, ContactEditor, SubscriptionManager, QuickStepEditor, SmartFolderEditor
- `accounts/` — AddAccount, AddImapAccount, AccountSwitcher, SetupClientId
- `calendar/` — CalendarPage, CalendarReauthBanner, CalendarToolbar, DayView, WeekView, MonthView, EventCard, EventCreateModal
- `attachments/` — AttachmentLibrary, AttachmentGridItem, AttachmentListItem
- `tasks/` — TasksPage, TaskItem, TaskQuickAdd, TaskSidebar, AiTaskExtractDialog
- `help/` — HelpPage, HelpSidebar, HelpSearchBar, HelpCard, HelpCardGrid, HelpTooltip
- `labels/` — LabelForm
- `dnd/` — DndProvider (@dnd-kit drag-and-drop: threads → sidebar labels)
- `ui/` — EmptyState, Skeleton, ContextMenu, ContextMenuPortal, OfflineBanner, illustrations/ (InboxClearIllustration, NoAccountIllustration, NoSearchResultsIllustration, ReadingPaneIllustration, GenericEmptyIllustration)

### Multi-window support

Thread pop-out windows via `ThreadWindow.tsx`. Entry point in `main.tsx` checks URL params (`?thread=...&account=...`) to render `<ThreadWindow />` or `<App />`. Window label format: `thread-{threadId}`. Tauri capabilities allow `thread-*` wildcard. Default size: 800x700. Splash screen window (400x300, no decorations, always on top) shown during initialization.

### Startup sequence (App.tsx)

1. `runMigrations()`
2. Restore persisted settings: theme, color theme, sidebar, contact sidebar, reading pane position, read filter, email list width, email density, default reply mode, mark-as-read behavior, send & archive, font scale, inbox view mode, phishing detection, sidebar nav config
3. Load custom keyboard shortcuts (`shortcutStore.loadKeyMap()`)
4. `getAllAccounts()` → `initializeClients()` (Gmail API clients) / create IMAP providers → `fetchSendAsAliases()` per Gmail account
5. `startBackgroundSync()` (60s interval), `backfillUncategorizedThreads()`
6. `startSnoozeChecker()` + `startScheduledSendChecker()` + `startFollowUpChecker()` + `startBundleChecker()` (60s intervals) + `startQueueProcessor()` (30s) + `startPreCacheManager()` (15min)
7. Initialize network status detection (`online`/`offline` window events → `uiStore.setOnline()`, triggers queue flush on reconnect)
8. `initNotifications()` (request OS permission)
9. `initGlobalShortcut()` (system-wide compose shortcut)
10. `initDeepLinkHandler()` (`mailto:` protocol)
11. `updateBadgeCount()` (taskbar badge)
12. `close_splashscreen` → show main window
13. Cleanup on unmount: stop all background checkers (including queue processor, pre-cache manager), unregister shortcuts, deep link handler

### Cross-component communication

Custom window events: `velo-sync-done`, `velo-toggle-command-palette`, `velo-toggle-shortcuts-help`, `velo-toggle-ask-inbox`, `velo-move-to-folder`. Tray emits `tray-check-mail` via Tauri event system. `single-instance-args` event for deep link forwarding.

### Keyboard shortcuts

`useKeyboardShortcuts` hook in App.tsx — Superhuman-style keys. Skips when input/textarea/contentEditable is focused. Supports two-key sequences (only `g` prefix currently) with 1s timeout via refs. Shortcut definitions in `src/constants/shortcuts.ts`. Customizable via `shortcutStore` (persisted to SQLite settings).

| Key | Action |
|-----|--------|
| `j` / `k` | Navigate threads down/up |
| `o` / `Enter` | Open thread |
| `e` | Archive |
| `s` | Star/unstar |
| `p` | Pin/unpin |
| `m` | Mute/unmute thread |
| `c` | Compose new email |
| `r` | Reply |
| `a` | Reply all |
| `f` | Forward |
| `u` | Unsubscribe |
| `t` | Create task from email (AI) |
| `v` | Move to folder/label |
| `#` / `Delete` / `Backspace` | Trash (permanent delete if already in trash) |
| `!` | Report spam / Not spam (context-aware) |
| `/` or `Ctrl+K` | Command palette / search |
| `?` | Shortcuts help |
| `Escape` | Close composer → clear multi-select → deselect thread (hierarchical) |
| `Ctrl+Shift+E` | Toggle sidebar |
| `Ctrl+Enter` | Send email (in composer) |
| `Ctrl+A` | Select all threads |
| `Ctrl+Shift+A` | Select all threads from current position |
| `g` then `i` | Go to Inbox |
| `g` then `s` | Go to Starred |
| `g` then `t` | Go to Sent |
| `g` then `d` | Go to Drafts |
| `g` then `p` | Go to Primary |
| `g` then `u` | Go to Updates |
| `g` then `o` | Go to Promotions |
| `g` then `c` | Go to Social |
| `g` then `n` | Go to Newsletters |
| `g` then `k` | Go to Tasks |
| `g` then `a` | Go to Attachments |

Multi-select: click to toggle, Shift+click for range. All keyboard actions work on multi-selected threads.

## Styling

Tailwind CSS v4 — uses `@import "tailwindcss"`, `@theme {}` for custom properties, and `@custom-variant dark` in `src/styles/globals.css`. Dark mode toggles via `<html class="dark">` which swaps CSS custom properties. Font scaling via `font-scale-{small|default|large|xlarge}` classes on `<html>`.

**Semantic color tokens**: `bg-bg-primary/secondary/tertiary/hover/selected`, `text-text-primary/secondary/tertiary`, `border-border-primary/secondary`, `bg-accent/accent-hover/accent-light`, `bg-danger/warning/success`, `bg-sidebar-bg`, `text-sidebar-text`.

**Glass effects**: `.glass-panel`, `.glass-modal`, `.glass-backdrop` utility classes with blur and shadow properties.

**Color themes**: 8 accent color presets (Indigo, Rose, Emerald, Amber, Sky, Violet, Orange, Slate) defined in `src/constants/themes.ts`. Each has light & dark variants. Applied via CSS custom properties, independent of light/dark mode.

**Background**: Animated gradient blobs (5 blobs with radial gradients, keyframe animations). Light mode uses blue→purple→pink→orange→cyan gradient; dark mode uses darker blues/purples.

**Icons**: `lucide-react` icon library.

## Testing

Vitest + jsdom. Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom/vitest`). Config: `globals: true` (no imports needed for `describe`, `it`, `expect`). Tests are colocated with source files (e.g., `uiStore.test.ts` next to `uiStore.ts`). Zustand test pattern: `useStore.setState()` in beforeEach, assert via `.getState()`.

132 test files across stores (8), services (70), utils (14), components (32), constants (3), router (1), hooks (2), and config (1).

## Database

SQLite via Tauri SQL plugin. 19 migrations (version-tracked in `_migrations` table, transactional). Custom `splitStatements()` handles BEGIN...END blocks in triggers.

Key tables (37 total): `accounts` (with `provider` "gmail_api"|"imap", IMAP/SMTP host/port/security fields, `auth_method`, encrypted `imap_password`, optional `imap_username`), `messages` (with FTS5 index `messages_fts`, `auth_results`, `message_id_header`, `references_header`, `in_reply_to_header`, `imap_uid`, `imap_folder`), `threads` (with `is_pinned`, `is_muted`), `thread_labels`, `labels` (with `imap_folder_path`, `imap_special_use`), `contacts` (frequency-ranked for autocomplete, with `first_contacted_at`), `attachments` (with `cached_at`, `cache_size`, `imap_part_id`), `filter_rules` (criteria/actions as JSON), `scheduled_emails` (status: pending/sent/failed), `templates` (with optional keyboard shortcut), `signatures`, `image_allowlist`, `settings` (key-value store), `ai_cache`, `thread_categories`, `calendar_events`, `follow_up_reminders`, `notification_vips`, `unsubscribe_actions`, `bundle_rules`, `bundled_threads`, `send_as_aliases`, `smart_folders`, `link_scan_results`, `phishing_allowlist`, `quick_steps`, `folder_sync_state` (IMAP UIDVALIDITY/last_uid/modseq tracking per folder), `pending_operations` (offline action queue with retry/backoff), `local_drafts` (offline draft persistence), `writing_style_profiles` (AI writing style per account), `tasks` (full task management with priorities, subtasks, recurrence), `task_tags` (custom task tag colors), `smart_label_rules` (AI auto-labeling rules with optional criteria), `_migrations`.

## Key Gotchas

- **Tauri SQL plugin config**: `preload` in tauri.conf.json must be an array `["sqlite:velo.db"]` — NOT an object/map
- **Tauri Emitter trait**: Must `use tauri::Emitter;` to call `.emit()` on windows
- **Tauri capabilities**: Any new plugin needs explicit permissions added to `src-tauri/capabilities/default.json`. Windows allow `"main"`, `"splashscreen"`, and `"thread-*"` wildcard
- **Tauri window config**: Custom titlebar — macOS uses `titleBarStyle: "Overlay"`, Windows/Linux removes decorations programmatically in Rust setup. 1200x800 default, 800x600 minimum. Splash screen: 400x300, no decorations, center, always on top
- **Single instance**: `tauri-plugin-single-instance` must be first plugin registered. Forwards args for deep linking
- **Minimize-to-tray**: Use `.on_window_event()` on the Builder, not `window.on_window_event()`
- **Windows WebView2**: `Chrome_WidgetWin_0` error on close is benign — ignore it
- **Windows AUMID**: Set explicitly in Rust for proper notification identity (`com.velomail.app`)
- **OAuth (Gmail)**: Localhost server tries ports 17248-17251. PKCE flow, no client secret. Client ID stored in SQLite settings table, configured by user in Settings
- **IMAP message IDs**: Format is `imap-{accountId}-{folder}-{uid}` — not the RFC Message-ID header
- **IMAP security mapping**: UI shows "SSL/TLS", "STARTTLS", "None" but config stores "ssl", "starttls", "none"
- **IMAP UIDVALIDITY**: If UIDVALIDITY changes on a folder, all cached UIDs are invalid — triggers full resync of that folder
- **IMAP folders vs labels**: IMAP has no native labels; folders are mapped to Gmail-style labels via `folderMapper.ts` using special-use flags and well-known name matching
- **IMAP passwords**: Encrypted with AES-256-GCM in SQLite (same crypto as OAuth tokens)
- **IMAP username**: Optional `imap_username` column on accounts — when set, used as login username for IMAP/SMTP instead of email. Falls back to email when null
- **IMAP auto-discovery**: Pre-configured for Outlook/Hotmail, Yahoo, iCloud, AOL, Zoho, FastMail, GMX; other providers require manual server entry
- **Provider abstraction**: All sync/send operations go through `EmailProvider` interface — use `getEmailProvider(account)` from `providerFactory.ts`, never call Gmail or IMAP APIs directly from components
- **Offline mode**: All email modify operations (archive, trash, star, read, send, labels, drafts) go through `emailActions.ts` which applies optimistic UI updates, local DB changes, and queues operations when offline. Never call `getGmailClient()` directly for modify operations — use the convenience wrappers (`archiveThread`, `trashThread`, `starThread`, etc.). Queue processor runs every 30s, compacts redundant ops, uses exponential backoff retries. Conflict detection in delta sync skips threads with pending local ops
- **Network detection**: `uiStore.isOnline` tracks connectivity via `navigator.onLine` + window `online`/`offline` events. Queue flush triggers automatically on reconnect
- **CSP**: Allows connections to googleapis.com, anthropic.com, openai.com, generativelanguage.googleapis.com, gravatar.com, googleusercontent.com
- **TypeScript strict mode**: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` are all enabled. Target ES2021, bundler module resolution, `moduleDetection: "force"`
- **Path alias**: `@/*` maps to `src/*`
- **Email HTML rendering**: DOMPurify sanitization, rendered in sandboxed iframe (`allow-same-origin` only). Strips remote images by default (uses `data-blocked-src` attributes), allowlist per sender
- **Thread deletion**: Two-stage — first trash, then permanent delete from DB if already in trash
- **Snooze**: Removes INBOX label and adds SNOOZED label (not just a flag)
- **Draft auto-save**: 3-second debounce, not configurable
- **Gmail History API**: Expires after ~30 days, triggers automatic full sync fallback
- **Vite HMR**: Uses port 1421 when `TAURI_DEV_HOST` is set
- **Vite build**: Multi-page — `index.html` (main app) + `splashscreen.html`
- **Filter engine**: AND logic for criteria, merges actions when multiple filters match same message
- **AI providers**: API keys stored in SQLite settings table. Provider selected per-feature in settings. Results cached in `ai_cache` table
- **Deep links**: `mailto:` scheme registered via tauri-plugin-deep-link. Opens compose window with pre-filled recipient
- **Autostart**: Uses `--hidden` flag to start minimized to tray
- **Phishing detection**: 10 heuristic rules (IP URLs, homograph, suspicious TLDs, URL shorteners, display/href mismatch, suspicious paths, brand impersonation, dangerous protocols, free email impostor, subdomain spoofing). Sensitivity configurable (low/default/high). Results cached in `link_scan_results`
- **Auth display**: SPF/DKIM/DMARC parsed from `Authentication-Results` header. Aggregate verdict: pass/fail/warning/unknown. Stored in `messages.auth_results` column
- **Mute threads**: Sets `is_muted` flag, auto-archives. Muted threads suppressed from notifications during delta sync
- **Send-as aliases**: Fetched from Gmail `/settings/sendAs` API on account init (Gmail only). `FromSelector` shown in composer when account has multiple aliases
- **Smart folders**: Saved search queries with dynamic tokens (`__LAST_7_DAYS__`, `__LAST_30_DAYS__`, `__TODAY__`). Managed via `smartFolderStore`
- **Quick steps**: Custom action chains with 18 action types. Executor in `services/quickSteps/executor.ts`
- **Split inbox**: Category tabs (Primary/Updates/Promotions/Social/Newsletters) with backfill service for existing threads
- **Help page**: In-app help at `/help/$topic` with 13 categories, searchable cards, and contextual `HelpTooltip` component. All content in `src/constants/helpContent.ts`. After adding a new feature, run `/document-feature` to add its help card
