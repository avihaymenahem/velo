import { GmailClient } from "./client";
import { parseGmailMessage, type ParsedMessage } from "./messageParser";
import { gmailStoreThread, type GmailAttachment } from "./tauriCommands";
import { upsertLabel } from "../db/labels";
import { setThreadLabels, deleteThread, markThreadUnreadInDb } from "../db/threads";
import { updateAccountSyncState } from "../db/accounts";
import { shouldNotifyForMessage, queueNewEmailNotification } from "../notifications/notificationManager";
import { applyFiltersToMessages } from "../filters/filterEngine";
import { getSetting } from "../db/settings";
import { getMutedThreadIds } from "../db/threads";
import { getThreadCategory } from "../db/threadCategories";
import { getVipSenders } from "../db/notificationVips";
import { getPendingOpResourceIds } from "../db/pendingOperations";
import { processThreadUrgency } from "@/services/ai/urgencyPipeline";

async function loadAutoArchiveCategories(): Promise<Set<string>> {
  const raw = await getSetting("auto_archive_categories");
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export interface SyncProgress {
  phase: "labels" | "threads" | "messages" | "done";
  current: number;
  total: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Store a fetched thread's data (messages, labels, attachments) into the local DB.
 * Optionally pass autoArchiveCategories and client to enable auto-archiving.
 */
async function processAndStoreThread(
  thread: { id: string },
  accountId: string,
  parsedMessages: ParsedMessage[],
  client?: GmailClient,
  autoArchiveCategories?: Set<string>,
): Promise<void> {
  const lastMessage = parsedMessages[parsedMessages.length - 1]!;
  const firstMessage = parsedMessages[0]!;

  const allLabelIds = new Set<string>();
  for (const msg of parsedMessages) {
    for (const lid of msg.labelIds) {
      allLabelIds.add(lid);
    }
  }

  const isRead = parsedMessages.every((m) => m.isRead) || allLabelIds.has("TRASH");
  const isStarred = parsedMessages.some((m) => m.isStarred);
  const isImportant = allLabelIds.has("IMPORTANT");
  const hasAttachments = parsedMessages.some((m) => m.hasAttachments);

  const attachments: GmailAttachment[] = parsedMessages.flatMap((msg) =>
    msg.attachments.map((att) => ({
      id: `${msg.id}_${att.gmailAttachmentId}`,
      message_id: msg.id,
      filename: att.filename,
      mime_type: att.mimeType,
      size: att.size,
      gmail_attachment_id: att.gmailAttachmentId,
      content_id: att.contentId,
      is_inline: att.isInline,
    })),
  );

  // Single IPC call: thread + labels + all messages (bodies included) + attachments
  // Written directly to SQLite via rusqlite — WebKit never holds the body data.
  await gmailStoreThread({
    accountId,
    threadId: thread.id,
    subject: firstMessage.subject,
    snippet: lastMessage.snippet,
    lastMessageAt: lastMessage.date,
    messageCount: parsedMessages.length,
    isRead,
    isStarred,
    isImportant,
    hasAttachments,
    labelIds: [...allLabelIds],
    messages: parsedMessages.map((msg) => ({
      id: msg.id,
      from_address: msg.fromAddress,
      from_name: msg.fromName,
      to_addresses: msg.toAddresses,
      cc_addresses: msg.ccAddresses,
      bcc_addresses: msg.bccAddresses,
      reply_to: msg.replyTo,
      subject: msg.subject,
      snippet: msg.snippet,
      date: msg.date,
      is_read: msg.isRead,
      is_starred: msg.isStarred,
      body_html: msg.bodyHtml,
      body_text: msg.bodyText,
      raw_size: msg.rawSize,
      internal_date: msg.internalDate,
      list_unsubscribe: msg.listUnsubscribe,
      list_unsubscribe_post: msg.listUnsubscribePost,
      auth_results: msg.authResults,
      message_id_header: null,
      references_header: null,
      in_reply_to_header: null,
    })),
    attachments,
  });

  // Fire-and-forget urgency scoring (lightweight — no body data needed)
  processThreadUrgency({
    accountId,
    threadId: thread.id,
    subject: firstMessage.subject,
    bodyText: lastMessage.bodyText,
    fromAddress: lastMessage.fromAddress,
    fromName: lastMessage.fromName,
    lastMessageAt: lastMessage.date,
    labelIds: [...allLabelIds],
  }).catch(() => {});

  // Rule-based categorization for inbox threads (lightweight — no body data)
  if (allLabelIds.has("INBOX")) {
    const { getThreadCategoryWithManual, setThreadCategory } = await import("@/services/db/threadCategories");
    const existing = await getThreadCategoryWithManual(accountId, thread.id);
    // Skip if manually categorized
    if (!existing || !existing.isManual) {
      const { categorizeByRules } = await import("@/services/categorization/ruleEngine");
      const category = categorizeByRules({
        labelIds: [...allLabelIds],
        fromAddress: lastMessage.fromAddress,
        listUnsubscribe: lastMessage.listUnsubscribe,
      });
      await setThreadCategory(accountId, thread.id, category, false);

      // Auto-archive if category matches
      if (client && autoArchiveCategories && autoArchiveCategories.has(category) && category !== "Primary") {
        try {
          await client.modifyThread(thread.id, undefined, ["INBOX"]);
          allLabelIds.delete("INBOX");
          await setThreadLabels(accountId, thread.id, [...allLabelIds]);
        } catch (err) {
          console.error(`Failed to auto-archive thread ${thread.id}:`, err);
        }
      }

      // Hold thread if delivery schedule is active for this category
      if (category !== "Primary") {
        try {
          const { getBundleRule, holdThread, getNextDeliveryTime } = await import("@/services/db/bundleRules");
          const rule = await getBundleRule(accountId, category);
          if (rule?.delivery_enabled && rule.delivery_schedule) {
            const schedule = JSON.parse(rule.delivery_schedule);
            const heldUntil = getNextDeliveryTime(schedule);
            await holdThread(accountId, thread.id, category, heldUntil);
          }
        } catch (err) {
          console.error(`Failed to check bundle rule for thread ${thread.id}:`, err);
        }
      }
    }
  }
}

/**
 * Sync all labels for an account.
 */
export async function syncLabels(
  client: GmailClient,
  accountId: string,
): Promise<void> {
  const response = await client.listLabels();
  await Promise.all(response.labels.map((label) =>
    upsertLabel({
      id: label.id,
      accountId,
      name: label.name,
      type: label.type,
      colorBg: label.color?.backgroundColor ?? null,
      colorFg: label.color?.textColor ?? null,
    }),
  ));
}

/**
 * Perform an initial full sync: fetch all threads from the last N days.
 */
export async function initialSync(
  client: GmailClient,
  accountId: string,
  daysBack = 365,
  onProgress?: SyncProgressCallback,
): Promise<void> {
  // Phase 1: Sync labels
  onProgress?.({ phase: "labels", current: 0, total: 1 });
  await syncLabels(client, accountId);
  onProgress?.({ phase: "labels", current: 1, total: 1 });

  // Phase 2: Fetch thread list
  const threadStubs: { id: string }[] = [];
  let pageToken: string | undefined;
  let query = "";

  // Only apply date filter if daysBack > 0
  if (daysBack > 0) {
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - daysBack);
    const afterStr = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;
    query = `after:${afterStr}`;
  }

  onProgress?.({ phase: "threads", current: 0, total: 0 });

  do {
    const response = await client.listThreads({
      maxResults: 100,
      pageToken,
      q: query,
    });

    if (response.threads) {
      threadStubs.push(...response.threads.map((t) => ({ id: t.id })));
    }

    pageToken = response.nextPageToken;
    onProgress?.({
      phase: "threads",
      current: threadStubs.length,
      total: threadStubs.length + (pageToken ? 100 : 0), // estimate
    });
  } while (pageToken);

  // Phase 3: Fetch and store each thread's details
  let historyId = "0";

  // Load auto-archive categories once for the whole sync
  const autoArchiveCategories = await loadAutoArchiveCategories();

  let progress = 0;
  await parallelLimit(
    threadStubs.map((stub) => async () => {
      onProgress?.({
        phase: "messages",
        current: ++progress,
        total: threadStubs.length,
      });

      try {
        const thread = await client.getThread(stub.id, "full");

        if (BigInt(thread.historyId) > BigInt(historyId)) {
          historyId = thread.historyId;
        }

        if (!thread.messages || thread.messages.length === 0) return;

        const parsedMessages = thread.messages.map(parseGmailMessage);
        await processAndStoreThread(thread, accountId, parsedMessages, client, autoArchiveCategories);
      } catch (err) {
        console.error(`Failed to sync thread ${stub.id}:`, err);
      }
    }),
    3,
  );

  // Store the latest history ID for delta sync
  await updateAccountSyncState(accountId, historyId);

  onProgress?.({
    phase: "done",
    current: threadStubs.length,
    total: threadStubs.length,
  });
}

/**
 * Delta sync: fetch only changes since last sync using history API.
 */
/**
 * Process a batch of promises with limited concurrency.
 */
async function parallelLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function next(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]!();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

/**
 * Delta sync: fetch only changes since last sync using history API.
 */
export async function deltaSync(
  client: GmailClient,
  accountId: string,
  lastHistoryId: string,
): Promise<number> {
  try {
    // Paginate through all history pages
    const affectedThreadIds = new Set<string>();
    const newInboxMessageIds = new Set<string>();
    // Threads confirmed to have unread messages by the History API itself.
    // threads.get can return stale label data shortly after delivery, so we
    // trust the history event labels as the authoritative source for UNREAD.
    const historyConfirmedUnreadThreadIds = new Set<string>();
    let latestHistoryId = lastHistoryId;
    let pageToken: string | undefined;

    do {
      const response = await client.getHistory(lastHistoryId, undefined, pageToken);
      latestHistoryId = response.historyId;

      if (response.history) {
        for (const item of response.history) {
          if (item.messagesAdded) {
            for (const added of item.messagesAdded) {
              affectedThreadIds.add(added.message.threadId);
              const labels = added.message.labelIds ?? [];
              if (labels.includes("UNREAD")) {
                historyConfirmedUnreadThreadIds.add(added.message.threadId);
              }
              if (labels.includes("INBOX") && labels.includes("UNREAD")) {
                newInboxMessageIds.add(added.message.id);
              }
            }
          }
          if (item.messagesDeleted) {
            for (const deleted of item.messagesDeleted) {
              affectedThreadIds.add(deleted.message.threadId);
            }
          }
          if (item.labelsAdded) {
            for (const labeled of item.labelsAdded) {
              affectedThreadIds.add(labeled.message.threadId);
              if (labeled.labelIds.includes("UNREAD")) {
                historyConfirmedUnreadThreadIds.add(labeled.message.threadId);
              }
            }
          }
          if (item.labelsRemoved) {
            for (const unlabeled of item.labelsRemoved) {
              affectedThreadIds.add(unlabeled.message.threadId);
              // If UNREAD was explicitly removed, it is no longer unread
              if (unlabeled.labelIds.includes("UNREAD")) {
                historyConfirmedUnreadThreadIds.delete(unlabeled.message.threadId);
              }
            }
          }
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    if (affectedThreadIds.size === 0) {
      await updateAccountSyncState(accountId, latestHistoryId);
      return 0;
    }

    // Load settings once for the whole sync cycle
    const autoArchiveCategories = await loadAutoArchiveCategories();
    const mutedThreadIds = await getMutedThreadIds(accountId);
    const smartNotifications = (await getSetting("smart_notifications")) !== "false";
    const notifyCategories = new Set(
      ((await getSetting("notify_categories")) ?? "Primary").split(",").map((s) => s.trim()).filter(Boolean),
    );
    const vipSenders = smartNotifications ? await getVipSenders(accountId) : new Set<string>();

    // One batch query for all pending ops — avoids 1 IPC call per thread inside the loop
    const pendingResourceIds = await getPendingOpResourceIds(accountId);

    // Re-fetch affected threads in parallel (max 3 concurrent to reduce WebKit IPC pressure)
    const threadIds = [...affectedThreadIds];
    await parallelLimit(
      threadIds.map((threadId) => async () => {
        try {
          if (pendingResourceIds.has(threadId)) {
            console.log(`[deltaSync] Processing thread ${threadId} despite pending local ops`);
          }

          let thread;
          try {
            thread = await client.getThread(threadId, "full");
          } catch (err) {
            // Thread not found on server (404) — remove from local DB
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("404") || message.includes("Not Found")) {
              console.log(`[deltaSync] Thread ${threadId} not found on server, removing from local DB`);
              await deleteThread(accountId, threadId);
              return;
            }
            throw err;
          }

          if (!thread.messages || thread.messages.length === 0) {
            console.log(`[deltaSync] Thread ${threadId} has no messages on server, removing from local DB`);
            await deleteThread(accountId, threadId);
            return;
          }

          const parsedMessages = thread.messages.map(parseGmailMessage);
          await processAndStoreThread(thread, accountId, parsedMessages, client, autoArchiveCategories);

          // threads.get can return stale label data immediately after delivery.
          // If the History API confirms this thread has an unread message, override
          // any stale is_read=1 that processAndStoreThread may have written.
          if (historyConfirmedUnreadThreadIds.has(threadId)) {
            await markThreadUnreadInDb(accountId, threadId);
          }

          // Auto-archive muted threads that reappear in INBOX
          if (mutedThreadIds.has(threadId)) {
            const hasInbox = parsedMessages.some((m) => m.labelIds.includes("INBOX"));
            if (hasInbox) {
              try {
                await client.modifyThread(threadId, undefined, ["INBOX"]);
                await setThreadLabels(accountId, threadId,
                  [...new Set(parsedMessages.flatMap((m) => m.labelIds))].filter((l) => l !== "INBOX"),
                );
              } catch (err) {
                console.error(`Failed to auto-archive muted thread ${threadId}:`, err);
              }
            }
          }

          // Send desktop notifications for new unread inbox messages (smart-filtered)
          // Skip notifications for muted threads
          for (const parsed of parsedMessages) {
            if (newInboxMessageIds.has(parsed.id) && !mutedThreadIds.has(threadId)) {
              const fromAddr = parsed.fromAddress ?? undefined;
              if (shouldNotifyForMessage(smartNotifications, notifyCategories, vipSenders, await getThreadCategory(accountId, threadId), fromAddr)) {
                const sender = parsed.fromName ?? parsed.fromAddress ?? "Unknown";
                queueNewEmailNotification(
                  sender,
                  parsed.subject ?? "",
                  parsed.threadId,
                  accountId,
                  fromAddr,
                );
              }
            }
          }

          // Apply filters to new inbox messages in this thread
          const newMessages = parsedMessages.filter((m) => newInboxMessageIds.has(m.id));
          if (newMessages.length > 0) {
            try {
              await applyFiltersToMessages(accountId, newMessages);
            } catch (err) {
              console.error(`Failed to apply filters to thread ${threadId}:`, err);
            }

            // Apply smart labels (fire-and-forget, non-blocking)
            import("@/services/smartLabels/smartLabelManager")
              .then(({ applySmartLabelsToMessages }) => applySmartLabelsToMessages(accountId, newMessages))
              .catch((err) => console.error("Smart label error:", err));
          }
        } catch (err) {
          console.error(`Failed to re-sync thread ${threadId}:`, err);
        }
      }),
      3,
    );

    await updateAccountSyncState(accountId, latestHistoryId);

    // Fire-and-forget AI categorization for new threads
    import("@/services/ai/categorizationManager")
      .then(({ categorizeNewThreads }) => categorizeNewThreads(accountId))
      .catch((err) => console.error("Categorization error:", err));

    return affectedThreadIds.size;
  } catch (err) {
    // historyId might be too old — need full re-sync
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("404") || message.includes("historyId")) {
      console.warn("History ID expired, triggering full re-sync");
      throw new Error("HISTORY_EXPIRED");
    }
    throw err;
  }
}
