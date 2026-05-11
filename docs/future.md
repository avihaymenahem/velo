Based on the actual Velo architecture docs, here's a **grounded feature roadmap** that extends what's already built without fighting the local-first, SQLite-centric design.

---

## What's Already There (Don't Reinvent)

The codebase already covers ~70% of your original requirements:

| Your Need | Velo's Existing Implementation |
|-----------|-------------------------------|
| **Queues** | `queue/` offline processor + `pending_operations` table (30s interval) |
| **Templates** | `templates` table + reusable variables in TipTap composer |
| **Scheduler** | `scheduled_emails` table + 60s background checker |
| **Auto-responses** | `filters/` engine + `quickSteps/` action chains |
| **AI writing** | `ai/` service with 3 providers, writing style profiles, auto-drafts |
| **Spam/phishing** | 10 heuristic rules, SPF/DKIM/DMARC badges, link scanner |
| **Search** | FTS5 with trigram tokenizer, Gmail-style query parser |
| **Tasks** | Full `tasks` table with priorities, subtasks, recurrence, `task_tags` |
| **Calendar** | Google Calendar sync |
| **Signatures** | Multiple signatures per account, `signatures` table |
| **Smart folders** | `smart_folders` with dynamic query tokens |
| **Bundling** | `bundle_rules` + `bundled_threads` for newsletters |

---

## Phase 1: i18n, RTL & Localization *(Week 1-2)*

**The gap:** Zero internationalization. Hardcoded English strings, LTR-only layout, Gregorian-only calendar.

**Architecture fit:** React 19 + Tailwind v4 makes this straightforward.

### Implementation

| Feature | Where it lives | How |
|---------|---------------|-----|
| **i18n engine** | `src/` root | Add `i18next` + `react-i18next`. Wrap all UI strings. Keep JSON files per locale (`en`, `fr`, `ar`) |
| **RTL layout** | `src/stores/uiStore.ts` | Add `textDirection: 'ltr' \| 'rtl'` to `uiStore`. Tailwind v4 supports `dir="rtl"` natively |
| **Arabic font** | `src/styles/` | Add Tajawal/Noto Sans Arabic to the glassmorphism theme system |
| **Hijri calendar** | `src/components/calendar/` | Extend `CalendarPage` with `Intl.DateTimeFormat` + `calendar: 'islamic'` toggle in settings |
| **French formatting** | `src/utils/date.ts` | Locale-aware date/number formatting for MAD currency and French address sorting |
| **Language switcher** | `src/components/settings/` | Add to existing `SettingsPage` — hot reload without restart |

**Key constraint:** The TipTap v3 editor needs `dir="rtl"` support in the composer. TipTap handles this via `textAlign` extension with `direction: 'rtl'`.

---

## Phase 2: Contact Intelligence — Tags, Segments & Groups *(Week 3-4)*

**The gap:** Contacts exist (`contacts` table, Gravatar, sidebar), but there's no tagging, grouping, or segmentation. `task_tags` exists — contacts have nothing equivalent.

### Implementation

Extend the existing `db/` service layer and SQLite schema:

```sql
-- New tables (fits existing 35-table schema)
contact_tags (id, account_id, name, color, created_at)
contact_tag_pivot (contact_id, tag_id)
contact_groups (id, account_id, name, description, created_at)
contact_group_pivot (contact_id, group_id)
contact_segments (id, account_id, name, query, created_at) -- saved search applied to contacts
```

| Feature | Service layer | UI layer |
|---------|--------------|----------|
| **Contact tags** | `src/services/contacts/` — extend existing contact queries | Tag cloud in `ContactSidebar`, color pills matching `task_tags` pattern |
| **Contact groups** | `src/services/contacts/` — CRUD + pivot management | Add to `ContactEditor`, drag contacts into groups |
| **Smart segments** | `src/services/search/` — reuse query parser, apply to `contacts` table instead of `messages` | New "Segments" view in sidebar under Labels |
| **Contact merge** | `src/services/db/` — detect duplicates by email, merge thread associations | Conflict resolution modal |
| **Contact activity** | `src/services/db/` — aggregate all `messages`, `tasks`, `calendar_events` per contact | Timeline in `ContactSidebar` (vertical list, like thread view) |
| **CSV import** | Rust backend — `src-tauri/src/` add `dialog` + `fs` plugin to parse CSV | Import wizard with column mapping |

**Reuse:** The `smart_folders` query engine already parses Gmail-style operators. Adapt it for contact segmentation (`from:domain.ma`, `has:attachment`, `last_contact:<30days`).

---

## Phase 3: Mail Merge & Lightweight Campaigns *(Week 5-6)*

**The gap:** Templates exist but no bulk send, no personalization variables from contact data, no campaign tracking.

### Implementation

