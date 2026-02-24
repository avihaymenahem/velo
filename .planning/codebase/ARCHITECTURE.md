# Architecture

**Analysis Date:** 2026-02-24

## Pattern Overview

**Overall:** Three-layer Tauri desktop application (Rust backend + React 19 frontend) with clear separation of concerns: UI layer (React components + Zustand stores), Service layer (plain async functions), and Data layer (SQLite via Tauri SQL plugin).

**Key Characteristics:**
- Tauri v2 IPC bridge between Rust backend and React frontend
- Provider abstraction pattern for email backends (Gmail API vs IMAP/SMTP)
- Offline-first queue system for email modifications with optimistic UI updates
- Event-driven cross-component communication via window events
- Multi-window support (main app + thread pop-out + composer windows)
- Background sync orchestration (60-second interval, delta sync on idle, full fallback)

## Layers

**Frontend UI Layer:**
- Purpose: Render React components, manage local UI state via Zustand stores, handle user interactions
- Location: `src/components/`, `src/stores/`, `src/hooks/`
- Contains: 14 component groups (~94 files), 9 Zustand stores, custom React hooks
- Depends on: Service layer (all business logic), Tauri IPC for backend commands
- Used by: Rendered by browser DOM in Tauri WebView

**Service Layer (Business Logic):**
- Purpose: All application logic — sync orchestration, email operations, database access, AI features, filtering, threading, caching
- Location: `src/services/`
- Contains: 32+ service modules organized by feature (db/, email/, gmail/, imap/, ai/, attachments/, filters/, search/, etc.)
- Depends on: Data layer (SQLite via Tauri SQL plugin), Tauri IPC (for IMAP/SMTP/OAuth commands)
- Used by: UI layer (directly), other services, background jobs

**Data Layer:**
- Purpose: Persistent storage and retrieval via SQLite
- Location: `src/services/db/` (37 tables, 19 migrations)
- Contains: Typed database service functions (no ORM), custom `getDb()` singleton from `connection.ts`
- Depends on: Tauri SQL plugin (`@tauri-apps/plugin-sql`)
- Used by: Service layer exclusively

**Rust Backend (Tauri):**
- Purpose: System integration, native features, OAuth server, IMAP/SMTP communication, IPC commands
- Location: `src-tauri/src/`
- Contains: Main app setup, OAuth localhost server (port 17248, PKCE), IMAP client (async-imap), SMTP client (lettre), 11 IMAP commands, 2 SMTP commands, system tray, deep link handler
- Depends on: External SDKs (async-imap, lettre, google-authz), Tauri plugins
- Used by: Frontend via `@tauri-apps/api/core` invoke and events

## Data Flow

**Initial Sync Flow:**

1. User adds account → `AddAccount` component captures credentials/OAuth
2. Account saved to SQLite `accounts` table via `db/accounts.ts`
3. `App.tsx` startup calls `initializeClients()` → creates Gmail API clients or IMAP providers
4. `startBackgroundSync()` triggered → calls `syncManager.ts`
5. `syncManager` determines provider (Gmail API or IMAP) and calls appropriate sync function
6. Gmail: `gmail/sync.ts` → `initialSync()` fetches 365 days of threads, builds thread tree, stores in DB
7. IMAP: `imap/imapSync.ts` → fetches folders, batch-fetches messages (50/batch), applies threading
8. Sync status reported via callback → `App.tsx` updates UI and dispatches `velo-sync-done` event
9. After first successful sync, `categorization/backfillService` auto-categorizes uncategorized threads via AI

**Delta Sync Flow (60-second interval):**

1. `syncManager` checks for `history_id` (Gmail) or folder `last_uid` (IMAP)
2. Gmail: calls `deltaSync()` with History API (single call, lightweight)
3. IMAP: calls `imapDeltaSync()` with UIDVALIDITY/last_uid per folder
4. New/modified messages fetched, stored in DB
5. Filter engine applies rules automatically during sync
6. Smart label classifier runs on new messages
7. Notifications generated for VIP senders

**Email Action Flow (Archive, Star, Read, etc.):**

