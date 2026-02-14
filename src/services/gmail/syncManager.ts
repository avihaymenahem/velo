import { getGmailClient } from "./tokenManager";
import { initialSync, deltaSync, type SyncProgress } from "./sync";
import { getAccount, clearAccountHistoryId } from "../db/accounts";
import { getSetting } from "../db/settings";
import { imapInitialSync, imapDeltaSync } from "../imap/imapSync";

const SYNC_INTERVAL_MS = 15_000; // 15 seconds — delta syncs are lightweight (single API call when idle)

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncPromise: Promise<void> | null = null;
let pendingAccountIds: string[] | null = null;

export type SyncStatusCallback = (
  accountId: string,
  status: "syncing" | "done" | "error",
  progress?: SyncProgress,
  error?: string,
) => void;

let statusCallback: SyncStatusCallback | null = null;

export function onSyncStatus(cb: SyncStatusCallback): () => void {
  statusCallback = cb;
  return () => {
    statusCallback = null;
  };
}

/**
 * Run a sync for a single Gmail API account (initial or delta).
 */
async function syncGmailAccount(accountId: string): Promise<void> {
  const client = await getGmailClient(accountId);
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const syncDays = parseInt(syncPeriodStr ?? "365", 10) || 365;

  if (account.history_id) {
    // Delta sync
    try {
      await deltaSync(client, accountId, account.history_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message === "HISTORY_EXPIRED") {
        // Fallback to full sync
        await initialSync(client, accountId, syncDays, (progress) => {
          statusCallback?.(accountId, "syncing", progress);
        });
      } else {
        throw err;
      }
    }
  } else {
    // First time — full initial sync
    await initialSync(client, accountId, syncDays, (progress) => {
      statusCallback?.(accountId, "syncing", progress);
    });
  }
}

/**
 * Run a sync for a single IMAP account (initial or delta).
 */
async function syncImapAccount(accountId: string): Promise<void> {
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const syncDays = parseInt(syncPeriodStr ?? "365", 10) || 365;

  if (account.history_id) {
    // Delta sync — IMAP uses folder-level UID tracking
    await imapDeltaSync(accountId);
  } else {
    // First time — full initial sync
    await imapInitialSync(accountId, syncDays, (progress) => {
      statusCallback?.(accountId, "syncing", {
        phase: progress.phase === "folders" ? "labels" : progress.phase === "threading" ? "messages" : progress.phase as "labels" | "threads" | "messages" | "done",
        current: progress.current,
        total: progress.total,
      });
    });
  }
}

/**
 * Run a sync for a single account (initial or delta).
 * Routes to Gmail or IMAP sync based on account provider.
 */
async function syncAccountInternal(accountId: string): Promise<void> {
  try {
    statusCallback?.(accountId, "syncing");
    const account = await getAccount(accountId);

    if (!account) {
      throw new Error("Account not found");
    }

    if (account.provider === "imap") {
      await syncImapAccount(accountId);
    } else {
      await syncGmailAccount(accountId);
    }

    statusCallback?.(accountId, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Sync failed for account ${accountId}:`, message);
    statusCallback?.(accountId, "error", undefined, message);
  }
}

async function runSync(accountIds: string[]): Promise<void> {
  if (syncPromise) {
    // Queue these accounts, merging with any already-pending IDs
    const existing = new Set(pendingAccountIds ?? []);
    for (const id of accountIds) existing.add(id);
    pendingAccountIds = [...existing];
    return syncPromise;
  }

  syncPromise = (async () => {
    try {
      for (const id of accountIds) {
        await syncAccountInternal(id);
      }
    } finally {
      syncPromise = null;
    }

    // Drain the queue — if something was queued while we were syncing, run it now
    if (pendingAccountIds) {
      const queued = pendingAccountIds;
      pendingAccountIds = null;
      await runSync(queued);
    }
  })();

  return syncPromise;
}

/**
 * Run sync for a single account, queuing if already running.
 */
export async function syncAccount(accountId: string): Promise<void> {
  return runSync([accountId]);
}

/**
 * Start the background sync timer for all accounts.
 */
export function startBackgroundSync(accountIds: string[]): void {
  stopBackgroundSync();

  // Immediate sync
  runSync(accountIds);

  // Periodic sync
  syncTimer = setInterval(() => {
    runSync(accountIds);
  }, SYNC_INTERVAL_MS);
}

/**
 * Stop the background sync timer.
 */
export function stopBackgroundSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

/**
 * Trigger an immediate sync for all provided accounts.
 * Waits for completion even if a background sync is in progress.
 */
export async function triggerSync(accountIds: string[]): Promise<void> {
  await runSync(accountIds);
}

/**
 * Clear history IDs and perform a full re-sync for all provided accounts.
 * This re-downloads all threads from scratch.
 */
export async function forceFullSync(accountIds: string[]): Promise<void> {
  for (const id of accountIds) {
    await clearAccountHistoryId(id);
  }
  await runSync(accountIds);
}
