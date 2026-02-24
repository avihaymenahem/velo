# Codebase Structure

**Analysis Date:** 2026-02-24

## Directory Layout

```
velo/
├── src/                          # React frontend (TypeScript)
│   ├── main.tsx                  # App entry point, window routing
│   ├── App.tsx                   # Root layout, initialization, background jobs
│   ├── ThreadWindow.tsx          # Thread pop-out window component
│   ├── ComposerWindow.tsx        # Standalone composer window
│   ├── components/               # React components (14 groups, ~94 files)
│   │   ├── layout/               # TitleBar, Sidebar, MailLayout, EmailList, ReadingPane
│   │   ├── email/                # ThreadView, MessageItem, EmailRenderer, ActionBar, etc.
│   │   ├── composer/             # Composer (TipTap), AddressInput, ScheduleSendDialog, etc.
│   │   ├── search/               # CommandPalette, SearchBar, AskInbox
│   │   ├── settings/             # SettingsPage, FilterEditor, SignatureEditor, etc.
│   │   ├── calendar/             # CalendarPage, DayView, EventCard, etc.
│   │   ├── tasks/                # TasksPage, TaskItem, TaskQuickAdd, etc.
│   │   ├── attachments/          # AttachmentLibrary, AttachmentGridItem
│   │   ├── accounts/             # AddAccount, AddImapAccount, AccountSwitcher
│   │   ├── labels/               # LabelForm
│   │   ├── dnd/                  # DndProvider, drag-and-drop setup
│   │   ├── help/                 # HelpPage, HelpSidebar, HelpCard, contextual help
│   │   └── ui/                   # EmptyState, Skeleton, ContextMenu, illustrations
│   ├── stores/                   # Zustand state management (9 stores)
│   │   ├── uiStore.ts            # Theme, layout, sidebar, reading pane, settings
│   │   ├── accountStore.ts       # Active account, account list
│   │   ├── threadStore.ts        # Selected/multi-selected threads, thread list
│   │   ├── composerStore.ts      # Composer open/close, draft state
│   │   ├── labelStore.ts         # Custom labels, IMAP folders
│   │   ├── contextMenuStore.ts   # Right-click menu state
│   │   ├── shortcutStore.ts      # Keyboard shortcuts, customizable keymap
│   │   ├── smartFolderStore.ts   # Smart folder queries and selection
│   │   └── taskStore.ts          # Task list, filter, incomplete count
│   ├── services/                 # Business logic (32+ modules)
│   │   ├── db/                   # SQLite database access (37 tables)
│   │   │   ├── connection.ts     # getDb() singleton, SQL plugin init
│   │   │   ├── migrations.ts     # 19 version-tracked migrations
│   │   │   ├── accounts.ts       # Account CRUD, provider, auth fields
│   │   │   ├── messages.ts       # Message storage, FTS5 search
│   │   │   ├── threads.ts        # Thread storage, pinned/muted state
│   │   │   ├── labels.ts         # Custom labels, IMAP folder mapping
│   │   │   ├── contacts.ts       # Contact directory, frequency ranking
│   │   │   ├── filters.ts        # Filter rules, criteria/actions JSON
│   │   │   ├── settings.ts       # Key-value settings store
│   │   │   ├── attachments.ts    # Attachment metadata, cache tracking
│   │   │   ├── aiCache.ts        # AI results cache (summaries, replies)
│   │   │   ├── tasks.ts          # Tasks, subtasks, recurrence
│   │   │   ├── folderSyncState.ts # IMAP folder UIDVALIDITY/last_uid tracking
│   │   │   └── [20+ other tables] # calendars, contacts, templates, etc.
│   │   ├── email/                # Email provider abstraction
│   │   │   ├── types.ts          # EmailProvider interface, SyncResult
│   │   │   ├── providerFactory.ts # getEmailProvider(), provider caching
│   │   │   ├── gmailProvider.ts  # Gmail API implementation
│   │   │   └── imapSmtpProvider.ts # IMAP/SMTP Tauri commands wrapper
│   │   ├── gmail/                # Gmail-specific services
│   │   │   ├── syncManager.ts    # 60-second sync orchestration
│   │   │   ├── sync.ts           # initialSync(), deltaSync(), History API
│   │   │   ├── tokenManager.ts   # Gmail API client caching, token refresh
│   │   │   ├── messageParser.ts  # Parse Gmail message format to ParsedMessage
│   │   │   ├── authParser.ts     # SPF/DKIM/DMARC parsing from headers
│   │   │   └── sendAs.ts         # Fetch and cache send-as aliases
│   │   ├── imap/                 # IMAP-specific services
│   │   │   ├── imapSync.ts       # Initial + delta sync for IMAP
│   │   │   ├── folderMapper.ts   # IMAP folders → Gmail-style labels
│   │   │   ├── autoDiscovery.ts  # Pre-configured server settings (Outlook, Yahoo, etc.)
│   │   │   ├── imapConfigBuilder.ts # Build IMAP/SMTP config from account
│   │   │   ├── messageHelper.ts  # Message utilities
│   │   │   └── tauriCommands.ts  # Wrapper for Rust IMAP/SMTP Tauri commands
│   │   ├── threading/            # Message threading
│   │   │   └── threadBuilder.ts  # JWZ algorithm, incremental threading
│   │   ├── ai/                   # AI features (summaries, replies, etc.)
│   │   │   ├── aiService.ts      # Main AI interface (summaries, replies, transforms)
│   │   │   ├── providerManager.ts # Switch between Claude, OpenAI, Gemini
│   │   │   ├── providers/        # Claude, OpenAI, Gemini implementations
│   │   │   ├── askInbox.ts       # Natural language inbox queries
│   │   │   ├── categorizationManager.ts # Auto-sort Primary/Updates/Promotions/etc.
│   │   │   ├── writingStyleService.ts # Learn user style, generate drafts
│   │   │   ├── taskExtraction.ts # Extract tasks from threads via AI
│   │   │   └── types.ts, errors.ts # Shared AI types
│   │   ├── filters/              # Email filtering
│   │   │   └── filterEngine.ts   # Apply filter rules on sync
│   │   ├── categorization/       # Rule-based + AI categorization
│   │   │   ├── ruleEngine.ts     # Pattern matching (sender, subject)
│   │   │   └── backfillService.ts # Backfill uncategorized threads after sync
│   │   ├── search/               # Search & filtering
│   │   │   ├── searchParser.ts   # Parse Gmail operators (from:, to:, etc.)
│   │   │   └── searchQueryBuilder.ts # Build SQL from parsed operators
│   │   ├── queue/                # Offline operation queue
│   │   │   └── queueProcessor.ts # 30-second retry loop with exponential backoff
│   │   ├── snooze/               # Snooze logic
│   │   │   └── snoozeManager.ts  # 60-second checker, unsnoozed threads
│   │   ├── followup/             # Follow-up reminders
│   │   │   └── followupManager.ts # Check unanswered threads
│   │   ├── bundles/              # Newsletter bundling
│   │   │   └── bundleManager.ts  # Delivery schedule, bundled threads
│   │   ├── notifications/        # OS notifications
│   │   │   └── notificationManager.ts # VIP sender filtering, Tauri plugin
│   │   ├── attachments/          # Attachment handling
│   │   │   ├── cacheManager.ts   # Local caching with size limits
│   │   │   └── preCacheManager.ts # 15-minute pre-cache of recent small files
│   │   ├── contacts/             # Contact management
│   │   │   └── gravatar.ts       # Fetch Gravatar profile images
│   │   ├── unsubscribe/          # One-click unsubscribe
│   │   │   └── unsubscribeManager.ts # RFC 8058, mailto: fallback
│   │   ├── quickSteps/           # Custom action chains
│   │   │   ├── executor.ts       # Run action sequences
│   │   │   └── types.ts, defaults.ts # Action schemas and presets
│   │   ├── smartLabels/          # AI auto-labeling
│   │   │   ├── smartLabelService.ts # Two-phase (criteria + AI)
│   │   │   ├── smartLabelManager.ts # Sync integration
│   │   │   └── backfillService.ts # Batch apply to inbox
│   │   ├── composer/             # Draft composition
│   │   │   └── draftAutoSave.ts  # 3-second debounce, Zustand watch
│   │   ├── calendar/             # Calendar integration
│   │   │   └── calendar.ts, providerFactory.ts # Google Calendar API
│   │   ├── google/               # Google APIs
│   │   │   └── calendar.ts       # List calendars, events, tokens
│   │   ├── oauth/                # OAuth token management
│   │   │   └── oauthTokenManager.ts # Token refresh, encryption
│   │   ├── phishing/             # Phishing detection
│   │   │   └── phishingDetector.ts # 10 heuristic rules
│   │   ├── emailActions.ts       # Centralized offline-aware email actions
│   │   ├── deepLinkHandler.ts    # mailto: protocol handling
│   │   ├── globalShortcut.ts     # System-wide compose shortcut
│   │   ├── badgeManager.ts       # Taskbar badge count
│   │   └── updateManager.ts      # Auto-update checking
│   ├── hooks/                    # Custom React hooks
│   │   ├── useKeyboardShortcuts.ts # Superhuman-style keyboard nav
│   │   ├── useRouteNavigation.ts # Navigate between routes
│   │   ├── useClickOutside.ts    # Detect clicks outside element
│   │   └── useContextMenu.ts     # Right-click menu handling
│   ├── router/                   # TanStack React Router
│   │   ├── index.ts              # Router instance creation
│   │   ├── routeTree.tsx         # Route definitions (mail, settings, calendar, etc.)
│   │   └── navigate.ts           # Navigation helpers
│   ├── utils/                    # Shared utilities (27+ files)
│   │   ├── emailBuilder.ts       # Build MIME messages
│   │   ├── emailUtils.ts         # Parse headers, extract reply text
│   │   ├── mailtoParser.ts       # Parse mailto: URLs
│   │   ├── sanitize.ts           # DOMPurify wrapper
│   │   ├── imageBlocker.ts       # Block remote images
│   │   ├── phishingDetector.ts   # Client-side phishing checks
│   │   ├── crypto.ts             # AES-256-GCM encryption
│   │   ├── fileUtils.ts          # File handling
│   │   ├── date.ts               # Date formatting
│   │   ├── timestamp.ts          # Timestamp utils
│   │   └── [more utilities]
│   ├── styles/                   # Global CSS
│   │   └── globals.css           # Tailwind v4, theme CSS custom properties, animations
│   ├── constants/                # App constants
│   │   ├── shortcuts.ts          # Keyboard shortcut definitions
│   │   ├── themes.ts             # 8 color theme presets (light/dark)
│   │   └── helpContent.ts        # In-app help card content (13 categories)
│   ├── config/                   # Configuration
│   │   └── tauriConfig.ts        # Tauri build config helpers
│   ├── test/                     # Test setup
│   │   ├── setup.ts              # jsdom setup, jest-dom imports
│   │   └── mocks/                # Mock implementations
│   └── vite-env.d.ts             # Vite type declarations
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # App setup, Tauri builder config
│   │   ├── commands.rs           # Tauri command handlers (invoke targets)
│   │   ├── lib.rs                # Library exports
│   │   ├── oauth.rs              # OAuth localhost server (PKCE)
│   │   ├── imap/                 # IMAP client
│   │   │   ├── mod.rs            # IMAP module exports
│   │   │   ├── client.rs         # async-imap wrapper
│   │   │   └── types.rs          # IMAP types
│   │   └── smtp/                 # SMTP client
│   │       ├── mod.rs            # SMTP module exports
│   │       ├── client.rs         # lettre wrapper
│   │       └── types.rs          # SMTP types
│   ├── capabilities/             # Tauri permissions
│   │   └── default.json          # Plugin capabilities (sql, notification, etc.)
│   ├── icons/                    # App icons (Windows, macOS, Linux)
│   ├── tauri.conf.json           # Tauri config (window, plugins, etc.)
│   └── Cargo.toml                # Rust dependencies
│
├── index.html                    # Main app HTML entry
├── splashscreen.html             # Splash screen (400x300, no decorations)
├── vite.config.ts                # Vite build config (multi-page: main + splashscreen)
├── vitest.config.ts              # Vitest config (jsdom, globals: true)
├── tsconfig.json                 # TypeScript strict mode config
├── package.json                  # npm scripts, dependencies
├── CLAUDE.md                     # Developer instructions (this guide)
└── .planning/                    # Codebase analysis (auto-generated)
    └── codebase/
        ├── ARCHITECTURE.md       # This file
        ├── STRUCTURE.md          # Architecture patterns
        ├── STACK.md              # Tech dependencies
        ├── INTEGRATIONS.md       # External services
        ├── CONVENTIONS.md        # Coding style
        ├── TESTING.md            # Test patterns
        └── CONCERNS.md           # Technical debt
```

