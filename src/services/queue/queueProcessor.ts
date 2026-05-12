import { createBackgroundChecker, type BackgroundChecker } from "../backgroundCheckers";
import { useUIStore } from "@/stores/uiStore";
import {
  getPendingOperations,
  updateOperationStatus,
  deleteOperation,
  incrementRetry,
  getPendingOpsCount,
  compactQueue,
} from "../db/pendingOperations";
import { executeQueuedAction } from "../emailActions";
import { getEmailProvider } from "@/services/email/providerFactory";
import { getContactById } from "@/services/db/contacts";
import { queryWithRetry } from "@/services/db/connection";
import { interpolateVariables } from "@/utils/templateVariables";
import { classifyError } from "@/utils/networkErrors";


const BATCH_SIZE = 50;

let checker: BackgroundChecker | null = null;

async function processSendCampaignEmail(
  opId: string,
  accountId: string,
  params: Record<string, unknown>,
): Promise<void> {
  const campaignId = params.campaignId as string;
  const contactId = params.contactId as string;
  const templateId = params.templateId as string | undefined;

  if (!campaignId || !contactId) {
    throw new Error("send_campaign_email: missing campaignId or contactId");
  }

  // 1. Get contact email
  const contact = await getContactById(contactId);
  if (!contact) {
    await deleteOperation(opId);
    return;
  }

  // 2. Get template content
  let subject = "";
  let bodyHtml = "";
  if (templateId) {
    const rows = await queryWithRetry(async (db) =>
      db.select<{ subject: string | null; body_html: string }[]>(
        "SELECT subject, body_html FROM templates WHERE id = $1",
        [templateId],
      ),
    );
    const tmpl = rows[0];
    if (tmpl) {
      subject = tmpl.subject ?? "";
      bodyHtml = tmpl.body_html;
    }
  }

  // 3. Resolve template variables
  const resolvedHtml = await interpolateVariables(bodyHtml, {
    recipientEmail: contact.email,
    recipientName: contact.display_name ?? undefined,
  });
  const resolvedSubject = subject.includes("{{")
    ? await interpolateVariables(subject, {
        recipientEmail: contact.email,
        recipientName: contact.display_name ?? undefined,
      })
    : subject;

  // 4. Send via provider
  const provider = await getEmailProvider(accountId);
  const rawContent = btoa(
    `To: ${contact.email}\r\nSubject: ${resolvedSubject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${resolvedHtml}`,
  );
  const rawBase64Url = rawContent
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await provider.sendMessage(rawBase64Url);
}

async function processQueue(): Promise<void> {
  // Skip if offline
  if (!useUIStore.getState().isOnline) return;

  // Compact first to eliminate redundant ops
  await compactQueue();

  // Get pending operations
  const ops = await getPendingOperations(undefined, BATCH_SIZE);
  if (ops.length === 0) {
    await updatePendingCount();
    return;
  }

  for (const op of ops) {
    try {
      // Mark as executing
      await updateOperationStatus(op.id, "executing");

      // Parse params
      const params = JSON.parse(op.params) as Record<string, unknown>;

      if (op.operation_type === "send_campaign_email") {
        await processSendCampaignEmail(op.id, op.account_id, params);
      } else {
        await executeQueuedAction(op.account_id, op.operation_type, params);
      }

      // Success — delete from queue
      await deleteOperation(op.id);
    } catch (err) {
      const classified = classifyError(err);

      if (classified.isRetryable) {
        // Increment retry with exponential backoff
        await updateOperationStatus(op.id, "pending", classified.message);
        await incrementRetry(op.id);
      } else {
        // Permanent failure
        await updateOperationStatus(op.id, "failed", classified.message);
      }
    }
  }

  await updatePendingCount();
}

async function updatePendingCount(): Promise<void> {
  const count = await getPendingOpsCount();
  useUIStore.getState().setPendingOpsCount(count);
}

export function startQueueProcessor(): void {
  if (checker) return;
  checker = createBackgroundChecker("QueueProcessor", processQueue, 30_000);
  checker.start();
}

export function stopQueueProcessor(): void {
  checker?.stop();
  checker = null;
}

/**
 * Trigger an immediate queue flush (e.g., when coming back online).
 * Returns a promise that resolves when processing completes.
 */
export async function triggerQueueFlush(): Promise<void> {
  try {
    await processQueue();
  } catch (err) {
    console.error("[QueueProcessor] flush failed:", err);
  }
}
