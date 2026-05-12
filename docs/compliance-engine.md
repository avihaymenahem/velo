# Compliance Engine

Jurisdiction-aware compliance checking for email composition. A local rule engine evaluates outgoing drafts against region-specific regulatory profiles (GDPR, CAN-SPAM, LGPD, Morocco Law 31-08, etc.) and surfaces violations in real time via the composer UI.

---

## Architecture

```
┌──────────────────────┐     ┌────────────────────────────┐
│  Composer (React)     │────▶│  CompliancePanel (React)    │
│  src/components/      │     │  src/components/composer/   │
│  composer/Composer.tsx│     │  CompliancePanel.tsx        │
└──────────┬───────────┘     └──────────┬─────────────────┘
           │                            │
           │  getActiveProfiles()       │  detectJurisdiction()
           │  insertCheck()             │  evaluateRules()
           ▼                            ▼
┌──────────────────────┐     ┌────────────────────────────┐
│  complianceProfiles   │     │  ruleEngine.ts              │
│  (DB layer)           │     │  · detectJurisdiction()     │
│  src/services/db/     │     │  · evaluateRules()          │
│  complianceProfiles.ts│     │  · aggregateResults()       │
└──────────────────────┘     └──────────┬─────────────────┘
                                        │
                                        ▼
                              ┌────────────────────────────┐
                              │  aiEnhancer.ts              │
                              │  (optional AI pass via      │
                              │   active LLM provider)      │
                              └────────────────────────────┘
```

**Data flow:**

1. `CompliancePanel` mounts when a new message is being composed (non-reply/forward modes).
2. On every change to subject, body, or recipients (debounced 500ms), it calls `getActiveProfiles()` from SQLite.
3. `detectJurisdiction()` matches recipient email domains/TLDs against each profile's `regionHint`.
4. `evaluateRules()` runs each matched profile's rules against the draft context and returns a score (0–100) + violations list.
5. The panel renders a score badge; errors deduct 30 pts, warnings 10 pts, info 5 pts.
6. Results are persisted to `compliance_checks` via `insertCheck()`.
7. If AI is enabled (`ai_enabled = true`), `enhanceWithAi()` sends the draft + profile rules to the configured LLM for tone/suggestion analysis.

---

## Profile Types

Five built-in profiles seeded in migration v30 (stored as JSON in `compliance_profiles.rules_json`):

| Code | Name | Region Hint | Key Requirement | Default |
|------|------|-------------|-----------------|---------|
| `ma` | Morocco Business | `.ma` | RC/IF/ICE/CNSS identifiers in signature, formal French tone | No |
| `gdpr` | GDPR (EU) | `.fr,.de,.es,.it,.nl,...` (EU TLDs) | Unsubscribe link, retention notice, lawful basis disclaimer | **Yes** |
| `can-spam` | CAN-SPAM (US) | `.us,.com,.org,.net` | Physical address in signature, clear subject, 10-day opt-out | No |
| `lgpd` | LGPD (Brazil) | `.br` | Portuguese-language data subject rights notice, opt-out | No |
| `generic` | Professional | (none — matches all) | No ALL-CAPS subject, attachment mentioned in body, signature present | No |

Profiles are stored with `is_active` and `is_default` flags. When `regionHint` is null/empty, the profile matches all recipients. When present, recipient domains are checked for suffix matches against the comma-separated hint list.

---

## Rule Types

`ComplianceRuleType` defined in `src/services/compliance/types.ts`:

| Type | What it checks | Severity Example | Fix Action |
|------|---------------|------------------|------------|
| `signature_required` | Body contains `-- ` or `{{signature}}`; optionally checks `minWords` count | `error` | `add_signature` |
| `unsubscribe_required` | Body contains "unsubscribe" or `{{unsubscribe}}` | `error` | `add_unsubscribe` |
| `disclaimer_required` | Body contains keywords (disclaimer, confidential, privileged, lawful basis, legal) | `warning` | `add_disclaimer` |
| `tone_check` | Subject is all-uppercase and >10 chars | `warning` | `fix_subject_case` |
| `data_minimization` | Body matches credit-card/SSN/generic-long-number regex patterns | `error` | `remove_sensitive_data` |
| `retention_notice` | Body contains retention keywords (retain, retention, delete after, keep for, data retention) | `warning` | `add_retention_notice` |
| `custom_regex` | Custom regex from `config.regex` tested against subject + body | configurable | `add_missing_content` |
| `attachment_mentioned` | Body mentions "attached"/"enclosed"/"please find" but no attachment is present | `info` | `add_attachment` |

Each rule carries a `severity` (`error` | `warning` | `info`) and a `messageKey` for i18n translation.

---

## Jurisdiction Detection

`detectJurisdiction()` in `ruleEngine.ts`:

1. Extracts the TLD (everything after the last `.`) and the full domain from each recipient email.
2. For each active profile with a non-null `regionHint`, splits the hint by comma and trims each entry.
3. Checks if **any** recipient's TLD or domain ends with any hint entry (e.g., TLD `.ma` matches hint `.ma`; domain `gmail.com` matches hint `.com`).
4. Profiles with `regionHint = null` match unconditionally (used for the Generic Professional profile).
5. Returns a deduplicated list of matched profiles.