Since Velo is local-first desktop app, **true open/click tracking requires a backend**. But we can build a hybrid that keeps Velo as the composer/launcher and uses a minimal backend (or Nindomail's SMTP logs) for tracking.

#### 3A: Mail Merge (Pure Desktop)

| Feature | Implementation |
|---------|---------------|
| **Template variables** | Extend existing `templateVariables.ts` — add `{{first_name}}`, `{{company}}`, `{{group}}` pulled from `contacts` table |
| **Recipient picker** | Multi-select contacts/groups/segments in composer `AddressInput` |
| **Per-recipient generation** | Rust `smtp/` layer generates individual MIME messages with substituted variables |
| **Rate-limited queue** | Extend `queue/` — add `campaign_id` to `pending_operations`, send with 500ms-2s delays to avoid SMTP throttling |
| **Campaign table** | `campaigns` (id, name, template_id, segment_id, status, sent_at) |

#### 3B: Analytics (Hybrid Approach)

**Option 1 — Minimal Laravel Backend (Your Stack)**
```
Velo Desktop
   │
   ├──► Composes campaign with tracking pixel URL:
   │    <img src="https://your-laravel-app.ma/pixel/{campaign_id}/{recipient_hash}">
   │
   └──► Sends via Nindomail SMTP
        │
        └──► Recipient opens → pixel hits Laravel → logs open
        └──► Recipient clicks → link rewritten through Laravel → logs click → redirects
             
   ◄───► Velo fetches stats: GET /api/campaigns/{id}/stats
```

**Option 2 — Self-Hosted Tracker (No Laravel)**
If the client wants zero backend, use a **serverless edge function** (Cloudflare Worker, Vercel Edge) or a tiny Deno/Node script on their existing hosting. Velo just needs to:
- Embed the pixel URL
- Rewrite links with tracking params
- Fetch JSON stats and render charts (Recharts in React)

**Velo UI additions:**
- New "Campaigns" tab in sidebar (next to Tasks)
- Campaign composer: pick template → pick segment → preview variables → schedule or send now
- Analytics panel: open rate, click rate, bounce list, per-recipient status (delivered → opened → clicked)
- Recharts or simple bar charts for timeline data

**Database in Velo (local cache of stats):**
```sql
campaigns (id, name, template_id, segment_id, status, sent_count, created_at)
campaign_recipients (campaign_id, contact_id, status, opened_at, clicked_at)
```

---

## Phase 4: Advanced Workflow Engine *(Week 7)*

**The gap:** `filters/` can auto-label, archive, trash, star. `quickSteps/` can chain actions. But there's no **time-delayed** or **conditional** automation (e.g., "If no reply in 3 days, send follow-up Template B").

### Implementation

Extend `filter_rules` with a new `workflow_rules` table:

```sql
workflow_rules (
  id, account_id, name,
  trigger_event, -- 'email_received', 'no_reply_after_days', 'time_based'
  trigger_conditions, -- JSON: {"from_domain": "client.ma", "subject_contains": "invoice"}
  actions, -- JSON: [{"type": "send_template", "template_id": 5, "delay_hours": 48}]
  is_active, created_at
)
```

| Trigger | Action | Background Checker |
|---------|--------|-------------------|
| `email_received` from `@client.ma` | Auto-reply with `templates` id #3 | Immediate via `filters/` |
| `no_reply_after_days: 3` | Send follow-up template, add task | Extend `followup/` checker (already 60s interval) |
| `time_based` (every Monday 9am) | Send report template to group | New cron-like checker in Rust backend |

**UI:** Extend existing `FilterEditor` into `WorkflowEditor` with a visual rule builder (simple if-this-then-that, not Mautic-level).

---

## Phase 5: Security & Privacy Hardening *(Week 8)*

| Feature | Implementation |
|---------|---------------|
| **PGP encryption** | Rust `src-tauri/src/` — integrate `rpgp` or `sequoia-openpgp`. Add encrypt/sign/decrypt in composer. Keyring stored in SQLite encrypted with AES-256-GCM (same pattern as passwords) |
| **Local AI (Ollama)** | `src/services/ai/` — add 4th provider: `localhost:11434` with model picker. Fallback when offline or for privacy |
| **App lock** | Rust backend — biometric/password lock on idle, blur screen |
| **Data export (GDPR)** | Rust `fs` + `dialog` plugins — export all SQLite tables + attachments to encrypted ZIP |

---

## What to Skip (Out of Scope for a Desktop Client)

Don't turn Velo into a server. These belong in Mailcoach/Laravel, not here:

| Feature | Why Skip |
|---------|----------|
| **Visual campaign builder** | Velo is a client, not a marketing automation server |
| **Landing pages** | Completely different product category |
| **Lead scoring** | Requires server-side tracking and CRM logic |
| **Real-time team collision** | Needs WebSocket backend; breaks local-first model |
| **Complex multi-user shared inbox** | SQLite locks make this hard; use a webapp instead |

---

## SQLite Schema Additions Summary

```sql
-- Phase 1: i18n (no schema changes, app-level)

-- Phase 2: Contact Intelligence
contact_tags (id, account_id, name, color)
contact_tag_pivot (contact_id, tag_id)
contact_groups (id, account_id, name, description)
contact_group_pivot (contact_id, group_id)
contact_segments (id, account_id, name, query)

-- Phase 3: Campaigns
campaigns (id, name, template_id, segment_id, status, sent_count, created_at)
campaign_recipients (campaign_id, contact_id, status, opened_at, clicked_at)

-- Phase 4: Workflows
workflow_rules (id, account_id, name, trigger_event, trigger_conditions, actions, is_active)

-- Phase 5: PGP
pgp_keys (id, account_id, key_id, public_key, private_key_encrypted, passphrase_hint)
```

---

## Effort Estimate

| Phase | Time | Complexity |
|-------|------|------------|
| 1 — i18n + RTL | 1 week | Low (well-trodden path in React) |
| 2 — Contact tags/groups/segments | 1 week | Medium (extends existing patterns) |
| 3 — Mail merge + campaigns | 1.5 weeks | Medium-High (needs backend for tracking) |
| 4 — Workflow engine | 0.5 week | Medium (extends filters + followup) |
| 5 — PGP + local AI | 1 week | High (Rust crypto integration) |

**Total:** ~5 weeks to turn Velo from a Superhuman clone into a **localized, CRM-aware, campaign-capable** email client for your Moroccan client — while keeping it local-first and respecting the existing Tauri/React/Rust/SQLite architecture.