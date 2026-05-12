import { queryWithRetry } from "../db/connection";
import {
  getPendingFollowUpReminders,
  updateFollowUpStatus,
} from "../db/followUpReminders";
import { notifyFollowUpDue } from "../notifications/notificationManager";
import { createBackgroundChecker } from "../backgroundCheckers";

/**
 * Check for follow-up reminders that have fired.
 * If a reply has been received since the reminder was created, auto-cancel it.
 * Otherwise, trigger a notification.
 */
async function checkFollowUpReminders(): Promise<void> {
  const reminders = await getPendingFollowUpReminders();
  if (reminders.length === 0) return;

  for (const reminder of reminders) {
    // Check if a reply has arrived: any message in the thread from someone
    // other than the account owner, dated after the tracked message
    const replies = await queryWithRetry(async (db) =>
      db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM messages m
         WHERE m.account_id = $1 AND m.thread_id = $2
           AND m.date > (SELECT date FROM messages WHERE id = $3 AND account_id = $1)
           AND m.from_address != (SELECT email FROM accounts WHERE id = $1)`,
        [reminder.account_id, reminder.thread_id, reminder.message_id],
      ),
    );

    if ((replies[0]?.count ?? 0) > 0) {
      // Reply exists — auto-cancel the reminder
      await updateFollowUpStatus(reminder.id, "cancelled");
    } else {
      // No reply — trigger notification
      await updateFollowUpStatus(reminder.id, "triggered");

      // Get thread subject for notification
      const threads = await queryWithRetry(async (db) =>
        db.select<{ subject: string | null }[]>(
          "SELECT subject FROM threads WHERE account_id = $1 AND id = $2",
          [reminder.account_id, reminder.thread_id],
        ),
      );
      const subject = threads[0]?.subject ?? "";

      notifyFollowUpDue(subject, reminder.thread_id, reminder.account_id);
    }
  }

  // Refresh UI
  window.dispatchEvent(new Event("velo-sync-done"));
}

const followUpChecker = createBackgroundChecker("FollowUp", checkFollowUpReminders);
export const startFollowUpChecker = followUpChecker.start;
export const stopFollowUpChecker = followUpChecker.stop;
