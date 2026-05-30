# Architecture

Melo follows a **three-layer architecture** with clear separation of concerns.

```
+--------------------------+
|     React 19 + Zustand   |   UI Layer
|  Components + 10 Stores  |   (TypeScript)
+--------------------------+
|     Service Layer         |   Business Logic
|  Email Provider / Gmail / |   (TypeScript)
|  IMAP / DB / AI / Sync /  |
|  Calendar / Bundles /     |
|  Filters / Notifications  |
+--------------------------+
|     Tauri v2 + Rust       |   Native Layer
|  System Tray / OAuth /    |   (Rust)
|  SQLite / Notifications / |
|  Deep Links / Autostart   |
+--------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Tauri v2](https://v2.tauri.app/) |
| **Frontend** | React 19, TypeScript, Zustand 5 |
| **Styling** | Tailwind CSS v4 |
| **Editor** | TipTap v3 |
| **Backend** | Rust |
| **Database** | SQLite (via tauri-plugin-sql) |
| **Search** | FTS5 with trigram tokenizer |
| **AI** | Anthropic Claude, OpenAI GPT, Google Gemini, Ollama (local), GitHub Copilot (user-selectable models per provider) |
| **Icons** | Lucide React |
| **Drag & Drop** | @dnd-kit |
| **Testing** | Vitest + Testing Library |

## Data Flow

1. **Sync** -- Background sync every 60s. Gmail accounts use Gmail History API (delta sync, falls back to full sync if history expires ~30 days). IMAP accounts use UIDVALIDITY/last_uid tracking for efficient delta sync.
2. **Storage** -- All messages, threads, labels, contacts, calendar events, and AI results stored in local SQLite (39 tables) with FTS5 full-text indexing.
3. **State** -- Ten Zustand stores manage UI state. No middleware, no persistence needed -- ephemeral state rebuilds from SQLite on startup.
4. **Rendering** -- Email HTML is sanitized with DOMPurify and rendered in sandboxed iframes. Remote images blocked by default.
5. **Background services** -- Multiple interval checkers run continuously: sync (60s), snooze (60s), scheduled send (60s), follow-up reminders (60s), newsletter bundles (60s), offline queue processor (30s), attachment pre-cache (15min), and update checker.
6. **Security** -- Phishing link detection scores message links with 10 heuristic rules. SPF/DKIM/DMARC authentication headers parsed and displayed as badges.

## Project Structure

```
melo/
├── src/
│   ├── components/           # React components (~154 files)
│   │   ├── layout/           # Sidebar, EmailList, ReadingPane, TitleBar
│   │   ├── email/            # ThreadView, MessageItem, EmailRenderer,
│   │   │                     # ContactSidebar, SmartReplySuggestions,
│   │   │                     # InlineReply, ThreadSummary, FollowUpDialog,
│   │   │                     # AuthBadge, AuthWarningBanner, PhishingBanner,
│   │   │                     # LinkConfirmDialog, CategoryTabs
│   │   ├── composer/         # Composer, AddressInput, EditorToolbar,
│   │   │                     # AiAssistPanel, ScheduleSendDialog, FromSelector
│   │   ├── search/           # CommandPalette, SearchBar, ShortcutsHelp, AskInbox
│   │   ├── settings/         # SettingsPage, FilterEditor, LabelEditor,
│   │   │                     # SubscriptionManager, ContactEditor,
│   │   │                     # QuickStepEditor, SmartFolderEditor
│   │   ├── accounts/         # AddAccount, AddImapAccount, AccountSwitcher, SetupClientId
│   │   ├── calendar/         # CalendarPage, MonthView, WeekView, DayView,
│   │   │                     # EventCard, EventCreateModal
│   │   ├── attachments/      # AttachmentLibrary, AttachmentGridItem, AttachmentListItem
│   │   ├── tasks/            # TasksPage, TaskItem, TaskSidebar, TaskQuickAdd,
│   │   │                     # AiTaskExtractDialog
│   │   ├── help/             # HelpPage, HelpSidebar, HelpSearchBar,
│   │   │                     # HelpCard, HelpCardGrid, HelpTooltip
│   │   ├── labels/           # LabelForm
│   │   ├── dnd/              # DndProvider (drag threads → sidebar labels)
│   │   └── ui/               # EmptyState, Skeleton, ContextMenu, OfflineBanner, illustrations/
│   ├── services/             # Business logic layer
│   │   ├── db/               # SQLite queries, migrations, FTS5
│   │   ├── email/            # EmailProvider abstraction, providerFactory,
│   │   │                     # gmailProvider, imapSmtpProvider
│   │   ├── gmail/            # GmailClient, tokenManager, syncManager
│   │   ├── imap/             # IMAP sync, folder mapper, auto-discovery,
│   │   │                     # config builder, Tauri command wrappers
│   │   ├── oauth/            # OAuth PKCE flow, token manager
│   │   ├── threading/        # JWZ threading engine for IMAP conversations
│   │   ├── ai/               # AI service, 5 providers, categorization, Ask Inbox,
│   │   │                     # writing style analysis, auto-drafts, task extraction
│   │   ├── google/           # Google Calendar API
│   │   ├── composer/         # Draft auto-save (two-tier: local 3s + server 18s)
│   │   ├── search/           # Query parser, SQL builder
│   │   ├── filters/          # Auto-apply filter engine
│   │   ├── categorization/   # Rule-based categorization engine
│   │   ├── phishing/         # Link scoring, heuristic rules, allowlist
│   │   ├── snooze/           # Snooze & scheduled send checkers
│   │   ├── followup/         # Follow-up reminder checker
│   │   ├── bundles/          # Newsletter bundle manager
│   │   ├── notifications/    # OS notification manager
│   │   ├── contacts/         # Gravatar integration
│   │   ├── attachments/      # Attachment cache manager, pre-cache manager
│   │   ├── unsubscribe/      # One-click unsubscribe (RFC 8058)
│   │   ├── quickSteps/       # Quick step executor, types, defaults
│   │   ├── queue/            # Offline queue processor
│   │   ├── tasks/            # Task recurrence manager
│   │   ├── smartLabels/      # AI-powered auto-labeling
│   │   ├── emailActions.ts   # Centralized email action service (offline-aware)
│   │   ├── backgroundCheckers.ts # Factory for interval-based background checkers
│   │   ├── updateManager.ts  # In-app update checker and installer
│   │   ├── badgeManager.ts   # Taskbar badge count
│   │   ├── deepLinkHandler.ts # mailto: protocol handler
│   │   └── globalShortcut.ts # System-wide compose shortcut
│   ├── stores/               # Zustand stores (10): ui, account, thread,
│   │                         # composer, label, contextMenu, shortcut,
│   │                         # smartFolder, task, outgoing
│   ├── hooks/                # useKeyboardShortcuts, useClickOutside,
│   │                         # useContextMenu, useResizeObserver
│   ├── utils/                # crypto, date, emailBuilder, sanitize, imageBlocker,
│   │                         # mailtoParser, fileUtils, templateVariables, noReply
│   ├── constants/            # Keyboard shortcuts, color themes, help content
│   └── styles/               # Tailwind CSS v4 globals
├── src-tauri/
│   ├── src/                  # Rust backend (tray, OAuth, splash, single-instance,
│   │   │                     # IMAP client, SMTP client, Tauri commands)
│   ├── capabilities/         # Tauri v2 permissions
│   └── icons/                # App icons (all platforms)
├── docs/                     # Documentation
├── package.json
├── CLAUDE.md                 # AI coding assistant context
└── README.md
```

## Rust Backend

The Rust layer (`src-tauri/src/`) handles system integration and performance-critical email protocol operations. It provides:

- **System tray** -- Show/hide, check mail, quit menu
- **OAuth server** -- Localhost PKCE server on port 17248
- **IMAP client** (`imap/`) -- Full IMAP protocol via `async-imap` + `mail-parser`. Supports TLS/STARTTLS/plain, XOAuth2 auth. Operations: FETCH, STORE, MOVE, DELETE, APPEND, LIST, STATUS
- **SMTP client** (`smtp/`) -- Email sending via `lettre`. Supports TLS/STARTTLS/plain. Parses RFC 2822 envelopes
- **Splash screen** -- Shown during initialization, closed when ready
- **Single instance** -- Prevents duplicate app windows, forwards deep link args
- **Minimize to tray** -- Hides on close instead of quitting
- **Custom titlebar** -- Overlay on macOS, frameless on Windows/Linux
- **Windows AUMID** -- Set for proper notification identity

**Tauri commands:** `start_oauth_server`, `oauth_exchange_token`, `oauth_refresh_token`, `close_splashscreen`, `set_tray_tooltip`, `open_devtools`, 17 IMAP commands (`imap_test_connection`, `imap_list_folders`, `imap_fetch_messages`, `imap_fetch_new_uids`, `imap_search_all_uids`, `imap_fetch_message_body`, `imap_fetch_raw_message`, `imap_set_flags`, `imap_move_messages`, `imap_delete_messages`, `imap_get_folder_status`, `imap_fetch_attachment`, `imap_append_message`, `imap_search_folder`, `imap_sync_folder`, `imap_raw_fetch_diagnostic`, `imap_delta_check`), 2 SMTP commands (`smtp_send_email`, `smtp_test_connection`)

**Plugins (14):** sql, notification, opener, log, dialog, fs, http, single-instance, autostart, deep-link, global-shortcut, updater, process, os

**Rust dependencies (IMAP/SMTP):** `async-imap`, `tokio-native-tls`, `mail-parser`, `lettre`

## Service Layer

All business logic lives in `src/services/` as plain async functions (except `GmailClient` class). Email operations use the `EmailProvider` abstraction — all sync/send flows go through `providerFactory.ts` which returns the appropriate provider (Gmail API or IMAP/SMTP) based on the account type.

| Service | Description |
|---------|-------------|
| `db/` | SQLite queries, migrations (46 versions), FTS5 search |
| `email/` | EmailProvider abstraction, provider factory, Gmail/IMAP adapters |
| `gmail/` | Gmail client, token management, sync engine |
| `imap/` | IMAP sync, folder-to-label mapping, auto-discovery, Tauri command wrappers |
| `oauth/` | OAuth PKCE flow, token refresh, multi-account token management |
| `threading/` | JWZ threading algorithm for IMAP message grouping |
| `ai/` | AI service with 5 providers — Claude, OpenAI, Gemini, Ollama (local), Copilot — selectable per feature, categorization, Ask Inbox, writing style analysis, auto-drafts, task extraction |
| `google/` | Google Calendar API |
| `composer/` | Draft auto-save — two-tier: stable UUID row in SQLite (3s debounce) + server APPEND (18s debounce) |
| `search/` | Gmail-style query parser, SQL builder |
| `filters/` | Auto-apply filter engine (AND logic) |
| `categorization/` | Rule-based categorization before AI fallback |
| `phishing/` | Link heuristic scoring (10 rules), sensitivity config, per-sender allowlist |
| `snooze/` | Snooze & scheduled send background checkers |
| `followup/` | Follow-up reminder checker |
| `bundles/` | Newsletter bundling with delivery schedules |
| `notifications/` | OS notifications with VIP filtering |
| `contacts/` | Gravatar integration |
| `attachments/` | Local attachment caching, pre-cache recent attachments |
| `unsubscribe/` | One-click unsubscribe (RFC 8058) |
| `quickSteps/` | Custom action chains with executor engine |
| `queue/` | Offline queue processor with exponential backoff |
| `tasks/` | Task recurrence manager |
| `smartLabels/` | AI-powered auto-labeling with two-phase matching (criteria + AI) |

**Root-level services:** `emailActions.ts` (centralized offline-aware email actions), `backgroundCheckers.ts` (factory for interval checkers), `updateManager.ts` (in-app updates), `badgeManager.ts` (taskbar badge), `deepLinkHandler.ts` (mailto: protocol), `globalShortcut.ts` (system-wide compose)

## UI Layer

Ten Zustand stores manage ephemeral UI state:

| Store | Purpose |
|-------|---------|
| `uiStore` | Theme, sidebar, sidebar nav config, reading pane, density, font scale, selections, online status, pending ops count |
| `accountStore` | Account list, active account |
| `threadStore` | Thread list, selected thread, loading state |
| `composerStore` | Compose state, recipients, body, attachments |
| `labelStore` | Label list, label operations |
| `contextMenuStore` | Right-click context menu state |
| `shortcutStore` | Custom keyboard shortcut bindings |
| `smartFolderStore` | Saved searches with dynamic query tokens |
| `taskStore` | Task list, filters, grouping, thread tasks, incomplete count |
| `outgoingStore` | In-flight outgoing emails (undo-send window + sending status) |

## Database

SQLite via Tauri SQL plugin. 46 migrations (version-tracked in `_migrations`, transactional), 39 tables total.

Key tables: `accounts` (with `provider` "gmail_api"|"imap", IMAP/SMTP fields, encrypted `imap_password`, optional `imap_username`), `messages` (FTS5 index `messages_fts`, `auth_results`, IMAP headers, `imap_uid`, `imap_folder`), `threads` (`is_pinned`, `is_muted`), `thread_labels`, `labels` (`imap_folder_path`, `imap_special_use`), `contacts`, `attachments` (`imap_part_id`, `cached_at`, `cache_size`), `filter_rules` (criteria/actions as JSON), `scheduled_emails`, `templates`, `signatures`, `image_allowlist`, `settings` (key-value), `ai_cache`, `thread_categories`, `calendar_events`, `follow_up_reminders`, `notification_vips`, `unsubscribe_actions`, `bundle_rules`, `bundled_threads`, `send_as_aliases`, `smart_folders`, `link_scan_results`, `phishing_allowlist`, `quick_steps`, `folder_sync_state` (IMAP UIDVALIDITY/last_uid/modseq tracking), `pending_operations` (offline queue with retry/backoff), `local_drafts` (schema exists, unused at code level — superseded by two-tier draft system in `messages`), `deleted_imap_uids` (tombstone — prevents re-import of deleted messages during sync), `writing_style_profiles`, `tasks` (priorities, subtasks, recurrence), `task_tags`, `smart_label_rules`, `_migrations`.

## Startup Sequence

1. Run database migrations
2. Restore persisted settings (theme, sidebar, density, font scale, reading pane, etc.)
3. Load custom keyboard shortcuts
4. Initialize email providers for all accounts (Gmail API clients + IMAP providers), sync send-as aliases for Gmail accounts
5. Start background sync (60s interval), backfill uncategorized threads
6. Start background checkers (snooze, scheduled send, follow-up, bundles, queue processor, attachment pre-cache)
7. Initialize network status detection (online/offline listeners)
8. Initialize OS notifications
9. Register global compose shortcut
10. Initialize deep link handler (`mailto:`)
11. Update taskbar badge count
12. Close splash screen, show main window

## Packaging & Distribution

Melo supports standard Linux distribution formats via automated and local build processes:

- **RPM & COPR**: Native RPM generation is integrated via Tauri's bundler (`tauri build -b rpm`), making it trivial to build and test RPMs locally or publish SRPMs to Fedora COPR.
- **Flatpak**: A Flatpak manifest (`com.velomail.app.yml`) defines the sandbox environment, leveraging the GNOME 46 runtime and Rust/Node.js SDK extensions. Local builds are streamlined via an npm script (`npm run flatpak`) which uses `flatpak-builder` while excluding host-specific artifacts to ensure reproducible sandboxed builds.
