# Velo QA & Stabilization Specification

**Date:** 2026-05-12
**Status:** Draft
**Version:** 0.4.22

---

## Executive Summary

This document captures all identified issues from QA testing of Velo v0.4.22, categorizes them by severity, traces root causes, and defines specification-driven solutions for each. The issues span database migrations, i18n initialization, account setup UX, settings panels, and Rust async runtime configuration.

---

## Issue Taxonomy

```
P0 - Critical (blocks functionality)
├── Database migrations incomplete
├── i18n initialization failure
└── Rust Tokio runtime panic

P1 - High (major UX broken)
├── IMAP/SMTP test failures
├── Account setup stuck states
├── Workflow presets not saving
└── Queue inspector errors

P2 - Medium (UX degraded)
├── Missing translation keys
├── Empty states without actions
├── Campaign page styling
└── Queue pause/resume UI

P3 - Low (Polish)
├── PGP tab clarity
├── Compliance tab education
├── Template presets
└── Composer presets
```

---

## P0: Critical Issues

### Issue P0-1: Database Migration Failures

**Symptom:**
```
App.tsx:370 Failed to initialize: error returned from database: (code: 1) index idx_quick_steps_account already exists
QueueInspector.tsx:53 Failed to load queue operations: error returned from database: (code: 1) no such table: pending_operations
ComplianceProfileManager.tsx:41 error returned from database: (code: 1) no such table: compliance_profiles
contactStore.ts:105 no such table: contact_groups
```

**Root Cause Analysis:**
- Migration v12 tries to create `idx_quick_steps_account` but it already exists from a prior run or previous migration version
- `pending_operations` table is defined in migration v17 (version 17), not v16 as expected
- `compliance_profiles` is defined in migration v30
- `contact_groups` is defined in migration v23

The error message shows "Running migration v12: Quick steps" but the database reports version 1 in console logs. This suggests:
1. Migration table `_migrations` has incorrect version recorded
2. OR `getCurrentVersion()` returns wrong value
3. OR migrations were never properly applied

**Tracing Path:**
```
getDb() → initDb() → getCurrentVersion() → _migrations table
                                      ↓
                              MIGRATIONS[version-1]
                                      ↓
                              db.execute(sql)
                                      ↓
                            ERROR: already exists
```

**Specification:**

```typescript
// connection.ts - Fix version detection and idempotent migrations

interface MigrationResult {
  applied: number;
  current: number;
  errors: string[];
}

async function runMigrationsSafe(): Promise<MigrationResult> {
  const db = await getDb();
  const currentVersion = await getCurrentVersion(db);
  const targetVersion = MIGRATIONS.length;

  const result: MigrationResult = {
    applied: 0,
    current: currentVersion,
    errors: []
  };

  // CRITICAL FIX: Use idempotent migration pattern
  for (let v = currentVersion + 1; v <= targetVersion; v++) {
    const migration = MIGRATIONS[v - 1];
    try {
      await db.execute("BEGIN IMMEDIATE");
      await db.execute(migration.sql);
      await db.execute(
        "INSERT OR REPLACE INTO _migrations (version, applied_at) VALUES ($1, $2)",
        [v, Date.now()]
      );
      await db.execute("COMMIT");
      result.applied++;
      result.current = v;
    } catch (err) {
      await db.execute("ROLLBACK");

      // FIX: Detect "already exists" errors and continue
      if (isAlreadyExistsError(err)) {
        console.warn(`[Migration] v${v} already applied (${migration.description})`);
        await db.execute(
          "INSERT OR IGNORE INTO _migrations (version, applied_at) VALUES ($1, $2)",
          [v, Date.now()]
        );
        result.current = v;
        continue;
      }

      result.errors.push(`v${v} (${migration.description}): ${err}`);
      console.error(`[Migration] v${v} failed:`, err);
      break;
    }
  }

  return result;
}
```

**Files to Modify:**
- `src/services/db/connection.ts` - Add idempotent migration handling
- `src/services/db/migrations.ts` - Verify all table definitions exist

**Test Specification:**
```typescript
it("should handle re-run of migrations gracefully", async () => {
  const result = await runMigrationsSafe();
  expect(result.errors).toHaveLength(0);
  expect(result.current).toBeGreaterThanOrEqual(36);
});
```

---

### Issue P0-2: i18n Initialization Race Condition