## Directory Purposes

**`src/components/`:**
- Purpose: All React UI components organized by feature
- Contains: Functional components (hooks-based), no class components
- Key files:
  - Layout: `layout/Sidebar.tsx`, `layout/MailLayout.tsx`, `layout/TitleBar.tsx`
  - Email: `email/ThreadView.tsx`, `email/MessageItem.tsx`, `email/EmailRenderer.tsx`
  - Composer: `composer/Composer.tsx` (TipTap editor), `composer/Composer.tsx`
  - Search: `search/CommandPalette.tsx`

**`src/services/`:**
- Purpose: All business logic (sync, email actions, AI, filtering, etc.)
- Contains: Plain async functions (no classes except `GmailClient`), one purpose per file
- Key modules:
  - Sync orchestration: `gmail/syncManager.ts`, `imap/imapSync.ts`
  - Email operations: `emailActions.ts` (optimistic updates, queueing)
  - Database: `db/` with 37 tables and 19 migrations
  - AI: `ai/` with pluggable providers

**`src/services/db/`:**
- Purpose: SQLite database access layer
- Contains: Typed service functions (no ORM), one file per table group
- Connection: `getDb()` singleton from `connection.ts` via Tauri SQL plugin
- Pattern: Each service exports async functions (e.g., `getThread(id)`, `updateThread(id, data)`)

