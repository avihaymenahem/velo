import { getGmailClient } from "./tokenManager";
import { initialSync, deltaSync, type SyncProgress } from "./sync";
import { getAccount, clearAccountHistoryId } from "../db/accounts";
import { getSetting } from "../db/settings";
import { getThreadCountForAccount, deleteAllThreadsForAccount } from "../db/threads";
import { deleteAllMessagesForAccount } from "../db/messages";
import { imapInitialSync, imapDeltaSync } from "../imap/imapSync";
import { clearAllFolderSyncStates } from "../db/folderSyncState";
import { pruneDeletedImapUids } from "../db/deletedImapUids";
import { ensureFreshToken } from "../oauth/oauthTokenManager";
import { hasCalendarSupport, getCalendarProvider } from "../calendar/providerFactory";
import { getVisibleCalendars, upsertCalendar, updateCalendarSyncToken } from "../db/calendars";
import { upsertCalendarEvent, deleteEventByRemoteId } from "../db/calendarEvents";

const SYNC_INTERVAL_MS = 60_000; // 60 seconds — delta syncs are lightweight (single API call when idle)

/** Map IMAP sync phases to the SyncProgress phases the UI understands. */
function mapImapPhase(phase: string): "labels" | "threads" | "messages" | "done" {
  if (phase === "folders") return "labels";
  if (phase === "threading" || phase === "storing_threads") return "threads";
  if (phase === "messages") return "messages";
  if (phase === "done") return "done";
  return phase as "labels" | "threads" | "messages" | "done";
}

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncPromise: Promise<void> | null = null;
let pendingAccountIds: string[] | null = null;