**Symptom:**
```
react-i18next:: useTranslation: You will need to pass in a i18next instance by using initReactI18next
TypeError: Cannot read properties of undefined (reading 'hasLanguageSomeTranslations')
    at setLng (i18next.js:2002:29)
    at _I18n.changeLanguage (i18next.js:2023:7)
    at changeLanguage (i18n.ts:65:8)
    at onChange (LanguageSwitcher.tsx:24:11)
```

**Root Cause Analysis:**
The i18n initialization flow has a race condition:
1. `initI18n()` is called during app init but is async
2. `LanguageSwitcher` calls `changeLanguage()` synchronously on mount
3. `changeLanguage()` tries to call `i18n.changeLanguage()` but `i18n` is not yet initialized

**Tracing Path:**
```
App.tsx (init)
  → initI18n() [ASYNC - not awaited]
  → <LanguageSwitcher />
      → useTranslation() [returns before i18n ready]
      → onChange (changeLanguage) [i18n is undefined]

Component renders before async init completes
```

**Specification:**

```typescript
// i18n.ts - Fix initialization pattern

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en/translation.json";
// ... other locales

export const SUPPORTED_LOCALES = ["en", "fr", "ar", "ja", "it"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

let initPromise: Promise<typeof i18n> | null = null;
let initialized = false;

export async function initI18n(language?: string): Promise<typeof i18n> {
  // FIX: Prevent multiple init calls
  if (initPromise) return initPromise;

  initPromise = doInitI18n(language);
  return initPromise;
}

async function doInitI18n(language?: string): Promise<typeof i18n> {
  if (initialized) return i18n;

  const browserLocale = getBrowserLocale();
  const lng = language ?? browserLocale;

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        fr: { translation: fr },
        ar: { translation: ar },
        ja: { translation: ja },
        it: { translation: it },
      },
      lng,
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      returnNull: false,
      // FIX: Add react config
      react: {
        useSuspense: true,
        bindI18n: "languageChanged loaded",
        bindI18nStore: "added",
      },
    });

  initialized = true;
  return i18n;
}

export function changeLanguage(lng: SupportedLocale): Promise<void> {
  // FIX: Wait for initialization if not ready
  if (!initialized) {
    return initI18n().then(() => i18n.changeLanguage(lng));
  }
  return i18n.changeLanguage(lng) as Promise<void>;
}

// FIX: Export a hook that handles loading state
export function useI18nReady(): boolean {
  const [ready, setReady] = useState(initialized);
  useEffect(() => {
    if (!initialized) {
      initI18n().then(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);
  return ready;
}
```

**Files to Modify:**
- `src/locales/i18n.ts` - Fix init pattern, add ready state

**Test Specification:**
```typescript
it("should not crash when changeLanguage called before init", async () => {
  // Arrange - don't initialize i18n
  // Act - try to change language
  await expect(changeLanguage("fr")).resolves.not.toThrow();
});
```

---

### Issue P0-3: Rust Tokio Runtime Panic

**Symptom:**
```
thread '<unnamed>' (16936) panicked at src\export\scheduler.rs:9:5:
there is no reactor running, must be called from the context of a Tokio 1.x runtime
```

**Root Cause Analysis:**
The `run_backup_scheduler` function spawns a Tokio task but is called from a non-async context (Tauri command handler or `lib.rs` init) where no Tokio runtime exists. Tokio requires an active runtime context for `spawn()`.

**Tracing Path:**
```
lib.rs (init)
  → run_backup_scheduler(app)
      → tokio::spawn() [NO RUNTIME - PANIC]
```

**Specification:**

```rust
// lib.rs - Fix scheduler initialization

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ... existing setup ...

    // FIX: Initialize backup scheduler WITH runtime
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        run_backup_scheduler(handle).await;
    });

    app.run(|_app_handle, _event| {
        // Existing event loop
    });
}

// Or better: use tauri::async_runtime consistently
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                backup::run_backup_scheduler(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Files to Modify:**
- `src-tauri/src/lib.rs` - Ensure scheduler spawns inside Tokio runtime
- `src-tauri/src/export/scheduler.rs` - Document runtime requirements

---

## P1: High Priority Issues

### Issue P1-1: IMAP/SMTP Mailtrap Connection Failures

**Symptom:**
```
IMAP Connection:
TCP connect to sandbox.smtp.mailtrap.io:993 timed out after 30s

