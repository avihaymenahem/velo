# External Integrations

**Analysis Date:** 2026-02-24

## APIs & External Services

**Email APIs:**
- Google Gmail API (v1) - Full email read/write/send
  - SDK: Custom GmailClient wrapper in `src/services/gmail/client.ts`
  - Auth: OAuth2 PKCE flow via `src/services/gmail/auth.ts`
  - Scopes: gmail.readonly, gmail.modify, gmail.send, gmail.labels, userinfo.email, userinfo.profile
  - Token refresh: Auto-refresh 5min before expiry in `src/services/gmail/client.ts`
  - History API fallback after ~30 days retention

- IMAP/SMTP - Non-Gmail accounts
  - IMAP Client: async-imap (0.10) with tokio via Rust backend
  - SMTP Client: lettre (0.11) with tokio-native-tls
  - Rust commands: `imap_*` and `smtp_*` via Tauri IPC (`src-tauri/src/commands.rs`)
  - Auto-discovery: Pre-configured for Outlook, Yahoo, iCloud, AOL, Zoho, FastMail, GMX in `src/services/imap/autoDiscovery.ts`
  - Security modes: SSL (port 993/465), STARTTLS (port 587), unencrypted (port 143/25)

**Calendar APIs:**
- Google Calendar API (v3) - Read/write calendar events
  - SDK: Direct HTTP calls wrapped in GoogleCalendarProvider (`src/services/calendar/googleCalendarProvider.ts`)
  - Auth: Shared Gmail OAuth (same token scope: calendar.readonly, calendar.events)
  - Sync: Full list + differential sync via nextSyncToken

- CalDAV/WebDAV - Generic calendar protocol
  - SDK: tsdav (2.1.8) - RFC 4918/5545 compliant
  - Provider: CalDAVProvider (`src/services/calendar/caldavProvider.ts`)
  - Usage: Alternative calendar sync for non-Google calendars (Nextcloud, iCloud, others)

**AI/LLM Services:**
- Anthropic Claude API
  - SDK: @anthropic-ai/sdk (0.74.0)
  - Provider: `src/services/ai/providers/claudeProvider.ts`
  - API Key setting: `claude_api_key` (encrypted in SQLite settings)
  - Model setting: `claude_model_setting` (defaults to latest Claude model)
  - Models supported: Any Anthropic-published model (claude-3-opus, claude-3-sonnet, etc.)

- OpenAI GPT API
  - SDK: openai (6.21.0)
  - Provider: `src/services/ai/providers/openaiProvider.ts`
  - API Key setting: `openai_api_key` (encrypted)
  - Model setting: `openai_model_setting`

- Google Gemini API
  - SDK: @google/generative-ai (0.24.1)
  - Provider: `src/services/ai/providers/geminiProvider.ts`
  - API Key setting: `gemini_api_key` (encrypted)
  - Model setting: `gemini_model_setting`

