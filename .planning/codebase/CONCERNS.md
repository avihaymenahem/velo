# Codebase Concerns

**Analysis Date:** 2026-02-24

## Tech Debt

**SettingsPage monolithic component:**
- Issue: `src/components/settings/SettingsPage.tsx` is 2323 lines with 9 major settings tabs embedded inline (general, notifications, composing, mail-rules, people, accounts, shortcuts, ai, about). No separate tab components — all logic mixed together with heavy state management.
- Files: `src/components/settings/SettingsPage.tsx`
- Impact: Hard to maintain, difficult to test, slow renders with many conditional branches and nested state updates. Adding new settings tabs requires editing one massive file.
- Fix approach: Extract each tab into separate sub-components (`GeneralTab.tsx`, `NotificationsTab.tsx`, etc). Move local state management into Zustand stores per tab where appropriate. Use React.memo on tab components to prevent unnecessary re-renders.

**EmailList component complexity:**
- Issue: `src/components/layout/EmailList.tsx` is 760 lines handling pagination, category tabs, smart folders, bundle rules, filters, and multi-select all in one component. Mixes data fetching, filtering logic, and UI rendering.
- Files: `src/components/layout/EmailList.tsx`
- Impact: Difficult to test individual features (bundling, categorization, pagination). Changes to one feature risk breaking another. High cognitive load when understanding data flow.
- Fix approach: Extract sub-features into separate hooks (`useEmailListPagination`, `useCategoryFiltering`, `useBundleFiltering`). Extract rendering concerns into smaller components (`ThreadCardWrapper`, `EmptyStateSelector`). Consider using useCallback for expensive computations.

**Composer TipTap integration (606 lines):**
- Issue: `src/components/composer/Composer.tsx` handles rich text editing, auto-save, signatures, templates, AI assist panel, attachment upload, and scheduling all inline. TipTap editor lifecycle tightly coupled to component.
- Files: `src/components/composer/Composer.tsx`
- Impact: Difficult to test editor features independently. Auto-save debounce (3s) is hardcoded. Adding new editor features requires modifying core component.
- Fix approach: Extract editor state and extensions into a custom hook `useComposerEditor()`. Create separate `ComposerToolbar`, `ComposerSignaturePanel`, `ComposerAiPanel` sub-components. Move auto-save into a dedicated service with configurable debounce.

**ContactSidebar large component:**
- Issue: `src/components/email/ContactSidebar.tsx` is 445 lines displaying sender details, email frequency, calendar events, related threads, and contact actions in one component.
- Files: `src/components/email/ContactSidebar.tsx`
- Impact: Long initial render. Multiple independent data fetches happening in parallel without optimized query batching.
- Fix approach: Split into `ContactHeader`, `ContactFrequency`, `ContactCalendar`, `ContactThreads` sub-components. Memoize independent sections. Consider batching related queries.

## Known Bugs

**IMAP UIDVALIDITY invalidation handling:**
- Symptoms: If an IMAP server changes UIDVALIDITY on a folder, cached UIDs become invalid. Current code may attempt to fetch messages with stale UIDs, causing "message not found" errors in logs.
- Files: `src/services/imap/imapSync.ts` (lines 1-60), `src/services/db/folderSyncState.ts`
- Trigger: IMAP server folder reconstitution, mailbox rebuilding, or certain server maintenance events
- Workaround: Manual "Resync Account" from Settings triggers `forceFullSync()` which clears all cached state and re-fetches from scratch. However, this should happen automatically.
- Fix approach: Detect UIDVALIDITY changes during delta sync check (via `imapDeltaCheck`). When detected, delete all messages/threads for that folder from the local DB and re-fetch from scratch.

**Multi-window state inconsistency:**
- Symptoms: Editing settings, composing a draft, or reading a thread in the main window may not reflect immediately in pop-out thread windows. Pop-out windows share the same SQLite DB but have independent Zustand stores that don't synchronize.
- Files: `src/ThreadWindow.tsx`, `src/App.tsx`, all Zustand stores (`src/stores/`)
- Trigger: Open thread in new window, make changes in main window, then switch to pop-out window. Changes may not be visible until page refresh.
- Workaround: Refresh the pop-out window or close/reopen it.
- Fix approach: Implement Tauri window event channel for store sync. When main window updates Zustand store, emit event to all other windows. Pop-out windows listen and update their stores. Consider using `storage` or `idb` middleware on Zustand stores for cross-window persistence.