SMTP Connection:
SMTP test error: Connection error: Connection error: The token supplied to the function is invalid (os error -2146893048)
```

**Root Cause Analysis:**
1. **IMAP Timeout:** Windows firewall or network blocking port 993 outbound, OR Mailtrap sandbox not accessible from this network location
2. **SMTP Token Error:** The error `os error -2146893048` is a Windows SSPI/Schannel error indicating TLS negotiation failure - likely because the SMTP client is trying to use a feature not supported by Mailtrap's TLS version

**Tracing Path:**
```
AddImapAccount.tsx
  → test_imap_connection()
      → invoke("imap_test_connection")
          → Rust imap::client::test_connection()
              → tokio::net::TcpStream::connect()
                  → TIMEOUT after 30s

  → test_smtp_connection()
      → invoke("smtp_test_connection")
          → Rust smtp::client::test_connection()
              → lettre::SmtpTransport
                  → TLS negotiation fails (SSPI error)
```

**Specification:**

```typescript
// AddImapAccount.tsx - Add better error handling and timeouts

interface ConnectionTestResult {
  success: boolean;
  error?: string;
  errorType?: "timeout" | "network" | "auth" | "tls" | "server";
  details?: string;
}

async function testImapWithTimeout(
  config: ImapConfig,
  timeoutMs = 15000
): Promise<ConnectionTestResult> {
  const timeoutPromise = new Promise<ConnectionTestResult>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), timeoutMs)
  );

  try {
    const result = await Promise.race([
      invoke<ConnectionTestResult>("imap_test_connection", { config }),
      timeoutPromise
    ]);
    return result;
  } catch (err) {
    if (err.message === "timeout") {
      return {
        success: false,
        errorType: "timeout",
        error: t("account.testConnectionTimeout"),
        details: `sandBox.smtp.mailtrap.io:${config.port}`
      };
    }
    throw err;
  }
}
```

```rust
// smtp/client.rs - Fix TLS handling for Mailtrap

pub async fn test_connection(config: &SmtpConfig) -> Result<SmtpSendResult, String> {
    // FIX: Use correct security mode for Mailtrap
    let security = match config.security.as_str() {
        "ssl" | "tls" => SecurityPort::465,
        "starttls" => SecurityPort::587,
        _ => SecurityPort::587,
    };

    let credentials = Credentials::new(
        config.username.clone(),
        config.password.clone(),
    );

    // FIX: Mailtrap uses STARTTLS on port 587, not implicit TLS
    let transport = match security {
        SecurityPort::465 => {
            AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)
                .map_err(|e| format!("SMTP relay error: {}", e))?
                .port(465)
                .credentials(credentials)
                .build()
        }
        SecurityPort::587 => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
                .map_err(|e| format!("SMTP STARTTLS error: {}", e))?
                .port(587)
                .credentials(credentials)
                .build()
        }
        _ => {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host)
                .port(25)
                .credentials(credentials)
                .build()
        }
    };

    transport.test_connection().await
        .map_err(|e| format!("SMTP test error: {}", e))
}
```

**Files to Modify:**
- `src/components/accounts/AddImapAccount.tsx` - Add timeout handling
- `src-tauri/src/smtp/client.rs` - Fix TLS/security port handling

---

### Issue P1-2: Account Setup Stuck States

**Symptom:**
- When adding account without testing, UI gets stuck
- Gmail account flow: clicking second card leads to wrong view

**Root Cause Analysis:**
1. No error boundary around account setup
2. `view` state transitions are not properly handled
3. Missing loading/cancel states

**Specification:**

```typescript
// AddAccount.tsx - Fix state machine

type ViewState =
  | { screen: "select-provider" }
  | { screen: "gmail"; step: "setup" | "auth" | "verify" }
  | { screen: "gmail-easy" }
  | { screen: "gmail-fast-sync" }
  | { screen: "imap"; step: "config" | "test" | "save" }
  | { screen: "caldav" }
  | { screen: "done" }
  | { screen: "error"; message: string };

// Replace useState<View> with useReducer for predictable transitions
function reducer(state: ViewState, action: Action): ViewState {
  switch (action.type) {
    case "GOTO_GMAIL":
      return { screen: "gmail", step: "setup" };
    case "GOTO_IMAP":
      return { screen: "imap", step: "config" };
    case "TEST_START":
      if (state.screen === "imap") {
        return { screen: "imap", step: "test" };
      }
      return state;
    case "TEST_SUCCESS":
      if (state.screen === "imap") {
        return { screen: "imap", step: "save" };
      }
      return { screen: "done" };
    case "TEST_FAILURE":
      return { screen: "error", message: action.error };
    case "SAVE_SUCCESS":
      return { screen: "done" };
    default:
      return state;
  }
}