**`src/stores/`:**
- Purpose: Client-side UI state management
- Contains: Zustand stores, simple synchronous state, no middleware
- Pattern: `create<State>((set) => ({ ...state, ...actions }))`
- Persistence: Settings stored in SQLite via `setSetting()` calls in actions

**`src/components/layout/`:**
- Purpose: Shell layout components (non-removable UI structure)
- Key files:
  - `Sidebar.tsx` — Navigation, account switcher, label management
  - `MailLayout.tsx` — Email list + reading pane + split view
  - `TitleBar.tsx` — Window controls, menu, account selector

**`src/components/email/`:**
- Purpose: Email-specific components (thread view, message rendering, actions)
- Key files:
  - `ThreadView.tsx` — Main thread display container
  - `MessageItem.tsx` — Individual message with headers/body
  - `EmailRenderer.tsx` — DOMPurify sanitized HTML rendering in iframe
  - `ActionBar.tsx` — Reply, forward, more options
  - `AttachmentList.tsx` — Download, preview, attachment actions

**`src/components/composer/`:**
- Purpose: Email composition and draft management
- Key files:
  - `Composer.tsx` — TipTap v3 editor, modal overlay
  - `AddressInput.tsx` — Recipient autocomplete with contact search
  - `EditorToolbar.tsx` — Bold, italic, links, formatting
  - `ScheduleSendDialog.tsx` — Schedule email send time