**Draft auto-save debounce timing:**
- Symptoms: Drafts auto-save every 3 seconds. If the app crashes or closes immediately after changes, those changes may not be saved due to debounce delay.
- Files: `src/services/composer/draftAutoSave.ts` (line 75, hardcoded 3s), `src/components/composer/Composer.tsx`
- Impact: User can lose recent compose work if app crashes within 3s of last keystroke.
- Fix approach: Reduce debounce to 1s, or add a "Save now" button. Consider saving on every paragraph/sentence completion, not just on pause. Add warning banner if unsaved changes exist.

**ThreadWindow initialization race condition:**
- Symptoms: Pop-out thread windows may show "Missing thread or account parameter" error even though parameters are in URL, or may load thread before Gmail clients are initialized.
- Files: `src/ThreadWindow.tsx` (lines 34-72)
- Trigger: Opening many thread windows in rapid succession
- Workaround: Wait for main window to fully initialize before opening pop-outs
- Fix approach: Add explicit wait for `initializeClients()` to complete. Validate thread parameters before starting async init. Add timeout with retry logic.

## Security Considerations

**OAuth tokens in memory without session timeout:**
- Risk: `GmailClient` instances held in `clients` Map in `src/services/gmail/tokenManager.ts` remain in memory for the app's lifetime. If the app process is left unattended or compromised via memory inspection, tokens could be exposed.
- Files: `src/services/gmail/tokenManager.ts` (line 9)
- Current mitigation: Tokens are encrypted at rest in SQLite. In-memory token objects are JavaScript objects (not specially hardened). Auto-refresh 5min before expiry prevents stale tokens being used.
- Recommendations: Implement token expiry timer in `GmailClient` that clears memory after 24h of inactivity. Add per-account session timeout setting. Consider using `@ctrl/ref` or similar library for memory-safe token storage.

**IMAP password storage — partial encryption:**
- Risk: IMAP passwords are encrypted with AES-256-GCM and stored in SQLite, but the encryption key is hardcoded or derived from a fixed seed. If the database is copied/backed up, passwords can be decrypted if key is compromised.
- Files: `src/services/db/accounts.ts` (encryption/decryption logic), `src-tauri/src/` (Rust crypto)
- Current mitigation: Passwords only stored when user configures IMAP (not for Gmail OAuth). Encryption uses AES-256-GCM (authenticated encryption). No plaintext in logs.
- Recommendations: Use OS keychain for password storage (macOS Keychain, Windows DPAPI, Linux Secret Service) instead of app-managed encryption. Rotate encryption keys periodically. Never export/backup database without re-encrypting.

**XOAUTH2 token handling in IMAP client:**
- Risk: XOAUTH2 authenticator formats user + bearer token into plaintext byte string (`user={user}\x01auth=Bearer {token}\x01\x01`). If IMAP connection is unencrypted (PLAIN/STARTTLS failure), token is transmitted in cleartext.
- Files: `src-tauri/src/imap/client.rs` (lines 40-63), `src/services/imap/imapSync.ts`
- Current mitigation: STARTTLS is required by default. SSL/TLS connections are validated. Code warns if TLS handshake fails.
- Recommendations: Enforce minimum TLS version (1.2+). Disable PLAIN auth mode. Add certificate pinning for well-known providers (Gmail, Outlook, etc). Log security warnings to file, not console.

**DOMPurify usage for email rendering:**
- Risk: `sanitizeHtml()` in `src/utils/sanitize.ts` (line 12) uses DOMPurify with ALLOW_UNKNOWN_PROTOCOLS set to `false`. However, some email clients use custom protocols (e.g., `zdf://` for secure links). Blocking unknown protocols may break legitimate email content.
- Files: `src/utils/sanitize.ts`, `src/components/email/EmailRenderer.tsx`
- Current mitigation: DOMPurify forbids script/style/iframe/object/embed/form tags. Content rendered in sandboxed iframe. Remote images blocked by default.
- Recommendations: Whitelist safe custom protocols. Test with emails from enterprise platforms (Slack, Teams, Zoom). Add admin override for specific protocols. Document why protocols are blocked in help.

**AI provider API keys in SQLite:**
- Risk: Claude, OpenAI, and Gemini API keys are stored in SQLite settings table (`api_key_claude`, `api_key_openai`, etc.). If database is exported or backed up, keys are exposed.
- Files: `src/services/db/settings.ts`, `src/services/ai/providerManager.ts`
- Current mitigation: Keys are marked as "secure" settings but still in SQLite. BYOK model means users understand they're storing keys locally.
- Recommendations: Move API keys to OS keychain (via Tauri plugin) instead of database. Encrypt keys at-rest using user's master password (if implemented). Add key rotation UI. Never log API keys or send to telemetry.