// Add cancel button that works at any step
const handleCancel = useCallback(() => {
  if (status === "testing" || status === "authenticating") {
    // Abort in-flight operation
    abortController.abort();
  }
  onClose();
}, [status]);
```

**Files to Modify:**
- `src/components/accounts/AddAccount.tsx` - State machine refactor

---

### Issue P1-3: Workflow Preset Save Failure

**Symptom:**
```
workflows tab settings, when selecting workflow preset save not work and nothing shows page stuck
```

**Root Cause Analysis:**
Looking at `WorkflowEditor.tsx`, the `handleApplyPreset` function sets state and triggers a re-render, but the save operation (`handleSave`) requires `activeAccountId`. If no account is configured, `handleSave` returns early without feedback.

**Tracing Path:**
```
WorkflowEditor
  → handleApplyPreset(preset)
      → setName(preset.name) [state update]
      → setShowForm(true)
      → handleSave()
          → if (!activeAccountId) return; [EARLY EXIT - no user feedback]
```

**Specification:**

```typescript
// WorkflowEditor.tsx - Fix preset application and save feedback

const [saveError, setSaveError] = useState<string | null>(null);

const handleSave = useCallback(async () => {
  setSaveError(null);

  if (!activeAccountId) {
    setSaveError(t("workflow.noAccountConfigured"));
    return;
  }

  if (!name.trim()) {
    setSaveError(t("workflow.nameRequired"));
    return;
  }

  try {
    await upsertWorkflowRule({
      id: editingId ?? undefined,
      accountId: activeAccountId,
      name: name.trim(),
      triggerEvent,
      triggerConditions: triggerConditions || undefined,
      actions: JSON.stringify(actions),
    });
    resetForm();
    await loadRules();
  } catch (err) {
    setSaveError(String(err));
  }
}, [activeAccountId, name, triggerEvent, triggerConditions, actions, editingId]);

// UI: Show error inline
{saveError && (
  <div className="text-sm text-error bg-error/10 px-3 py-2 rounded">
    {saveError}
  </div>
)}
```

**Files to Modify:**
- `src/components/settings/WorkflowEditor.tsx` - Add save error feedback

---

## P2: Medium Priority Issues

### Issue P2-1: Missing Translation Keys in AddAccount

**Symptom:**
```
the component has no keys for translations
```

**Root Cause Analysis:**
`AddImapAccount` component uses hardcoded strings instead of `useTranslation()` hook.

**Specification:**
Audit and fix all translation keys per component:

| Component | Missing Keys | Action |
|-----------|-------------|--------|
| `AddImapAccount.tsx` | All UI text | Add `useTranslation` + keys |
| `AddCalDavAccount.tsx` | All UI text | Add `useTranslation` + keys |

```typescript
// AddImapAccount.tsx - Fix translation pattern
export function AddImapAccount() {
  const { t } = useTranslation();

  return (
    <>
      <input
        placeholder={t("account.imapHostPlaceholder")}
        // ...
      />
      <button>
        {t("account.testConnection")}
      </button>
    </>
  );
}
```

**Files to Modify:**
- `src/components/accounts/AddImapAccount.tsx`
- `src/components/accounts/AddCalDavAccount.tsx`
- `src/locales/en/translation.json` (add missing keys)

---

### Issue P2-2: Empty States Without Actions

**Symptom:**
```
in account settings page it should have not a message only but :No mail accounts connected
and any available way to click and add account.
```

**Specification:**

```typescript
// SettingsPage.tsx - Fix empty state pattern

function NoAccountsEmptyState() {
  const { t } = useTranslation();
  const [showAddAccount, setShowAddAccount] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-text-primary mb-2">
          {t("settings.noMailAccountsConnected")}
        </h3>
        <p className="text-sm text-text-secondary mb-6">
          {t("settings.addAccountToGetStarted")}
        </p>
        <Button onClick={() => setShowAddAccount(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t("settings.addMailAccount")}
        </Button>
      </div>

      {showAddAccount && (
        <AddAccount
          onClose={() => setShowAddAccount(false)}
          onSuccess={() => setShowAddAccount(false)}
        />
      )}
    </div>
  );
}
```

**Files to Modify:**
- `src/components/settings/SettingsPage.tsx`

---

### Issue P2-3: Queue Pause/Resume UI

**Symptom:**
```
queue seems always on when account isnt configured nor any thing is being sent,
(icon pause when clicking showing resume in ui after refreshing its stays pause)
```

**Root Cause Analysis:**
Queue state is stored in component local state, not persisted. On refresh, state resets to "running".

**Specification:**
Persist queue state to settings:
```typescript
// settings.ts - Add queue state persistence
export async function getQueuePaused(): Promise<boolean> {
  const setting = await getSetting("queue_paused");
  return setting === "true";
}