1. User clicks action in UI → calls `emailActions.ts` service function (e.g., `archiveThread()`)
2. `emailActions` applies optimistic UI update to Zustand store immediately
3. DB updated locally (thread marked archived)
4. If offline: operation queued in `pending_operations` table by `queueProcessor`
5. If online: operation sent immediately via EmailProvider to Gmail API or Tauri IMAP command
6. Queue processor (30-second interval) retries failed ops with exponential backoff (60s → 300s → 900s → 3600s)
7. On reconnection, queue flush triggered automatically

**Compose & Send Flow:**

1. User opens composer → `Composer` component renders TipTap editor
2. Draft auto-saved every 3 seconds via `composer/draftAutoSave.ts` (debounced)
3. On send: `emailActions.sendMessage()` encodes raw MIME, queues if offline
4. If `send_and_archive` setting: archive thread after send
5. Undo available for 3 seconds via `UndoSendToast`
6. For scheduled sends: stored in `scheduled_emails` table, checked by `scheduledSendManager` every 60 seconds

**State Management Flow:**

1. Zustand stores subscribe to specific state slices (e.g., `uiStore.theme`, `threadStore.selectedThread`)
2. Components use hooks (e.g., `useUIStore((s) => s.theme)`) for fine-grained subscriptions
3. Store actions call service functions to persist settings (e.g., `setSetting('theme', 'dark')`)
4. Settings persisted to SQLite `settings` table (key-value store)
5. On app startup, `App.tsx` restores all persisted settings from DB

**Cross-Window Communication:**

1. Main window (inbox) and thread pop-out windows share same browser context
2. Thread pop-out (URL params: `?thread={threadId}&account={accountId}`) dispatches actions to shared stores
3. Custom window events coordinate overlays: `velo-toggle-command-palette`, `velo-move-to-folder`, etc.
4. Router syncs with thread selection: `useRouterSyncBridge` keeps `threadStore.selectedThreadId` in sync with route params

## Key Abstractions

**EmailProvider Interface:**
- Purpose: Unify Gmail API and IMAP/SMTP behind single contract
- Examples: `services/email/gmailProvider.ts`, `services/email/imapSmtpProvider.ts`
- Pattern: Factory pattern via `getEmailProvider(accountId)` returns appropriate implementation
- Operations: listFolders, initialSync, deltaSync, archive, trash, star, send, etc.

**SyncManager Orchestrator:**
- Purpose: Coordinate account sync scheduling, status reporting, error recovery
- Location: `services/gmail/syncManager.ts`
- Pattern: Interval-based background job with callback subscription for status updates
- Features: 60-second sync interval, history expiry fallback, progress reporting, calendar sync

**Offline Queue System:**
- Purpose: Guarantee email operations succeed even when offline
- Location: `services/queue/queueProcessor.ts`, `pending_operations` table
- Pattern: Job queue with exponential backoff, deduplication, conflict detection
- Process: Every 30 seconds, retry pending ops; on reconnect, flush immediately

**AI Service Abstraction:**
- Purpose: Support multiple LLM providers (Claude, OpenAI, Gemini) with unified interface
- Location: `services/ai/aiService.ts`, `services/ai/providers/`
- Pattern: Provider manager with switchable implementation per feature
- Features: Summarization, smart replies, categorization, task extraction, writing style analysis

**Threading Engine:**
- Purpose: Group IMAP messages into conversation threads
- Location: `services/threading/threadBuilder.ts`
- Pattern: JWZ algorithm with incremental support, phantom containers, subject-based merging
- Input: Raw messages with Message-ID, References, In-Reply-To headers
- Output: Nested thread structure compatible with Gmail threads

**Filter & Categorization Engines:**
- Purpose: Auto-apply rules and AI categorization to incoming messages
- Location: `services/filters/filterEngine.ts`, `services/categorization/ruleEngine.ts`
- Pattern: AND logic for criteria, action chaining
- Timing: Applied during sync, cached in DB for performance

**Folder Mapper:**
- Purpose: Map IMAP folders to Gmail-style labels
- Location: `services/imap/folderMapper.ts`
- Pattern: Multi-strategy matching — special-use flags, well-known names, custom names
- Output: Unified label hierarchy across IMAP and Gmail