## Performance Bottlenecks

**FTS5 trigram search on large message tables:**
- Problem: Full-text search on `messages` table via FTS5 with trigram tokenizer. As message count grows (100k+), MATCH queries slow down. No pagination on FTS results — all matching rows fetched before limiting.
- Files: `src/services/db/search.ts` (line 58-62), `src/services/db/migrations.ts` (line 185-206)
- Cause: FTS5 does full table scan for MATCH. Trigram tokenizer creates many index entries. No covering indexes for common filters (date, account_id).
- Improvement path: Add FTS5 FILTER clause for account_id before MATCH to reduce search space. Consider rebuilding FTS index if it grows beyond configurable threshold. Profile with 500k+ messages. May need to split FTS table by account.

**Pre-cache manager in-memory binary handling:**
- Problem: `src/services/attachments/preCacheManager.ts` (line 65) decodes base64 attachment data inline: `Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0))`. For large attachments (5MB limit), this creates intermediate strings and arrays in memory. No streaming.
- Files: `src/services/attachments/preCacheManager.ts` (line 65)
- Cause: `atob()` decodes entire base64 string to memory. `Uint8Array.from()` with mapping function iterates every byte.
- Improvement path: Use `atob()` with chunks if available. Stream attachment to disk directly without intermediate memory copy. Use Web Crypto API `SubtleCrypto` for efficient binary handling.

**Category tabs full load of all threads:**
- Problem: `src/components/email/CategoryTabs.tsx` loads entire thread list for each category (Primary, Updates, Promotions, Social, Newsletters) on initial render. If inbox has 10k threads, 5 tabs * 10k threads = 50k DB queries in worst case.
- Files: `src/components/email/CategoryTabs.tsx`, `src/components/layout/EmailList.tsx` (line 71-74)
- Cause: No lazy loading of category data. Each tab switches category, which re-fetches full thread list. Only active tab should fetch.
- Improvement path: Implement lazy loading — fetch category data only when tab becomes active. Use cache to avoid re-fetching switched tabs. Add pagination per category instead of loading all threads.

**Sync loop overhead:**
- Problem: `src/services/gmail/syncManager.ts` runs 60-second interval for all accounts. `src/services/imap/imapSync.ts` may fetch 50 messages/batch with delays between batches. No adaptive sync speed based on connection quality or message volume.
- Files: `src/services/gmail/syncManager.ts`, `src/services/imap/imapSync.ts` (line 50-51, hardcoded 1s delay)
- Cause: Fixed 60s interval regardless of account size. Fixed 1s delay between IMAP folder batches. No exponential backoff on slow connections.
- Improvement path: Add account-specific sync intervals (smaller accounts = longer intervals). Detect connection speed and adjust batch delays. Implement progressive sync (sync inbox first, then other folders). Skip sync on metered connections.

**Contact autocomplete query on every keystroke:**
- Problem: Address input in composer queries contacts DB on every keystroke. No debounce on query, no result caching.
- Files: `src/components/composer/AddressInput.tsx`
- Impact: With 10k+ contacts, each query is slow. Searching becomes laggy.
- Improvement path: Add 200ms debounce on input. Cache results per prefix. Implement LIMIT 20 for dropdown. Use COLLATE NOCASE for faster substring matching.

## Fragile Areas

**IMAP message threading algorithm:**
- Files: `src/services/threading/threadBuilder.ts` (480 lines), `src/services/imap/imapSync.ts` (957 lines)
- Why fragile: JWZ threading relies on Message-ID, References, and In-Reply-To headers. IMAP clients often generate inconsistent headers. Missing Message-IDs cause phantom container creation. Subject-based merging can group unrelated emails. Incremental threading may create orphaned message containers if messages arrive out-of-order.
- Safe modification: Write comprehensive tests for edge cases (missing Message-ID, circular references, deeply nested threads, headers with non-ASCII characters). Profile with real-world IMAP sources (corporate email, hosted providers). Consider adding a "rebuid thread" background job that validates thread integrity.
- Test coverage: `src/services/threading/threadBuilder.test.ts` has 814 lines of tests, which is good. But gaps remain in IMAP-specific edge cases.

**Filter and categorization rules:**
- Files: `src/services/filters/filterEngine.ts`, `src/services/categorization/ruleEngine.ts`, `src/services/categorization/backfillService.ts`
- Why fragile: Multiple rule engines (filter, categorization, smart labels) all modify thread state independently during sync. No locking mechanism prevents two rules from operating on the same thread simultaneously. If sync is interrupted, partial rule application state is stored.
- Safe modification: Add transaction boundaries around bulk rule application. Implement idempotency markers so re-running rules is safe. Test rule combinations that should be mutually exclusive (e.g., archive + apply label).
- Test coverage: Gaps in testing rule conflicts and race conditions.