export async function setQueuePaused(paused: boolean): Promise<void> {
  await saveSetting("queue_paused", String(paused));
}

// QueueInspector.tsx - Load persisted state
const [isPaused, setIsPaused] = useState(false);

useEffect(() => {
  getQueuePaused().then(setIsPaused);
}, []);

const handleTogglePause = async () => {
  const newState = !isPaused;
  await setQueuePaused(newState);
  setIsPaused(newState);
  if (newState) {
    stopQueueProcessor();
  } else {
    startQueueProcessor();
  }
};
```

**Files to Modify:**
- `src/services/db/settings.ts`
- `src/components/settings/QueueInspector.tsx`

---

## P3: Low Priority / Polish

### Issue P3-1: PGP Tab Clarity

**Symptom:**
```
pgp.pageDescription or tab page PGP Encryption not really understandable
and should we add do something?
```

**Specification:**
Add interactive onboarding for PGP:
```typescript
// PgpKeyManager.tsx - Add guided first-run
const [showOnboarding, setShowOnboarding] = useState(
  !account.has_pgp_key
);

return (
  <>
    {showOnboarding ? (
      <PGPOnboarding onComplete={() => setShowOnboarding(false)} />
    ) : (
      <KeyList />
    )}
  </>
);
```

### Issue P3-2: Compliance Tab Education

**Symptom:**
```
we should have some sort of compliance import (which format) preset or generation,
no educational material in that tab in settings
```

**Specification:**
Add help content and import wizard for compliance profiles.

### Issue P3-3: Template Presets

**Symptom:**
```
templates needs some presets built, and more improvements like preview
```

### Issue P3-4: Composer Presets

**Symptom:**
```
composing maybe presets as well
```

---

## Implementation Priority

| Priority | Issues | Estimated Complexity |
|----------|--------|---------------------|
| P0-1 | Database migrations | Medium |
| P0-2 | i18n initialization | Medium |
| P0-3 | Rust Tokio panic | Low |
| P1-1 | Mailtrap connections | Medium |
| P1-2 | Account setup states | Medium |
| P1-3 | Workflow preset save | Low |
| P2-1 | Translation keys | High (audit) |
| P2-2 | Empty states | Low |
| P2-3 | Queue pause/resume | Low |
| P3-* | Polish items | Low |

---

## Verification Plan

### Pre-flight Checks
1. `npx tsc --noEmit` - No TypeScript errors
2. `cargo check` - No Rust errors
3. `npm run test` - All tests pass

### Migration Verification
```typescript
it("should run all migrations without errors", async () => {
  const db = await getDb();
  const version = await getCurrentVersion(db);
  expect(version).toBeGreaterThanOrEqual(36);
});
```

### i18n Verification
```typescript
it("should change language without errors", async () => {
  await initI18n("en");
  await expect(changeLanguage("fr")).resolves.not.toThrow();
  await expect(changeLanguage("ar")).resolves.not.toThrow();
});
```

### E2E Account Setup
1. Fresh database
2. Open Add Account → IMAP/SMTP
3. Enter Mailtrap credentials
4. Test connection → both IMAP and SMTP succeed
5. Save account
6. Account appears in sidebar

---

## Files Summary

### Rust Changes
- `src-tauri/src/lib.rs` - Fix Tokio runtime init
- `src-tauri/src/smtp/client.rs` - Fix TLS handling

### TypeScript Changes
- `src/services/db/connection.ts` - Idempotent migrations
- `src/locales/i18n.ts` - Fix init race
- `src/components/accounts/AddAccount.tsx` - State machine
- `src/components/accounts/AddImapAccount.tsx` - Timeouts + translations
- `src/components/settings/WorkflowEditor.tsx` - Error feedback
- `src/components/settings/QueueInspector.tsx` - Persist pause state
- `src/components/settings/SettingsPage.tsx` - Empty state actions
- `src/locales/en/translation.json` - Add missing keys

---

*Document version 1.0 - 2026-05-12*
