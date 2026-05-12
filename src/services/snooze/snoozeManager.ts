import { queryWithRetry } from "../db/connection";
import { withTransaction } from "../db/connection";
import { getCurrentUnixTimestamp } from "@/utils/timestamp";
import { createBackgroundChecker } from "../backgroundCheckers";

/**
 * Check for snoozed threads that should be un-snoozed (time has passed).
 * Moves them back to INBOX.
 */
async function checkSnoozedThreads(): Promise<void> {
  const now = getCurrentUnixTimestamp();

  // Find threads where snooze time has passed
  const snoozed = await queryWithRetry(async (db) =>
    db.select<{ id: string; account_id: string }[]>(
      "SELECT id, account_id FROM threads WHERE is_snoozed = 1 AND snooze_until <= $1",
      [now],
    ),
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

const snoozeChecker = createBackgroundChecker("Snooze", checkSnoozedThreads);
export const startSnoozeChecker = snoozeChecker.start;
export const stopSnoozeChecker = snoozeChecker.stop;
