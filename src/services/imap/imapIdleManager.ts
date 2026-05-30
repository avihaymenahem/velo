/**
 * IMAP IDLE (push) manager — frontend side.
 *
 * For each (accountId, folder) pair, starts a long-lived IDLE session on the
 * Rust side and listens for `imap-idle-event` Tauri events. On a "new" event,
 * triggers a debounced delta sync of that account.
 *
 * Lifecycle:
 *   - `startIdleForAccount(accountId)` — opens IDLE for INBOX + any extra
 *     folders configured in settings. Idempotent.
 *   - `stopIdleForAccount(accountId)` — stops every watcher for the account.
 *   - `stopAllIdle()` — shuts everything down (used on offline / window close).
 *
 * Events are debounced per account so a burst of EXISTS responses triggers
 * only one sync.
 */

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { getAccount } from "../db/accounts";
import { getSetting } from "../db/settings";
import { ensureFreshToken } from "../oauth/oauthTokenManager";
import { syncAccount } from "../gmail/syncManager";
import {
  imapIdleStart,
  imapIdleStop,
  imapIdleStopAccount,
  imapIdleStopAll,
  type ImapIdleEvent,
} from "./tauriCommands";
import { buildImapConfig } from "./imapConfigBuilder";

const IDLE_ENABLED_SETTING = "imap_idle_enabled";
const IDLE_FOLDERS_SETTING_PREFIX = "imap_idle_folders_";
const DEFAULT_IDLE_FOLDERS = ["INBOX"];
const SYNC_DEBOUNCE_MS = 2000;

let unlistenFn: UnlistenFn | null = null;
const watchedKeys = new Set<string>();
const accountSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function key(accountId: string, folder: string): string {
  return `${accountId}::${folder}`;
}

export async function isIdleEnabled(): Promise<boolean> {
  const v = await getSetting(IDLE_ENABLED_SETTING);
  return v === null ? true : v === "true";
}

export async function setIdleEnabled(enabled: boolean): Promise<void> {
  const { setSetting } = await import("../db/settings");
  await setSetting(IDLE_ENABLED_SETTING, enabled ? "true" : "false");
}

export async function getIdleFoldersForAccount(
  accountId: string,
): Promise<string[]> {
  const v = await getSetting(IDLE_FOLDERS_SETTING_PREFIX + accountId);
  if (!v) return DEFAULT_IDLE_FOLDERS;
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      return parsed.length > 0 ? parsed : DEFAULT_IDLE_FOLDERS;
    }
  } catch {
    // fall through
  }
  return DEFAULT_IDLE_FOLDERS;
}

export async function setIdleFoldersForAccount(
  accountId: string,
  folders: string[],
): Promise<void> {
  const { setSetting } = await import("../db/settings");
  await setSetting(
    IDLE_FOLDERS_SETTING_PREFIX + accountId,
    JSON.stringify(folders),
  );
}

function scheduleDebouncedSync(accountId: string): void {
  const existing = accountSyncTimers.get(accountId);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    accountSyncTimers.delete(accountId);
    syncAccount(accountId).catch((e) => {
      console.warn(`[imapIdle] sync after IDLE event failed for ${accountId}:`, e);
    });
  }, SYNC_DEBOUNCE_MS);
  accountSyncTimers.set(accountId, t);
}

async function ensureListener(): Promise<void> {
  if (unlistenFn) return;
  unlistenFn = await listen<ImapIdleEvent>("imap-idle-event", (e) => {
    const payload = e.payload;
    if (!payload) return;
    if (payload.kind === "new") {
      console.log(
        `[imapIdle] new data on ${payload.account_id}/${payload.folder} — scheduling sync`,
      );
      scheduleDebouncedSync(payload.account_id);
    } else if (payload.kind === "unsupported") {
      console.warn(
        `[imapIdle] server does not support IDLE for ${payload.account_id}/${payload.folder} — falling back to polling`,
      );
      watchedKeys.delete(key(payload.account_id, payload.folder));
    } else if (payload.kind === "stopped") {
      watchedKeys.delete(key(payload.account_id, payload.folder));
    }
  });
}

/**
 * Start IDLE watchers for an IMAP account on its configured folders.
 * Silently no-ops for non-IMAP accounts and when the global toggle is off.
 */
export async function startIdleForAccount(accountId: string): Promise<void> {
  if (!(await isIdleEnabled())) return;

  const account = await getAccount(accountId);
  if (!account || account.provider !== "imap") return;

  await ensureListener();

  let config;
  try {
    if (account.auth_method === "oauth2") {
      const token = await ensureFreshToken(account);
      config = buildImapConfig(account, token);
    } else {
      config = buildImapConfig(account);
    }
  } catch (e) {
    console.warn(`[imapIdle] cannot build config for ${accountId}:`, e);
    return;
  }

  const folders = await getIdleFoldersForAccount(accountId);
  for (const folder of folders) {
    const k = key(accountId, folder);
    if (watchedKeys.has(k)) continue;
    try {
      await imapIdleStart(accountId, folder, config);
      watchedKeys.add(k);
    } catch (e) {
      console.warn(`[imapIdle] start failed ${k}:`, e);
    }
  }
}

export async function startIdleForAccounts(accountIds: string[]): Promise<void> {
  for (const id of accountIds) {
    await startIdleForAccount(id);
  }
}

export async function stopIdleForAccount(accountId: string): Promise<void> {
  await imapIdleStopAccount(accountId).catch((e) =>
    console.warn(`[imapIdle] stop account failed:`, e),
  );
  for (const k of [...watchedKeys]) {
    if (k.startsWith(`${accountId}::`)) watchedKeys.delete(k);
  }
  const t = accountSyncTimers.get(accountId);
  if (t) {
    clearTimeout(t);
    accountSyncTimers.delete(accountId);
  }
}

/**
 * Stop a single folder watcher (e.g. when the user de-selects a folder in settings).
 */
export async function stopIdleFolder(
  accountId: string,
  folder: string,
): Promise<void> {
  await imapIdleStop(accountId, folder).catch((e) =>
    console.warn(`[imapIdle] stop folder failed:`, e),
  );
  watchedKeys.delete(key(accountId, folder));
}

export async function stopAllIdle(): Promise<void> {
  await imapIdleStopAll().catch((e) =>
    console.warn(`[imapIdle] stop all failed:`, e),
  );
  watchedKeys.clear();
  for (const t of accountSyncTimers.values()) clearTimeout(t);
  accountSyncTimers.clear();
  if (unlistenFn) {
    unlistenFn();
    unlistenFn = null;
  }
}

/**
 * Restart IDLE for all accounts (e.g., after settings changed or account list updated).
 */
export async function restartIdleForAccounts(
  accountIds: string[],
): Promise<void> {
  await stopAllIdle();
  await startIdleForAccounts(accountIds);
}

/** For tests — clear in-memory state without touching the Rust side. */
export function _resetForTests(): void {
  watchedKeys.clear();
  for (const t of accountSyncTimers.values()) clearTimeout(t);
  accountSyncTimers.clear();
  unlistenFn = null;
}