**`src/router/`:**
- Purpose: Client-side routing via TanStack React Router
- `index.ts`: Router instance creation
- `routeTree.tsx`: Route definitions (mail, settings, calendar, tasks, attachments, help)
- `navigate.ts`: Navigation helpers and URL parsing

## Key File Locations

**Entry Points:**
- `src/main.tsx` — App initialization, window detection (main vs pop-out)
- `src/App.tsx` — Root component, all background job setup, settings restoration

**Configuration:**
- `vite.config.ts` — Vite build setup (port 1420, HMR, multi-page)
- `src-tauri/tauri.conf.json` — Tauri app config (window size, plugins, icons)
- `tsconfig.json` — TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`)
- `vitest.config.ts` — Test runner (jsdom, globals)

**Core Logic:**
- `src/services/emailActions.ts` — All email modify operations (archive, trash, star, etc.)
- `src/services/gmail/syncManager.ts` — Sync orchestration (60s interval, status reporting)
- `src/services/db/connection.ts` — SQLite singleton
- `src/services/email/providerFactory.ts` — Gmail API vs IMAP provider selection

**Database:**
- `src/services/db/migrations.ts` — All schema migrations (19 total)
- `src/services/db/accounts.ts` — Account CRUD
- `src/services/db/messages.ts` — Message FTS5 search
- `src/services/db/threads.ts` — Thread operations

**UI State:**
- `src/stores/uiStore.ts` — Theme, sidebar, reading pane, settings
- `src/stores/threadStore.ts` — Selected threads, multi-select
- `src/stores/accountStore.ts` — Active account, account list

**Testing:**
- `src/test/setup.ts` — Vitest/jsdom setup
- `src/**/*.test.ts` — Colocated test files (132 total across app)

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `ThreadView.tsx`, `MessageItem.tsx`)
- Services/utilities: camelCase (e.g., `syncManager.ts`, `emailBuilder.ts`)
- Stores: camelCase with "Store" suffix (e.g., `uiStore.ts`, `threadStore.ts`)
- Tests: Same name as source with `.test.ts` suffix (e.g., `emailActions.test.ts`)

**Directories:**
- Feature groups: lowercase (e.g., `email/`, `composer/`, `settings/`)
- Service layers: lowercase (e.g., `db/`, `gmail/`, `imap/`, `ai/`)
- Nested by domain (e.g., `services/email/`, `services/ai/providers/`)

**Functions/Variables:**
- Async functions: camelCase, descriptive verbs (e.g., `getThread()`, `updateMessage()`, `syncAccount()`)
- React hooks: `use` prefix (e.g., `useKeyboardShortcuts()`, `useContextMenu()`)
- Event handlers: `handle` prefix (e.g., `handleAddAccountSuccess()`)
- Computed state: descriptive adjectives (e.g., `isOnline`, `hasAttachments`, `isPinned`)

**TypeScript:**
- Types/interfaces: PascalCase (e.g., `EmailProvider`, `ParsedMessage`, `SyncResult`)
- Enums: PascalCase with const assertion (e.g., `VALID_CATEGORIES`)
- Type unions: Descriptive (e.g., `type Theme = "light" | "dark" | "system"`)

## Where to Add New Code

**New Feature:**
- Primary code: Create feature directory under `src/services/` if business logic (e.g., `src/services/newFeature/`)
- UI components: Create directory under `src/components/` (e.g., `src/components/newFeature/`)
- Tests: Colocate test file next to implementation (e.g., `newFeature.test.ts`)
- Database schema: Add migration in `src/services/db/migrations.ts`, service functions in `src/services/db/newTable.ts`

**New Component/Module:**
- Implementation: `src/components/{featureGroup}/{ComponentName}.tsx`
- Exported from group's barrel file if creating shared sub-components
- Import services directly: `import { serviceFunction } from '@/services/path'`

**Utilities/Helpers:**
- Shared helpers: `src/utils/{helperName}.ts`
- Email-specific: `src/utils/emailUtils.ts`, `src/utils/emailBuilder.ts`
- Date/time: `src/utils/date.ts`, `src/utils/timestamp.ts`
- Crypto/security: `src/utils/crypto.ts`, `src/utils/sanitize.ts`

**Database Table:**
- Schema: Add migration SQL to `src/services/db/migrations.ts`
- Service layer: Create `src/services/db/{tableName}.ts` with CRUD functions
- Export from `src/services/db/` for imports

**Background Job:**
- Location: Create in appropriate service directory (e.g., `src/services/newJob/`)
- Register: Add `start/stopNewJob()` pair in file
- Initialize: Call `startNewJob()` in `src/App.tsx` initialization
- Cleanup: Call `stopNewJob()` in App.tsx cleanup effect

**Keyboard Shortcut:**
- Definition: Add to `src/constants/shortcuts.ts`
- Handler: Add case in `useKeyboardShortcuts()` hook in `src/hooks/useKeyboardShortcuts.ts`
- Customization: Store in `shortcutStore`, load via `shortcutStore.loadKeyMap()`

**AI Feature:**
- Provider-agnostic: Add function to `src/services/ai/aiService.ts`
- Provider implementations: Update all three in `src/services/ai/providers/`
- Caching: Enable via `ai_cache` table in `src/services/db/aiCache.ts`
- Settings: Add toggle/config to `src/components/settings/SettingsPage.tsx`

**Tauri Command (Rust ↔ Frontend):**
- Definition: Add async function in `src-tauri/src/commands.rs` with `#[tauri::command]`
- Capability: Add permission to `src-tauri/capabilities/default.json` if needed
- Call: Invoke via `import { invoke } from '@tauri-apps/api/core'; await invoke('commandName', { arg1, arg2 })`

## Special Directories

**`src/test/`:**
- Purpose: Test setup and mocks
- Generated: No
- Committed: Yes
- Contents: `setup.ts` (jsdom/jest-dom), `mocks/` (mock implementations)

**`.planning/codebase/`:**
- Purpose: Auto-generated codebase analysis documents (this directory)
- Generated: Yes (by GSD mapper)
- Committed: Yes
- Contents: ARCHITECTURE.md, STRUCTURE.md, STACK.md, INTEGRATIONS.md, CONVENTIONS.md, TESTING.md, CONCERNS.md

**`src-tauri/capabilities/`:**
- Purpose: Tauri plugin permissions (Principle of Least Privilege)
- Generated: No
- Committed: Yes
- Contents: `default.json` defines which plugins/commands are available

**`node_modules/`, `src-tauri/target/`:**
- Purpose: Build artifacts
- Generated: Yes (npm install, cargo build)
- Committed: No (.gitignore)

---

*Structure analysis: 2026-02-24*
