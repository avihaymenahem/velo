import { getDb } from "../db/connection";
import { withTransaction } from "../db/connection";

let snoozeInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Check for snoozed threads that should be un-snoozed (time has passed).
 * Moves them back to INBOX.
 */
async function checkSnoozedThreads(): Promise<void> {
  try {
    const db = await getDb();
    const now = Math.floor(Date.now() / 1000);

    // Find threads where snooze time has passed
    const snoozed = await db.select<
      { id: string; account_id: string }[]
    >(
      "SELECT id, account_id FROM threads WHERE is_snoozed = 1 AND snooze_until <= $1",
      [now],
    );

    if (snoozed.length > 0) {
      await withTransaction(async (txDb) => {
        for (const thread of snoozed) {
          // Un-snooze the thread
          await txDb.execute(
            "UPDATE threads SET is_snoozed = 0, snooze_until = NULL WHERE account_id = $1 AND id = $2",
            [thread.account_id, thread.id],
          );

          // Re-add INBOX label
          await txDb.execute(
            "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'INBOX')",
            [thread.account_id, thread.id],
          );
        }
      });

      // Notify the UI to refresh
      window.dispatchEvent(new Event("velo-sync-done"));
    }
  } catch (err) {
    console.error("Failed to check snoozed threads:", err);
  }
}

/**
 * Snooze a thread: remove from INBOX, set snooze time.
 */
export async function snoozeThread(
  accountId: string,
  threadId: string,
  snoozeUntil: number,
): Promise<void> {
  await withTransaction(async (db) => {
    // Mark as snoozed in DB
    await db.execute(
      "UPDATE threads SET is_snoozed = 1, snooze_until = $1 WHERE account_id = $2 AND id = $3",
      [snoozeUntil, accountId, threadId],
    );

    // Remove INBOX label, add SNOOZED
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'INBOX'",
      [accountId, threadId],
    );
    await db.execute(
      "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'SNOOZED')",
      [accountId, threadId],
    );
  });
}

/**
 * Start background snooze checker (runs every 60 seconds).
 */
export function startSnoozeChecker(): void {
  if (snoozeInterval) return;
  checkSnoozedThreads(); // Initial check
  snoozeInterval = setInterval(checkSnoozedThreads, 60_000);
}

/**
 * Stop background snooze checker.
 */
export function stopSnoozeChecker(): void {
  if (snoozeInterval) {
    clearInterval(snoozeInterval);
    snoozeInterval = null;
  }
}