export type SyncStatusCallback = (
  accountId: string,
  status: "syncing" | "done" | "error",
  progress?: SyncProgress,
  error?: string,
  storedCount?: number,
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
async function syncGmailAccount(accountId: string): Promise<{ storedCount?: number }> {
  const client = await getGmailClient(accountId);
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const daysBack = syncPeriodStr ? parseInt(syncPeriodStr, 10) : 365;
  // Note: daysBack = 0 means "Everything" (no date limit)

  if (account.history_id) {
    // Delta sync
    try {
      const count = await deltaSync(client, accountId, account.history_id);
      return { storedCount: count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      if (message === "HISTORY_EXPIRED") {
        // Fallback to full sync — always triggers UI refresh
        await initialSync(client, accountId, daysBack, (progress) => {
          statusCallback?.(accountId, "syncing", progress);
        });
        return {};
      } else {
        throw err;
      }
    }
  } else {
    // First time — full initial sync
    await initialSync(client, accountId, daysBack, (progress) => {
      statusCallback?.(accountId, "syncing", progress);
    });
    return {};
  }
}

/**
 * Run a sync for a single IMAP account (initial or delta).
 * Returns storedCount = number of new messages saved (0 = nothing new).
 * Returns undefined for initial syncs to always trigger a UI refresh.
 */
async function syncImapAccount(accountId: string): Promise<{ storedCount?: number }> {
  const account = await getAccount(accountId);

  if (!account) {
    throw new Error("Account not found");
  }

  // Refresh OAuth2 token before syncing (if applicable)
  if (account.auth_method === "oauth2") {
    await ensureFreshToken(account);
  }

  const syncPeriodStr = await getSetting("sync_period_days");
  const daysBack = syncPeriodStr ? parseInt(syncPeriodStr, 10) : 365;
  // Note: daysBack = 0 means "Everything" (no date limit)

  if (account.history_id) {
    // Delta sync — IMAP uses folder-level UID tracking.
    // Prune stale tombstones periodically (runs fast when table is small).
    pruneDeletedImapUids().catch(() => {});
    const result = await imapDeltaSync(accountId, daysBack);

    // Recovery: if delta sync found nothing new but the DB has no threads,
    // the previous initial sync likely failed or stored data incorrectly.
    // Force a full re-sync to recover.
    if ((result.storedCount ?? result.messages.length) === 0) {
      const threadCount = await getThreadCountForAccount(accountId);
      if (threadCount === 0) {
        console.warn(`[syncManager] IMAP delta sync returned 0 new messages and DB has 0 threads for ${accountId} — forcing full re-sync`);
        await clearAccountHistoryId(accountId);
        await clearAllFolderSyncStates(accountId);
        await imapInitialSync(accountId, daysBack, (progress) => {
          statusCallback?.(accountId, "syncing", {
            phase: mapImapPhase(progress.phase),
            current: progress.current,
            total: progress.total,
          });
        });
        return {}; // initial sync always triggers UI refresh (storedCount undefined)
      }
    }
    return { storedCount: result.storedCount ?? result.messages.length };
  } else {
    // First time — full initial sync
    await imapInitialSync(accountId, daysBack, (progress) => {
      statusCallback?.(accountId, "syncing", {
        phase: mapImapPhase(progress.phase),
        current: progress.current,
        total: progress.total,
      });
    });
    return {}; // initial sync always triggers UI refresh (storedCount undefined)
  }
}

/**
 * Sync calendars for a single account via the CalendarProvider abstraction.
 * Discovers calendars, syncs events for each visible calendar, stores results in DB.
 */
async function syncCalendarForAccount(accountId: string): Promise<void> {
  try {
    const supported = await hasCalendarSupport(accountId);
    if (!supported) return;

    const provider = await getCalendarProvider(accountId);

    // Discover/update calendars
    const calendarInfos = await provider.listCalendars();
    for (const cal of calendarInfos) {
      await upsertCalendar({
        accountId,
        provider: provider.type,
        remoteId: cal.remoteId,
        displayName: cal.displayName,
        color: cal.color,
        isPrimary: cal.isPrimary,
      });
    }

    // Sync events for each visible calendar
    const visibleCals = await getVisibleCalendars(accountId);
    for (const cal of visibleCals) {
      try {
        const syncResult = await provider.syncEvents(cal.remote_id, cal.sync_token ?? undefined);

        // Upsert created/updated events
        for (const event of [...syncResult.created, ...syncResult.updated]) {
          await upsertCalendarEvent({
            accountId,
            googleEventId: event.remoteEventId,
            summary: event.summary,
            description: event.description,
            location: event.location,
            startTime: event.startTime,
            endTime: event.endTime,
            isAllDay: event.isAllDay,
            status: event.status,
            organizerEmail: event.organizerEmail,
            attendeesJson: event.attendeesJson,
            htmlLink: event.htmlLink,
            calendarId: cal.id,
            remoteEventId: event.remoteEventId,
            etag: event.etag,
            icalData: event.icalData,
            uid: event.uid,
          });
        }

        // Delete removed events
        for (const remoteId of syncResult.deletedRemoteIds) {
          await deleteEventByRemoteId(cal.id, remoteId);
        }

        // Update sync token
        if (syncResult.newSyncToken || syncResult.newCtag) {
          await updateCalendarSyncToken(cal.id, syncResult.newSyncToken, syncResult.newCtag);
        }
      } catch (err) {
        console.warn(`[syncManager] Calendar sync failed for ${cal.display_name ?? cal.remote_id}:`, err);
      }
    }

    // Emit event for UI update
    window.dispatchEvent(new CustomEvent("velo-calendar-sync-done"));
  } catch (err) {
    console.warn(`[syncManager] Calendar sync failed for account ${accountId}:`, err);
  }
}

/**
 * Run a sync for a single account (initial or delta).
 * Routes to Gmail or IMAP sync based on account provider.
 */
async function syncAccountInternal(accountId: string): Promise<void> {
  let accountLabel = accountId;
  const _cycleStart = Date.now();
  try {
    const account = await getAccount(accountId);

    if (!account) {
      throw new Error("Account not found");
    }

    accountLabel = `${account.email} (${accountId})`;
    statusCallback?.(accountId, "syncing");

    console.log(`[sync] start ${accountLabel} provider=${account.provider}`);

    if (account.provider === "caldav") {
      // CalDAV-only accounts — skip email sync, only sync calendar
      await syncCalendarForAccount(accountId);
      statusCallback?.(accountId, "done");
      return;
    }

    let storedCount: number | undefined;
    if (account.provider === "imap") {
      ({ storedCount } = await syncImapAccount(accountId));
    } else {
      ({ storedCount } = await syncGmailAccount(accountId));
    }

    // Always emit "done" when an initial sync completes (clears the bar).
    // Also emit for delta syncs that fell back to initial (recovery re-sync)
    // since those emit progress via statusCallback inside syncImapAccount.
    console.log(`[sync] done ${accountLabel} stored=${storedCount ?? "?"} ms=${Date.now() - _cycleStart}`);
    statusCallback?.(accountId, "done", undefined, undefined, storedCount);

    // Sync calendar alongside email (non-blocking — calendar errors don't affect email sync)
    syncCalendarForAccount(accountId).catch((err) => {
      console.warn(`[syncManager] Calendar sync error for ${accountId}:`, err);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
    console.error(`[sync] error ${accountLabel} ms=${Date.now() - _cycleStart}:`, message);
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
 * When `skipImmediateSync` is true the first periodic sync is deferred to the
 * next interval tick — useful when the caller already triggered a sync for a
 * newly-added account and doesn't want existing accounts to block it.
 */
export function startBackgroundSync(accountIds: string[], skipImmediateSync = false): void {
  stopBackgroundSync();

  if (!skipImmediateSync) {
    // Immediate sync
    runSync(accountIds);
  }

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

/**
 * Delete all local data for a single account and re-sync from scratch.
 * Removes all threads, messages, history ID, and IMAP folder sync states,
 * then runs a fresh initial sync.
 */
export async function resyncAccount(accountId: string): Promise<void> {
  await deleteAllThreadsForAccount(accountId);
  await deleteAllMessagesForAccount(accountId);
  await clearAccountHistoryId(accountId);
  await clearAllFolderSyncStates(accountId);
  await runSync([accountId]);
}
