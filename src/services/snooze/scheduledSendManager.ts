import {
  getPendingScheduledEmails,
  updateScheduledEmailStatus,
} from "../db/scheduledEmails";
import { getGmailClient } from "../gmail/tokenManager";
import { buildRawEmail, type EmailAttachment } from "@/utils/emailBuilder";
import { getAccount } from "../db/accounts";

let scheduledInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Check for scheduled emails that are ready to be sent.
 */
async function checkScheduledEmails(): Promise<void> {
  try {
    const pending = await getPendingScheduledEmails();

    for (const email of pending) {
      try {
        const account = await getAccount(email.account_id);
        if (!account) {
          await updateScheduledEmailStatus(email.id, "failed");
          continue;
        }

        // Mark as "sending" BEFORE attempting send to prevent duplicate sends
        await updateScheduledEmailStatus(email.id, "sending");

        const client = await getGmailClient(email.account_id);

        // Parse attachments from JSON if present
        let attachments: EmailAttachment[] | undefined;
        if (email.attachment_paths) {
          try {
            attachments = JSON.parse(email.attachment_paths) as EmailAttachment[];
          } catch {
            console.warn(`Failed to parse attachment_paths for scheduled email ${email.id}`);
          }
        }

        const raw = buildRawEmail({
          from: account.email,
          to: email.to_addresses.split(",").map((a) => a.trim()),
          cc: email.cc_addresses
            ? email.cc_addresses.split(",").map((a) => a.trim())
            : undefined,
          bcc: email.bcc_addresses
            ? email.bcc_addresses.split(",").map((a) => a.trim())
            : undefined,
          subject: email.subject ?? "",
          htmlBody: email.body_html,
          threadId: email.thread_id ?? undefined,
          attachments,
        });

        await client.sendMessage(raw, email.thread_id ?? undefined);
        await updateScheduledEmailStatus(email.id, "sent");
      } catch (err) {
        console.error(`Failed to send scheduled email ${email.id}:`, err);
        // Distinguish transient vs permanent errors
        const message = err instanceof Error ? err.message : String(err);
        const isTransient = message.includes("5") && /\b5\d{2}\b/.test(message)
          || message.toLowerCase().includes("network")
          || message.toLowerCase().includes("timeout")
          || message.toLowerCase().includes("econnrefused");
        // Revert to pending for transient errors (allows retry), mark failed for permanent
        await updateScheduledEmailStatus(email.id, isTransient ? "pending" : "failed");
      }
    }
  } catch (err) {
    console.error("Failed to check scheduled emails:", err);
  }
}

/**
 * Start the scheduled send checker (runs every 60 seconds).
 */
export function startScheduledSendChecker(): void {
  if (scheduledInterval) return;
  checkScheduledEmails(); // Initial check
  scheduledInterval = setInterval(checkScheduledEmails, 60_000);
}

/**
 * Stop the scheduled send checker.
 */
export function stopScheduledSendChecker(): void {
  if (scheduledInterval) {
    clearInterval(scheduledInterval);
    scheduledInterval = null;
  }
}