- Ollama (Local LLM)
  - Provider: `src/services/ai/providers/ollamaProvider.ts`
  - Server URL setting: `ollama_server_url` (default: http://localhost:11434)
  - Model setting: `ollama_model` (default: llama3.2)
  - API style: OpenAI-compatible endpoint (/v1/chat/completions)
  - No authentication required (local)

- GitHub Copilot Chat API
  - Provider: `src/services/ai/providers/copilotProvider.ts` (GitHub token-based or local)
  - Server URL: localhost:1234 (alternative dev endpoint)
  - Authentication: Token from settings or local instance

**Contact Management:**
- Gravatar API - Profile images for email contacts
  - Endpoint: https://www.gravatar.com/avatar/{hash}
  - Hash: MD5 of normalized email (custom implementation in `src/services/contacts/gravatar.ts`)
  - Caching: Cached per contact in local contacts table
  - Fallback: 404 if no Gravatar found (returns null)

**OAuth Providers (IMAP Email Accounts):**
- Microsoft (Outlook/Hotmail)
  - Auth URL: https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize
  - Token URL: https://login.microsoftonline.com/consumers/oauth2/v2.0/token
  - Scopes: IMAP.AccessAsUser.All, SMTP.Send, offline_access, openid, profile, email
  - PKCE: Required (configured in `src/services/oauth/providers.ts`)
  - Implementation: `src/services/oauth/oauthFlow.ts`

- Yahoo Mail
  - Auth URL: https://api.login.yahoo.com/oauth2/request_auth
  - Token URL: https://api.login.yahoo.com/oauth2/get_token
  - Scopes: mail-r, mail-w, openid, sdps-r
  - User Info URL: https://api.login.yahoo.com/openid/v1/userinfo
  - PKCE: Supported
  - Implementation: `src/services/oauth/oauthFlow.ts`

## Data Storage

**Primary Database:**
- SQLite 3 - Local file: `velo.db`
  - Client: tauri-plugin-sql (2.3.2)
  - Connection: `src/services/db/connection.ts` (singleton pattern via getDb())
  - Migrations: Version-tracked in `_migrations` table, 19 migrations in `src/services/db/migrations.ts`
  - Transaction support: via `withTransaction()` helper
  - FTS5 full-text search: `messages_fts` table with trigram tokenizer

**Key Tables (37 total):**
- `accounts` - Email account configs (Gmail OAuth + IMAP/SMTP settings, encrypted passwords)
- `messages` - Email messages with FTS5 index, auth results, IMAP metadata
- `threads` - Conversation grouping (is_pinned, is_muted flags)
- `labels` - Gmail labels + IMAP folder mappings
- `contacts` - Email contacts with frequency ranking and Gravatar URLs
- `attachments` - Cached attachments with size tracking
- `settings` - Key-value store for app preferences (encrypted values via AES-256-GCM)
- `ai_cache` - AI provider results (summaries, replies, categorizations)
- `filter_rules`, `templates`, `signatures` - User-defined email rules and templates
- `scheduled_emails`, `local_drafts` - Composing state and scheduling
- `tasks`, `task_tags` - Task management with recurrence rules
- `smart_folders`, `smart_label_rules` - Saved searches and AI labeling
- `bundles`, `bundled_threads` - Newsletter bundling
- `calendar_events`, `calendars` - Google Calendar sync
- `pending_operations` - Offline queue for email actions (archive, trash, read, send)
- `folder_sync_state` - IMAP UIDVALIDITY/last_uid tracking per folder
- Plus: thread_categories, follow_up_reminders, notification_vips, unsubscribe_actions, link_scan_results, phishing_allowlist, send_as_aliases, writing_style_profiles

**Encryption:**
- Algorithm: AES-256-GCM (Web Crypto API in browser, invoked from Rust)
- Uses: IMAP passwords, OAuth tokens (optional), API keys (Claude, OpenAI, Gemini), OAuth client secrets
- Format: Prefixed with encryption marker to distinguish encrypted/plaintext
- Functions: `encryptValue()`, `decryptValue()`, `isEncrypted()` in `src/utils/crypto.ts`

**Caching:**
- AI results: `ai_cache` table (summaries, smart replies, categorizations)
- Attachments: Local filesystem cache with size limits (5MB threshold for pre-cache, 7-day retention)
- Contacts: Frequency-ranked and cached with Gravatar URLs

## Authentication & Identity

**Gmail:**
- OAuth2 PKCE (Proof Key for Code Exchange)
- Flow: Start localhost server → consent screen → capture auth code → exchange for tokens
- Tokens: Stored in `accounts` table (access_token, refresh_token encrypted)
- Refresh: Automatic 5min before expiry
- Scopes: gmail.readonly, gmail.modify, gmail.send, gmail.labels, userinfo.*, calendar.*

**IMAP Email Accounts:**
- Microsoft: OAuth2 with PKCE (via `oauthFlow.ts`)
- Yahoo: OAuth2 with PKCE
- Others: Password-based (username + password, encrypted in `imap_password` column)
- IMAP Username: Optional (falls back to email if not set)

**Local Settings Storage:**
- API Keys: Encrypted in SQLite `settings` table
- OAuth Client Credentials: Optional user-provided Google Client ID/Secret
- Settings keys: `claude_api_key`, `openai_api_key`, `gemini_api_key`, `copilot_api_key`, `ai_provider`

## Monitoring & Observability

**Error Tracking:**
- Not detected - No external error tracking service

**Logging:**
- Tauri Log Plugin - Logs to stderr + file via `tauri-plugin-log`
- Browser Console - JavaScript errors visible in devtools
- No external log aggregation

## CI/CD & Deployment

**Hosting:**
- Desktop app - Distributed as native binaries (Windows .exe, macOS .dmg, Linux .AppImage)
- Code: GitHub repository (GitHub releases for updater)

**Update Mechanism:**
- Tauri Updater Plugin - Fetches `latest.json` from GitHub Releases
- Endpoint: https://github.com/avihaymenahem/velo/releases/latest/download/latest.json
- Public key: Stored in `tauri.conf.json`

**CI Pipeline:**
- release-please - Automated versioning & changelog (evidenced by release commits in git log)

**Build Targets:**
- Windows (x86_64, arm64)
- macOS (x86_64, arm64, universal binary via entitlements)
- Linux (x86_64, ARM via Flatpak)

## Environment Configuration

**Required for Gmail:**
- Google OAuth Client ID (user-configured in Settings)
- Optional: Google OAuth Client Secret (user-configured)

**Required for AI:**
- At least one of: Claude API key, OpenAI API key, Gemini API key, or Ollama server URL
- Selected provider stored in `ai_provider` setting (default: claude)
- Model per provider: stored in `claude_model_setting`, `openai_model_setting`, etc.

**Required for IMAP Accounts:**
- Email provider auto-discovery or manual server entry (host, port, security)
- Username & password (encrypted)
- Optional: OAuth provider (Microsoft, Yahoo)

**Secrets Location:**
- All sensitive data: SQLite `settings` table with AES-256-GCM encryption
- IMAP passwords: `imap_password` column in `accounts` table (encrypted)
- OAuth tokens: `access_token`, `refresh_token` columns in `accounts` table (encrypted)
- No `.env` file support detected - Settings stored in SQLite only

## Webhooks & Callbacks

**Incoming:**
- OAuth callback: localhost:17248 (ports 17249-17251 fallback) via Rust OAuth server
- Deep link: `mailto:` protocol handler (registered via tauri-plugin-deep-link)
- Tauri IPC events: `velo-sync-done`, `velo-toggle-command-palette`, `velo-move-to-folder`, `tray-check-mail`

**Outgoing:**
- Unsubscribe: RFC 8058 List-Unsubscribe-Post or mailto: fallback
- Calendar sync: Pull-based (no webhooks, polling via background checkers)
- Email sync: Pull-based (IMAP UIDVALIDITY/last_uid, Gmail History API)

## Cross-Origin & CSP

**Content Security Policy (from tauri.conf.json):**
```
connect-src:
  https://www.googleapis.com
  https://oauth2.googleapis.com
  https://api.anthropic.com
  https://api.openai.com
  https://generativelanguage.googleapis.com
  https://www.gravatar.com
  https://login.microsoftonline.com
  https://graph.microsoft.com
  https://api.login.yahoo.com
  http://localhost:11434 (Ollama)
  http://localhost:1234 (Copilot)
  http://127.0.0.1:11434
  http://127.0.0.1:1234
  https://models.github.ai
```

**Image Sources:**
- Self, data URIs, Gravatar, GoogleUserContent (Gmail avatars)

---

*Integration audit: 2026-02-24*