**Offline queue processing:**
- Files: `src/services/queue/queueProcessor.ts` (87 lines), `src/services/db/pendingOperations.ts`
- Why fragile: Queue compaction logic attempts to merge redundant operations (e.g., mark-read + mark-unread on same thread). If compaction fails or is interrupted, duplicate operations can be queued. Retry logic uses exponential backoff (60s → 300s → 900s → 3600s), but if device stays offline for hours, operations may be permanently lost.
- Safe modification: Add idempotency tokens to operations. Test queue processing when alternating online/offline repeatedly. Verify all operation types handle partial success (e.g., archive some messages, fail on others). Test queue size limits — if queue grows unbounded, app may crash.
- Test coverage: `src/services/queue/queueProcessor.test.ts` exists but may lack offline edge cases.

**Gmail History API fallback:**
- Files: `src/services/gmail/sync.ts` (439 lines), `src/services/gmail/syncManager.ts`
- Why fragile: History API expires after ~30 days. If user doesn't sync for 31+ days, code falls back to full sync. Full sync on large inboxes (100k+ messages) takes hours and may timeout. User sees stale inbox during full sync, then sudden influx of old messages.
- Safe modification: Implement incremental history window. Detect when history will expire soon and do full sync proactively (every 25 days). Add pause/resume logic for long syncs. Test with 500k+ message accounts.
- Test coverage: Gaps in history expiration scenarios and very large account handling.

**Multi-window Zustand store sync:**
- Files: `src/App.tsx`, `src/ThreadWindow.tsx`, all stores in `src/stores/`
- Why fragile: Pop-out thread windows have independent Zustand store instances that share SQLite DB but don't sync state. Editing settings in main window doesn't update pop-out windows. Composing in pop-out doesn't reflect in main window draft list.
- Safe modification: Implement Tauri window event channel for store updates. Add listener on window open to sync initial state. Test rapid open/close of pop-outs. Verify composite actions (e.g., mark-read + archive) sync correctly across windows.
- Test coverage: No tests for multi-window scenarios.

## Scaling Limits

**SQLite database single-file limit:**
- Current capacity: SQLite performs well up to ~10GB file size. With 100k messages (~50KB average per message with bodies), that's ~5GB of message data alone. Add attachments, metadata, and indexes: database may hit 10GB with 200k messages.
- Limit: When database exceeds 10GB, queries slow down, maintenance operations (VACUUM, ANALYZE) take hours, backups become unwieldy.
- Scaling path: Implement message archival (auto-move messages older than 2 years to separate archive.db). Partition by account_id. Consider migrating to local PostgreSQL or moving to cloud sync (not offline-first, but more scalable).

**In-memory Gmail client cache:**
- Current capacity: `clients` Map in `tokenManager.ts` holds one `GmailClient` per active account. Each client holds tokens in memory. With 10+ accounts, cache grows. No cleanup.
- Limit: If user has 100+ accounts (rare but possible), clients Map grows unbounded. Each `GmailClient` instance (~5KB) × 100 = 500KB plus token strings (~2KB each).
- Scaling path: Implement lazy client creation (create on first use per sync cycle, destroy after sync completes). Add LRU cache to evict least-recently-used clients.

**Attachment cache filesystem limit:**
- Current capacity: Configurable max cache size (default 500MB). Pre-cache manager limits individual attachment size to 5MB. With 500MB limit, max ~100 cached attachments.
- Limit: If user receives 1000+ attachments per week, cache fills up and older attachments are evicted. Re-downloading attachments is slow.
- Scaling path: Implement smart cache with download-on-demand for large attachments. Batch pre-cache operations. Implement attachment de-duplication (same file downloaded twice). Monitor cache hit rate and adjust pre-cache strategy.

**IMAP folder sync parallelization:**
- Current capacity: Code syncs folders sequentially with 1s delay between folders (line 51 in imapSync.ts). For accounts with 50+ folders, full sync takes 50+ seconds.
- Limit: Slow sync times mean user sees stale inbox for minutes. Server may timeout if sync takes too long.
- Scaling path: Implement parallel folder fetching (4-8 concurrent IMAP sessions per account). Add folder priority (sync Inbox first, then other important folders). Detect slow servers and reduce parallelism.

## Dependencies at Risk