---

## CompliancePanel UI

File: `src/components/composer/CompliancePanel.tsx`

Renders below the editor when composing (not in reply/forward modes):

- **Score badge** — icon + numeric score with color coding:
  - `≥ 90`: green (`text-success`) — `ShieldCheck` icon
  - `70–89`: amber (`text-warning`) — `Shield` icon
  - `< 70`: red (`text-danger`) — `ShieldAlert` icon
- **Violation count** — click to expand a dropdown listing each violation with severity indicator, message, and a one-click fix button.
- **One-click fixes:**
  - `add_signature` — inserts `{{signature}}` placeholder into the editor
  - `add_unsubscribe` — inserts an unsubscribe link
  - `fix_subject_case` — title-cases the subject line
- **Debounce** — 500ms timer; re-checks on `accountId`, `subject`, `bodyHtml`, `recipients` changes. Cancelled on unmount.

---

## ComplianceProfileManager Settings

File: `src/components/settings/ComplianceProfileManager.tsx`

Renders a list of all profiles with:

- **Toggle** — checkbox to enable/disable via `setProfileActive()`
- **Default badge** — `ShieldCheck` icon; click to set as default
- **Edit rules** — inline editor for rule type, severity, and message key per rule; add/remove rules
- **Export** — downloads profile as JSON file (`compliance-{code}.json`)
- **Import** — file picker for `.json`; validates `code`, `name`, `rules` presence before calling `upsertProfile()`

---

## Database Schema (Migration v30)

### `compliance_profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `code` | TEXT UNIQUE | Machine-readable short code (e.g., `gdpr`, `ma`) |
| `name` | TEXT | Human-readable name |
| `description` | TEXT | Regulatory context |
| `region_hint` | TEXT | Comma-separated TLDs/domains for jurisdiction matching |
| `rules_json` | TEXT | JSON array of `ComplianceRule` objects |
| `is_active` | INTEGER | 0/1 toggle |
| `is_default` | INTEGER | 0/1 — only one profile can be default |
| `created_at` | INTEGER | Unix epoch timestamp |

### `compliance_checks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `account_id` | TEXT FK → accounts | Owning account |
| `email_draft_id` | TEXT FK → local_drafts | Optional draft association |
| `campaign_id` | TEXT FK → campaigns | Optional campaign association |
| `profile_ids` | TEXT | Comma-separated profile IDs used |
| `score` | INTEGER | 0–100 compliance score |
| `violations_json` | TEXT | JSON array of `ComplianceViolation` |
| `checked_at` | INTEGER | Unix epoch timestamp (default `unixepoch()`) |

Index: `idx_compliance_checks_account` on `(account_id, checked_at DESC)`.

---

## File Map

| Path | Purpose |
|------|---------|
| `src/services/compliance/types.ts` | Type definitions: `ComplianceRule`, `ComplianceProfile`, `ComplianceViolation`, `ComplianceCheckResult`, `ComplianceCheckContext`, `ComplianceRuleType`, `RuleSeverity` |
| `src/services/compliance/ruleEngine.ts` | Core engine: `detectJurisdiction()`, `evaluateRules()`, `aggregateResults()` — all pure functions |
| `src/services/compliance/aiEnhancer.ts` | `enhanceWithAi()` — optional AI pass for tone/suggestion analysis via active LLM provider |
| `src/services/compliance/ruleEngine.test.ts` | Tests for `evaluateRules` |
| `src/services/compliance/detectJurisdiction.test.ts` | Tests for `detectJurisdiction` |
| `src/services/db/complianceProfiles.ts` | DB operations: `getActiveProfiles()`, `getProfilesForDomains()`, `getAllProfiles()`, `upsertProfile()`, `setProfileActive()`, `setDefaultProfile()`, `insertCheck()` |
| `src/services/db/complianceChecks.ts` | DB operations: `getRecentChecks()`, `deleteOldChecks()` |
| `src/services/db/migrations.ts` (v30) | Schema creation and seed data for built-in profiles |
| `src/components/composer/CompliancePanel.tsx` | Real-time compliance score UI embedded in the composer |
| `src/components/settings/ComplianceProfileManager.tsx` | Settings page for managing profiles, rules, and import/export |
| `src/components/composer/Composer.tsx` | Host component; renders `CompliancePanel` when `mode !== "reply"` and `mode !== "replyAll"` |

---

## Integration with Composer

In `Composer.tsx:575-583`:

```tsx
{activeAccountId && mode !== "reply" && mode !== "replyAll" && (
  <CompliancePanel
    editor={editor}
    accountId={activeAccountId}
    subject={subject}
    bodyHtml={editor?.getHTML() ?? ""}
    recipients={[...to, ...cc, ...bcc]}
  />
)}
```

- The panel only renders for **new messages** (`mode === "new"`). Reply and forward modes are excluded — compliance requirements are less relevant for ongoing conversations.
- The panel subscribes to `subject`, `bodyHtml`, and `recipients` from the composer store. Each change triggers a re-check after a 500ms debounce.
- The `CompliancePanel` calls `onViolationsChange` (optional prop) to signal the composer if violations exist.