## Entry Points

**Main App:**
- Location: `src/main.tsx`
- Triggers: Browser load or Tauri window creation
- Responsibilities: Route to `App` component or pop-out window (`ThreadWindow`, `ComposerWindow`) based on URL params

**App Component:**
- Location: `src/App.tsx` (670+ lines)
- Triggers: On page load after window detection
- Responsibilities:
  1. Initialize database and restore persisted settings
  2. Load accounts and Gmail API clients
  3. Start background sync, snooze checkers, queue processor, update checker
  4. Initialize notifications, global shortcuts, deep link handler
  5. Set up network status detection for offline mode
  6. Render main layout with sidebar, email list, reading pane, overlays

**Router:**
- Location: `src/router/routeTree.tsx`
- Triggers: TanStack React Router navigation
- Routes:
  - `/mail/$label` → MailLayout with email list filtered by label
  - `/settings/$tab` → Settings page (lazy-loaded)
  - `/calendar` → Calendar page (lazy-loaded)
  - `/tasks` → Tasks page (lazy-loaded)
  - `/attachments` → Attachment library (lazy-loaded)
  - `/help/$topic` → Help page with search (lazy-loaded)

**Background Jobs:**
- `startBackgroundSync()` → 60-second interval, runs sync for active accounts
- `startSnoozeChecker()` → 60-second interval, unsnoozes threads past their deadline
- `startScheduledSendChecker()` → 60-second interval, sends scheduled emails
- `startFollowUpChecker()` → 60-second interval, checks for unanswered threads
- `startBundleChecker()` → 60-second interval, delivers newsletters per schedule
- `startQueueProcessor()` → 30-second interval, retries offline-queued operations
- `startPreCacheManager()` → 15-minute interval, pre-caches small recent attachments

## Error Handling

**Strategy:** Graceful degradation with user feedback. Sync errors don't block UI. Network errors trigger offline mode. Invalid data logged and skipped.

**Patterns:**

- **Sync errors**: Caught in `syncManager`, status bar shows "Sync failed: {message}", auto-clears after 8 seconds
- **History expiry**: Caught in `deltaSync`, triggers automatic full sync fallback
- **Offline operations**: Queued with retry backoff; on reconnect, flushed automatically via `triggerQueueFlush()`
- **Invalid email data**: Logged via console.error, message stored with `errors` field for debugging
- **IMAP connection failures**: `imapProvider.testConnection()` reports error; user can manually re-add account
- **OAuth token expiry**: Gmail clients auto-refresh 5 minutes before expiry; IMAP uses `ensureFreshToken()` before sync
- **Attachment caching failure**: Gracefully falls back to fetch-on-demand; size limit prevents bloat
- **AI API failures**: Service returns null; UI shows fallback content or disables feature gracefully

## Cross-Cutting Concerns

**Logging:**
- Frontend: `console.log()`, `console.error()` — visible in browser DevTools and Tauri app console
- Backend: Rust `println!()` → captured by Tauri log capture (if plugin enabled)
- No persistent log files; logs cleared on app restart

**Validation:**
- TypeScript strict mode enforces type safety
- Database schema migrations version-tracked; old migrations can't run twice
- Search query parser validates operators before building SQL
- Email provider methods throw typed errors on invalid input

**Authentication:**
- Gmail: OAuth2 PKCE flow, localhost server on port 17248-17251, tokens cached per account in `tokenManager`
- IMAP: Plain username/password or OAuth2, encrypted AES-256-GCM in SQLite
- Tokens refresh before expiry (Gmail 5 min before), or on 401 response
- Session tokens not stored on disk; recreated each startup

**Performance:**
- Draft auto-save: 3-second debounce (not configurable)
- Attachment pre-caching: 15-minute interval, <5MB files only, max 7 days old
- Message FTS5 search: Trigram tokenizer for substring matching
- AI results cached in `ai_cache` table; cache key includes model version
- Images in email blocked by default; allowlist per sender in DB
- Sync delta: Single API call when idle (Gmail History API); IMAP uses UIDVALIDITY tracking

---

*Architecture analysis: 2026-02-24*