**async-imap library (no recent updates):**
- Risk: `async-imap` is used for IMAP client implementation in Rust backend. If library is abandoned or has unpatched vulnerabilities, IMAP support becomes unmaintainable.
- Impact: IMAP protocol changes (RFC extensions, server-specific bugs) can't be fixed without forking. Security vulnerabilities in IMAP parsing accumulate.
- Migration plan: Monitor GitHub for maintenance. If unmaintained for 12+ months, evaluate alternatives (`imap2` fork, `himalaya` IMAP impl, or switch to mail-send/mail-receive libraries).

**DOMPurify version constraints:**
- Risk: DOMPurify is critical for sanitizing email HTML. If a bypass vulnerability is discovered, it's an urgent security issue. Must be kept up-to-date.
- Impact: Email HTML injection attacks could execute scripts or exfiltrate data.
- Migration plan: Pin DOMPurify to recent versions. Subscribe to security advisories. Test new versions before deploying.

**Tauri plugin ecosystem fragmentation:**
- Risk: The app uses ~12 Tauri plugins (sql, notification, opener, log, dialog, fs, http, single-instance, autostart, deep-link, global-shortcut, updater). Each has different maintenance status. Some are community-maintained.
- Impact: When Tauri 2.x updates, plugins may not be compatible. Breaking changes in plugin APIs require app changes.
- Migration plan: Prioritize plugins by criticality (sql, notification, http are critical). Monitor Tauri roadmap. Consider maintaining critical plugins in-tree if community versions become unmaintained.

**Let's Encrypt certificate renewal (if using SSL):**
- Risk: If app implements server-side TLS for OAuth or other services, Let's Encrypt cert renewal must be automated. If renewal fails, users can't connect.
- Impact: Outage if cert expires and isn't renewed.
- Recommendation: Implement automated cert renewal. Add monitoring for cert expiry warnings.

## Missing Critical Features

**Message encryption (E2E):**
- Problem: No PGP/S/MIME encryption support. Email contents are always plaintext in SQLite and in transit (relying only on TLS).
- Blocks: Users can't send/receive encrypted emails from PGP-using contacts.

**Attachment encryption:**
- Problem: Cached attachments on disk are not encrypted. If device is stolen, attachments can be read.
- Blocks: Users storing sensitive docs in email can't confidently cache them.

**Master password / local encryption:**
- Problem: Database is not encrypted at rest. If attacker has device, they can copy velo.db and read all emails/contacts/settings.
- Blocks: Users with privacy requirements can't use app on shared/public devices.

**Backup & sync:**
- Problem: No built-in backup or cloud sync. If app data is corrupted or device is lost, local labels/filters/templates/signatures are gone.
- Blocks: Users can't migrate to new device without manual re-setup.

## Test Coverage Gaps

**IMAP UIDVALIDITY invalidation:**
- What's not tested: When IMAP folder UIDVALIDITY changes, code should detect it and re-sync. Current test suite may not cover this scenario.
- Files: `src/services/imap/imapSync.ts`, `src/services/db/folderSyncState.ts`
- Risk: Users may see ghost messages or "message not found" errors without realizing they need to manually resync.
- Priority: **High** - This is a real-world issue with IMAP servers.

**Multi-window state consistency:**
- What's not tested: Pop-out thread windows and main window with simultaneous edits. Zustand stores not syncing across windows.
- Files: `src/ThreadWindow.tsx`, all Zustand stores
- Risk: Users think data is saved in one window, but it's not visible in another.
- Priority: **High** - Common user workflow.

**Offline queue edge cases:**
- What's not tested: Queue compaction with many redundant operations. Retry backoff when offline for extended periods. Operation execution when network is flaky (rapid online/offline cycles).
- Files: `src/services/queue/queueProcessor.ts`, `src/services/db/pendingOperations.ts`
- Risk: Data loss if queue becomes corrupted or operations are permanently failed without user awareness.
- Priority: **Medium** - Less common, but critical when it happens.

**Gmail History API expiration:**
- What's not tested: Sync when history has expired (>30 days since last sync). Full sync fallback performance with 100k+ messages.
- Files: `src/services/gmail/sync.ts`
- Risk: Users with spotty connectivity may trigger full syncs that hang or timeout.
- Priority: **Medium** - Edge case but impacts users who don't open app regularly.

**Filter rule conflict resolution:**
- What's not tested: Multiple filters matching same message with conflicting actions (e.g., archive + apply-label both trigger). Smart label classification conflicts with user-defined filters.
- Files: `src/services/filters/filterEngine.ts`, `src/services/categorization/`
- Risk: Threads move to unexpected folders or have unexpected labels.
- Priority: **Medium** - Users with complex filter setups.

---

*Concerns audit: 2026-02-24*
