# Velo Phases 5–16: Spec-Driven Implementation Plan

> **Version:** 1.0 (May 2026)
> **Base:** v0.5.0 (QA complete, all P0–P3 resolved)
> **Architecture:** Tauri v2 + React 19 + Rust + SQLite (offline-first)
> **Style Guide:** `docs/Prompting-Guide.md` — parallel agent orchestration, finish-perfectly rules

---

## Table of Contents

1. [Overview & Guiding Principles](#1-overview--guiding-principles)
2. [Phase 5 — Integration Test Suite](#2-phase-5--integration-test-suite)
3. [Phase 6 — Sidebar Unread Count Badges](#3-phase-6--sidebar-unread-count-badges)
4. [Phase 7 — Split Inbox Refinement](#4-phase-7--split-inbox-refinement)
5. [Phase 8 — Thread Rendering Optimization](#5-phase-8--thread-rendering-optimization)
6. [Phase 9 — Filter Engine v2](#6-phase-9--filter-engine-v2)
7. [Phase 10 — Contact Intelligence v2](#7-phase-10--contact-intelligence-v2)
8. [Phase 11 — Campaign A/B Testing](#8-phase-11--campaign-ab-testing)
9. [Phase 12 — Advanced Analytics Dashboard & Export](#9-phase-12--advanced-analytics-dashboard--export)
10. [Phase 13 — Email Warming System](#10-phase-13--email-warming-system)
11. [Phase 14 — Blacklist Checker](#11-phase-14--blacklist-checker)
12. [Phase 15 — Bounce Classification](#12-phase-15--bounce-classification)
13. [Phase 16 — ARF Feedback Loop Processing](#13-phase-16--arf-feedback-loop-processing)
14. [Migration Summary](#14-migration-summary)
15. [Orchestration Plan](#15-orchestration-plan)
16. [Verification & Merge Checklist](#16-verification--merge-checklist)

---

## 1. Overview & Guiding Principles

### Principles

1. **Incremental over monolithic** — each phase is independently shippable.
2. **Existing patterns first** — reuse service layers, Zustand stores, EmailProvider abstraction, queue system.
3. **Test coverage colocated** — `*.test.ts` next to each source file.
4. **Offline-first preserved** — all new features must work without internet unless explicitly noted.
5. **Rust for system ops** — DNS lookups, network checks, crypto → Rust. Business logic → TypeScript services.
6. **Prompting Guide adherence** — use @plan, @build, @explore, @docs-curator per the guide.

### Feature Impact Matrix

| Phase | DB Migrations | Rust Commands | Service Files | Component Files | Test Files |
|-------|--------------|---------------|---------------|-----------------|------------|
| 5 | 0 | 0 | 0 | 0 | 10+ |
| 6 | 0 | 0 | 1 | 3 | 2 |
| 7 | 0 | 0 | 2 | 3 | 2 |
| 8 | 0 | 0 | 1 | 3 | 2 |
| 9 | 2 | 0 | 3 | 2 | 3 |
| 10 | 2 | 0 | 3 | 3 | 3 |
| 11 | 1 | 0 | 2 | 2 | 2 |
| 12 | 2 | 2 | 3 | 2 | 3 |
| 13 | 1 | 0 | 2 | 1 | 2 |
| 14 | 1 | 1 | 2 | 1 | 2 |
| 15 | 1 | 0 | 2 | 1 | 2 |
| 16 | 1 | 0 | 2 | 0 | 2 |
| **Total** | **11** | **3** | **23** | **21** | **35+** |

---

## 2. Phase 5 — Integration Test Suite

**Goal:** 10+ integration tests covering core email flows end-to-end.

### Scope

| Test # | Flow | Type | Key Assertions |
|--------|------|------|----------------|
| 1 | Add Gmail account (mock OAuth) | Integration | Account created, token stored |
| 2 | Add IMAP account (mock connection) | Integration | IMAP/SMTP config persisted |
| 3 | Full sync cycle (Gmail) | Integration | Messages/threads/labels created |
| 4 | Full sync cycle (IMAP) | Integration | Messages threaded via JWZ |
| 5 | Send email via SMTP provider | Integration | `pending_operations` queued, status updated |
| 6 | Apply filter rule during sync | Integration | Filter matches, action applied |
| 7 | Offline queue — archive thread | Integration | Optimistic UI + pending op, flush on reconnect |
| 8 | AI thread summary | Integration | Summary cached in `ai_cache` |
| 9 | Campaign send flow | Integration | Recipients enqueued, rate-limited |
| 10 | Calendar event create + sync | Integration | Event created, token refresh on 401 |

### Files to Create

```
src/services/__tests__/integration/
  setup.ts              — test DB, mock Gmail/IMAP providers, seed data
  accounts.test.ts      — test #1, #2
  sync.test.ts          — test #3, #4
  send.test.ts          — test #5
  filters.test.ts       — test #6
  offline.test.ts       — test #7
  ai.test.ts            — test #8
  campaigns.test.ts     — test #9
  calendar.test.ts      — test #10
```

### Key Patterns

- Use `src/services/db/connection.ts` `getDb()` with `:memory:` SQLite for test isolation.
- Mock `invoke()` via `vi.mock('@tauri-apps/api/core')` for Rust commands.
- Use `EmailProvider` mock interface for provider abstraction.
- Seed minimal data (1 account, 3-5 messages, 1 filter rule).

### Acceptance Criteria

- All 10+ tests pass in CI.
- Each test cleans up its DB state.
- Tests complete in < 30s total.

---

## 3. Phase 6 — Sidebar Unread Count Badges

**Goal:** Show unread message count per label/account in the sidebar. Implements issue #243.

### Data Flow

```
1. threadStore counts unread threads per label
2. Sidebar component reads counts from store
3. Badge renders as small red circle + number
4. Count updates after every sync cycle
```

### Service Changes

| File | Change |
|------|--------|
| `src/stores/threadStore.ts` | Add `unreadCounts: Record<string, number>` — computed during `loadThreads()` |
| `src/components/layout/Sidebar.tsx` | Render `<span className="badge">` next to each nav item |
| `src/components/layout/TitleBar.tsx` | Update `updateBadgeCount()` with total unread |

### DB Impact

None — counts computed from existing `messages` table (`is_read = 0`).

### Implementation Notes

- Batch query per account: `SELECT label_id, COUNT(*) FROM threads t JOIN thread_labels tl ON t.id = tl.thread_id WHERE t.is_read = 0 AND t.account_id = ? GROUP BY tl.label_id`
- Update `unreadCounts` after every `velo-sync-done` event.
- Badge styling: `bg-danger text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`

---

## 4. Phase 7 — Split Inbox Refinement

**Goal:** Allow users to edit/correct AI categorization and reclassify threads.

### Data Flow

```
1. User clicks category tab → sees threads
2. User right-clicks thread → "Move to Primary/Updates/Promotions/Social/Newsletters"
3. Thread's category updated in DB
4. AI learns from correction (optional feedback loop)
```

### Service Changes

| File | Change |
|------|--------|
| `src/services/db/threadCategories.ts` | Add `updateThreadCategory()`, `getUserOverrides()` |
| `src/services/ai/categorizationManager.ts` | Add `reportUserCorrection()` for AI feedback |
| `src/components/email/ThreadList.tsx` | Add context menu item "Move to category >" |
| `src/components/email/CategoryTabs.tsx` | Show manual override indicator |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v41 | `ALTER TABLE thread_categories ADD COLUMN is_user_override INTEGER NOT NULL DEFAULT 0;` |

### Implementation Notes

- `is_user_override` flag prevents AI from re-categorizing on next sync.
- Context menu uses existing `contextMenuStore` pattern.
- AI feedback loop is fire-and-forget (non-blocking).

---

## 5. Phase 8 — Thread Rendering Optimization

**Goal:** Virtual scrolling for email list, lazy-loaded attachments.

### Service Changes

| File | Change |
|------|--------|
| `src/components/email/EmailList.tsx` | Replace flat map with `react-window` `FixedSizeList` |
| `src/components/email/AttachmentList.tsx` | Add `loading="lazy"` + intersection observer |
| `src/components/email/ThreadView.tsx` | Virtualize message list within thread |

### Implementation Notes

- Use `react-window` (already indirectly in dependency tree via dnd-kit).
- Row height: fixed 72px for EmailList items.
- Attachments: use `IntersectionObserver` to fetch `cache_path` only when visible.
- ThreadView messages: use `FixedSizeList` with variable row heights via `react-window` `VariableSizeList`.
- Test with 10,000 threads to verify scroll performance.

---

## 6. Phase 9 — Filter Engine v2

**Goal:** Add regex capture groups, scoring (weighted conditions), conditional chaining (if-then-else), and a monitoring dashboard.

### Service Changes

| File | Change |
|------|--------|
| `src/services/filters/filterEngine.ts` | Add `scoring` (weighted sum), `regex_capture` → template vars, `chaining` (next rule on match/no-match) |
| `src/services/filters/filterMonitor.ts` | **NEW** — `logFilterMatch()`, `getFilterStats()`, `filterDashboard` metrics |
| `src/services/db/filters.ts` | Add `filter_scoring`, `filter_chaining`, `filter_logs` queries |
| `src/components/settings/FilterEditor.tsx` | Add weight input, chaining dropdown, regex capture preview |
| `src/components/settings/FilterDashboard.tsx` | **NEW** — match rate charts, top-N rules, recent matches |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v42 | `ALTER TABLE filter_rules ADD COLUMN score_threshold REAL;` |
| v42 | `ALTER TABLE filter_rules ADD COLUMN chaining_action TEXT DEFAULT 'stop';` |
| v43 | `CREATE TABLE filter_logs (id TEXT, rule_id TEXT, message_id TEXT, matched INTEGER, score REAL, applied_actions TEXT, created_at INTEGER);` |

### Filter Scoring Model

- Each condition gets optional `weight` (float, default 1.0).
- `total_score = sum(weight * match_bool)` for all conditions.
- If `score_threshold` is set, rule only fires when `total_score >= threshold`.
- Allows partial matching — e.g., 3 of 5 conditions with weights.

### Chaining Model

| Action | Behavior |
|--------|----------|
| `stop` | Stop evaluating (default) |
| `continue` | Continue to next rule regardless |
| `continue_on_match` | Next rule only if this rule matched |
| `continue_on_no_match` | Next rule only if this rule did NOT match |

### Monitoring

```
FilterDashboard:
  - Match rate (last 24h/7d)
  - Top 10 most-matched rules
  - Rules with 0 matches (never fires — warning)
  - Recent match log with filtering
```

---

## 7. Phase 10 — Contact Intelligence v2

**Goal:** Engagement scoring (recency, frequency, reply rate), dynamic segments (auto-populated by query), contact health score.

### Service Changes

| File | Change |
|------|--------|
| `src/services/contacts/scoring.ts` | **NEW** — `computeEngagementScore()`, `getContactHealth()` |
| `src/services/contacts/segments.ts` | Add `dynamicSegments` — auto-evaluated on sync, results cached |
| `src/services/contacts/engagement.ts` | **NEW** — `logEngagement()`, `getEngagementTrend()` |
| `src/components/contacts/ContactSidebar.tsx` | Add health score bar, engagement trend sparkline |
| `src/components/contacts/ContactList.tsx` | Sort by engagement score, filter by health |
| `src/components/contacts/SegmentList.tsx` | Show dynamic segment member count, auto-refresh badge |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v44 | `ALTER TABLE contacts ADD COLUMN engagement_score REAL DEFAULT 0.0;` |
| v44 | `ALTER TABLE contacts ADD COLUMN last_engaged_at INTEGER;` |
| v44 | `ALTER TABLE contacts ADD COLUMN health_status TEXT DEFAULT 'cold';` |
| v45 | `CREATE TABLE engagement_log (id TEXT, contact_id TEXT, event_type TEXT, score_delta REAL, created_at INTEGER);` |
| v45 | `CREATE TABLE dynamic_segments (id TEXT, account_id TEXT, name TEXT, query TEXT, refreshed_at INTEGER);` |

### Scoring Formula

```
engagement_score = 0.4 * recency_factor + 0.3 * frequency_factor + 0.3 * reply_rate_factor

recency_factor    = min(1.0, 30 / days_since_last_contact)
frequency_factor  = min(1.0, contacts_last_30d / 10)
reply_rate_factor = replies_sent / emails_received (capped at 1.0)
```

### Health Status

| Range | Status |
|-------|--------|
| 0.0 – 0.2 | `cold` |
| 0.2 – 0.4 | `lukewarm` |
| 0.4 – 0.7 | `warm` |
| 0.7 – 1.0 | `hot` |

---

## 8. Phase 11 — Campaign A/B Testing

**Goal:** Send two subject line / body variants to a split audience, auto-pick winner after open-rate significance.

### Service Changes

| File | Change |
|------|--------|
| `src/services/campaigns/campaignService.ts` | Add `createABTest()`, `splitAudience()`, `declareWinner()` |
| `src/services/campaigns/trackingService.ts` | Add per-variant stats, significance test (chi-squared) |
| `src/components/campaigns/CampaignComposer.tsx` | Add A/B test mode — variant A/B editors, split % slider |
| `src/components/campaigns/CampaignAnalytics.tsx` | Show variant comparison — open rate, click rate, winner badge |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v46 | `ALTER TABLE campaigns ADD COLUMN ab_test_config TEXT;` — JSON: `{variantA: {...}, variantB: {...}, splitRatio: 0.5, winnerId: null}` |
| v46 | `ALTER TABLE campaign_recipients ADD COLUMN variant TEXT;` — `'A'` or `'B'` |
| v46 | `ALTER TABLE campaign_recipients ADD COLUMN is_winner BOOLEAN;` |

### Flow

1. User creates campaign, enables A/B mode → two variant editors shown.
2. Sets split % (default 50/50), test duration (default 24h).
3. Campaign sends — variants assigned randomly respecting split ratio.
4. Tracking collects opens/clicks per variant.
5. After test duration: chi-squared test on open rates.
6. If significant (p < 0.05): winner auto-applied (remaining unsent get winner).
7. If not significant: no winner, user can extend or pick manually.

---

## 9. Phase 12 — Advanced Analytics Dashboard & Export

**Goal:** Track UTM campaign links, build an analytics dashboard, export to CSV/PDF.

### Service Changes

| File | Change |
|------|--------|
| `src/services/campaigns/analyticsService.ts` | **NEW** — `getCampaignAnalytics()`, `getUTMStats()`, `getOverview()` |
| `src/services/campaigns/utmService.ts` | **NEW** — `trackUTMParams()`, `getUTMReport()` |
| `src/services/export/csvExport.ts` | **NEW** — `exportCampaignToCSV()` |
| `src-tauri/src/export/pdf.rs` | Add `export_analytics_report` command |
| `src/components/campaigns/CampaignAnalytics.tsx` | Full dashboard — total/opened/clicked/bounced per campaign, UTM breakdown, sparklines |
| `src/components/campaigns/ExportMenu.tsx` | **NEW** — Export button group: CSV, PDF |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v47 | `CREATE TABLE utm_links (id TEXT, campaign_id TEXT, url TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, click_count INTEGER DEFAULT 0, created_at INTEGER);` |
| v47 | `CREATE TABLE utm_clicks (id TEXT, link_id TEXT, contact_id TEXT, clicked_at INTEGER);` |
| v48 | `CREATE TABLE analytics_snapshots (id TEXT, campaign_id TEXT, snapshot_data TEXT, created_at INTEGER);` |

### Dashboard Components

```
CampaignAnalytics:
  - Overview cards: total sent, unique opens, total clicks, bounce rate
  - Daily time-series chart (Recharts LineChart)
  - Campaign table with per-row sparklines
  - UTM breakdown table with click counts
  - Export dropdown: "CSV (raw data)", "PDF (report)"
```

---

## 10. Phase 13 — Email Warming System

**Goal:** Gradually increase sending volume to establish sender reputation.

### Service Changes

| File | Change |
|------|--------|
| `src/services/deliverability/warmingService.ts` | **NEW** — `getWarmingPlan()`, `getDailyLimit()`, `logSend()` |
| `src/services/deliverability/warmingScheduler.ts` | **NEW** — Background checker, ramps volume daily |
| `src/components/settings/WarmingSettings.tsx` | **NEW** — Enable/disable, view progress, current limit |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v49 | `CREATE TABLE email_warming (id TEXT, account_id TEXT, enabled INTEGER DEFAULT 0, start_volume INTEGER DEFAULT 10, current_volume INTEGER DEFAULT 10, target_volume INTEGER DEFAULT 100, ramp_days INTEGER DEFAULT 14, created_at INTEGER, updated_at INTEGER);` |
| v49 | `CREATE TABLE warming_log (id TEXT, account_id TEXT, sent_date TEXT, volume INTEGER, created_at INTEGER);` |

### Warming Algorithm

- Start at `start_volume` (default 10/day).
- Increase linearly: `volume = start + (target - start) * min(1, day / ramp_days)`.
- Background checker runs every 24h updates `current_volume`.
- When warming is off: no rate limit.
- Queue processor checks `getDailyLimit(accountId)` before sending campaigns.

---

## 11. Phase 14 — Blacklist Checker

**Goal:** Check sender domain/IP against Spamhaus and Barracuda blocklists.

### Service Changes

| File | Change |
|------|--------|
| `src-tauri/src/deliverability/dnsbl.rs` | **NEW** — `check_dnsbl(ip, domain)` — DNS queries to Spamhaus (zen.spamhaus.org), Barracuda (b.barracudacentral.org) |
| `src-tauri/src/lib.rs` | Register `check_dnsbl` Tauri command |
| `src/services/deliverability/blacklistService.ts` | **NEW** — `checkBlacklists()`, `getBlacklistHistory()` |
| `src/services/db/blacklistCache.ts` | **NEW** — `getCachedCheck()`, `cacheCheck()` |
| `src/components/settings/BlacklistChecker.tsx` | **NEW** — Manual check button, last check results, history |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v50 | `CREATE TABLE blacklist_checks (id TEXT, account_id TEXT, check_type TEXT, target TEXT, listed INTEGER, list_name TEXT, responded INTEGER, checked_at INTEGER);` |

### Implementation Notes

- DNSBL check via `trust-dns-resolver` Rust crate.
- Add `trust-dns-resolver` to `Cargo.toml`.
- Cache results for 1 hour (TTL respected from DNS response).
- Check on account setup and on demand.

### Tauri Capabilities

```json
"dnsbl-check": {
  "allow": [{ "name": "check_dnsbl" }]
}
```

---

## 12. Phase 15 — Bounce Classification

**Goal:** Classify bounces as hard (permanent) or soft (temporary), auto-suppress hard bounces.

### Service Changes

| File | Change |
|------|--------|
| `src/services/deliverability/bounceService.ts` | **NEW** — `classifyBounce()`, `suppressBounce()`, `getBounceReport()` |
| `src/services/deliverability/suppressionList.ts` | **NEW** — `isSuppressed()`, `addToSuppression()`, `removeFromSuppression()` |
| `src/services/db/bounces.ts` | **NEW** — DB queries for bounces + suppression |
| `src/components/settings/BounceManager.tsx` | **NEW** — View bounce history, manage suppression list, release addresses |

### DB Impact

| Migration | SQL |
|-----------|-----|
| v51 | `CREATE TABLE bounces (id TEXT, campaign_id TEXT, contact_id TEXT, recipient_email TEXT, bounce_type TEXT, diagnostic_code TEXT, reason TEXT, bounced_at INTEGER);` |
| v51 | `CREATE TABLE suppression_list (id TEXT, account_id TEXT, email TEXT, reason TEXT, suppressed_at INTEGER);` |

### Classification Logic

| Pattern | Type | Action |
|---------|------|--------|
| `5xx`, `550`, `551`, `552`, `553`, `554`, `user unknown`, `does not exist`, `invalid address` | Hard | Auto-suppress, notify user |
| `4xx`, `450`, `451`, `452`, `mailbox full`, `try again later`, `rate limit` | Soft | Retry up to 3 times over 72h, then suppress |
| `Blocked`, `rejected`, `spam` | Policy | Flag for user review |

### DSN Parsing

Parse `DSN` (Delivery Status Notification) RFC 3464 messages:
- `Status: 5.1.1` → hard (bad address)
- `Status: 4.2.2` → soft (mailbox full)
- `Status: 5.7.1` → policy (blocked)
- `Diagnostic-Code: smtp; ...` → extract SMTP response code

---

## 13. Phase 16 — ARF Feedback Loop Processing

**Goal:** Parse Abuse Reporting Format (ARF) messages from ISPs, auto-suppress complainants.

### Service Changes

| File | Change |
|------|--------|
| `src/services/deliverability/arfService.ts` | **NEW** — `parseARF()`, `processARFReport()`, `getARFSummary()` |
| `src/services/db/arfReports.ts` | **NEW** — `saveARFReport()`, `getARFReports()` |
| `src-tauri/src/deliverability/arf.rs` | **NEW** — Parse ARF MIME structure |

No new Rust commands needed if parsing in TypeScript with `mail-parser` output — but ARF has a specific MIME structure (message/feedback-report) that's best handled in Rust for performance with the existing mail-parser crate.

### DB Impact

| Migration | SQL |
|-----------|-----|
| v52 | `CREATE TABLE arf_reports (id TEXT, account_id TEXT, original_recipient TEXT, reported_domain TEXT, feedback_type TEXT, user_agent TEXT, source_ip TEXT, arrival_date INTEGER, report_raw TEXT, processed INTEGER DEFAULT 0, created_at INTEGER);` |

### ARF Processing Flow

1. Incoming message detected as ARF (Content-Type: `message/feedback-report`).
2. Parse feedback-report body fields: `Feedback-Type`, `User-Agent`, `Original-Recipient`, `Original-Mail-From`, `Arrival-Date`, `Source-IP`.
3. Add `Original-Recipient` to suppression list with reason `abuse_complaint`.
4. Log ARF report to `arf_reports` table.
5. Notify user of abuse complaint via in-app banner.

---

## 14. Migration Summary

| # | Phase | Description |
|---|-------|-------------|
| 41 | 7 | `thread_categories.is_user_override` |
| 42 | 9 | `filter_rules.score_threshold`, `filter_rules.chaining_action` |
| 43 | 9 | `filter_logs` table |
| 44 | 10 | `contacts.engagement_score`, `contacts.last_engaged_at`, `contacts.health_status` |
| 45 | 10 | `engagement_log`, `dynamic_segments` tables |
| 46 | 11 | `campaigns.ab_test_config`, `campaign_recipients.variant`, `campaign_recipients.is_winner` |
| 47 | 12 | `utm_links`, `utm_clicks` tables |
| 48 | 12 | `analytics_snapshots` table |
| 49 | 13 | `email_warming`, `warming_log` tables |
| 50 | 14 | `blacklist_checks` table |
| 51 | 15 | `bounces`, `suppression_list` tables |
| 52 | 16 | `arf_reports` table |

---

## 15. Orchestration Plan

### Wave 1: Foundation + UI Polish (Phases 5–8)

**Parallel dispatch:**

| Agent | Work |
|-------|------|
| `general` (backend) | Phase 5: Integration test suite — `setup.ts`, all 10+ test files |
| `frontend-ui-ux` (UI) | Phase 6: Sidebar badges — `threadStore.ts`, `Sidebar.tsx` |
| `frontend-ui-ux` (UI) | Phase 7: Split inbox — `threadCategories.ts`, `CategoryTabs.tsx`, context menu |
| `frontend-ui-ux` (UI) | Phase 8: Virtual scrolling — `EmailList.tsx`, `ThreadView.tsx`, lazy attachments |

**Dependencies:** None — all independent.

### Wave 2: Automation + CRM (Phases 9–10)

**Parallel dispatch:**

| Agent | Work |
|-------|------|
| `general` (backend) | Phase 9: Filter v2 — scoring, chaining, monitoring, migrations v42–v43 |
| `general` (backend) | Phase 10: Contact intel v2 — scoring formula, dynamic segments, migrations v44–v45 |
| `frontend-ui-ux` (UI) | Phase 9: FilterEditor + FilterDashboard UI |
| `frontend-ui-ux` (UI) | Phase 10: ContactSidebar health score, SegmentList refresh |

**Dependencies:** Wave 1 complete.

### Wave 3: Campaigns (Phases 11–12)

**Parallel dispatch:**

| Agent | Work |
|-------|------|
| `general` (backend) | Phase 11: A/B testing — split audience, significance test, migration v46 |
| `backend-tauri` | Phase 12: Rust PDF export command |
| `general` (backend) | Phase 12: Analytics service, UTM tracking, CSV export, migrations v47–v48 |
| `frontend-ui-ux` (UI) | Phase 11: CampaignComposer A/B mode, CampaignAnalytics variant comparison |
| `frontend-ui-ux` (UI) | Phase 12: Analytics dashboard, ExportMenu |

**Dependencies:** Wave 2 complete.

### Wave 4: Deliverability (Phases 13–16)

**Parallel dispatch:**

| Agent | Work |
|-------|------|
| `general` (backend) | Phase 13: Warming service + scheduler, migration v49 |
| `backend-tauri` | Phase 14: Rust DNSBL checker (`trust-dns-resolver`), Tauri command |
| `general` (backend) | Phase 14: Blacklist service + cache, migration v50 |
| `general` (backend) | Phase 15: Bounce classification + suppression list, migration v51 |
| `general` (backend) | Phase 16: ARF parser + processor, migration v52 |
| `frontend-ui-ux` (UI) | Phases 13–15: WarmingSettings, BlacklistChecker, BounceManager UIs |

**Dependencies:** Wave 3 complete.

### Validation Per Wave

| Wave | Test Command | Additional Checks |
|------|-------------|-------------------|
| 1 | `npx vitest run src/services/__tests__/integration/` | `npx tsc --noEmit` |
| 2 | `npx vitest run src/services/filters/ src/services/contacts/` | `npx tsc --noEmit` |
| 3 | `npx vitest run src/services/campaigns/` | `npx tsc --noEmit`, `cargo check` |
| 4 | `npx vitest run src/services/deliverability/` | `npx tsc --noEmit`, `cargo test` |

---

## 16. Verification & Merge Checklist

### Pre-Merge Gates

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — all tests pass
- [ ] `cargo test` (from src-tauri/) — all Rust tests pass
- [ ] `cargo check` — no warnings
- [ ] All migrations run successfully on fresh DB
- [ ] No unused imports/variables (`noUnusedLocals`, `noUnusedParameters`)

### Branch Strategy

```bash
git checkout -b feat/phases-5-16
# Implement wave by wave
git add -A && git commit -m "feat: phase X - description"
git push -u origin feat/phases-5-16
```

### PR Checklist

- [ ] PR title: `feat: Phases 5–16 — integration tests, UI polish, campaigns, deliverability`
- [ ] Body includes summary of each phase
- [ ] Labels: `feature`, `phases-5-16`
- [ ] Reviewer assigned
- [ ] No merge conflicts with `main`

### After Merge

- [ ] Verify all 1659+ original tests still pass
- [ ] Verify new features work in dev build (`npm run tauri dev`)
- [ ] Update `docs/velo-replan.md` to mark phases as complete
- [ ] Update `docs/future.md` roadmap section
- [ ] Update `CLAUDE.md` with new service patterns if any

---

*End of plan. Last updated: 2026-05-13.*
