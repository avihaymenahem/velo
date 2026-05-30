import { useUIStore } from "@/stores/uiStore";
import { useThreadStore } from "@/stores/threadStore";
import { getEmailProvider } from "@/services/email/providerFactory";
import { enqueuePendingOperation } from "@/services/db/pendingOperations";
import { classifyError } from "@/utils/networkErrors";
import { getDb } from "@/services/db/connection";
import { navigateToThread, getSelectedThreadId } from "@/router/navigate";
import { getAccount } from "@/services/db/accounts";
import { deleteThread as deleteThreadFromDb, recalculateThreadStats, getThreadById } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";
import { updateBadgeCount } from "@/services/badgeManager";

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type EmailAction =
  | { type: "archive"; threadId: string; messageIds: string[] }
  | { type: "trash"; threadId: string; messageIds: string[] }
  | { type: "permanentDelete"; threadId: string; messageIds: string[] }
  | {
      type: "markRead";
      threadId: string;
      messageIds: string[];
      read: boolean;
    }
  | {
      type: "star";
      threadId: string;
      messageIds: string[];
      starred: boolean;
    }
  | {
      type: "spam";
      threadId: string;
      messageIds: string[];
      isSpam: boolean;
    }
  | {
      type: "moveToFolder";
      threadId: string;
      messageIds: string[];
      folderPath: string;
    }
  | { type: "addLabel"; threadId: string; labelId: string }
  | { type: "removeLabel"; threadId: string; labelId: string }
  | {
      type: "sendMessage";
      rawBase64Url: string;
      threadId?: string;
    }
  | {
      type: "createDraft";
      rawBase64Url: string;
      threadId?: string;
    }
  | {
      type: "updateDraft";
      draftId: string;
      rawBase64Url: string;
      threadId?: string;
    }
  | { type: "deleteDraft"; draftId: string; threadId?: string };

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ActionResult {
  success: boolean;
  queued?: boolean;
  error?: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Optimistic UI helpers
// ---------------------------------------------------------------------------

function getNextThreadId(currentId: string): string | null {
  // Only auto-advance if the removed thread is the one being viewed
  const selectedId = getSelectedThreadId();
  if (selectedId !== currentId) return null;
  const { threads } = useThreadStore.getState();
  const idx = threads.findIndex((t) => t.id === currentId);
  if (idx === -1) return null;
  // Prefer next thread, fall back to previous
  const next = threads[idx + 1];
  if (next) return next.id;
  const prev = threads[idx - 1];
  if (prev) return prev.id;
  return null;
}

function applyOptimisticUpdate(action: EmailAction): void {
  const store = useThreadStore.getState();
  switch (action.type) {
    case "archive":
    case "trash":
    case "permanentDelete":
    case "spam":
    case "moveToFolder": {
      const nextId = getNextThreadId(action.threadId);
      store.removeThread(action.threadId);
      if (nextId) {
        navigateToThread(nextId);
      }
      break;
    }
    case "markRead":
      if (action.messageIds.length > 0 && action.read) {
        const thread = store.threadMap.get(action.threadId);
        const newUnreadCount = Math.max(0, (thread?.unreadCount ?? 0) - action.messageIds.length);
        store.updateThread(action.threadId, {
          unreadCount: newUnreadCount,
          ...(newUnreadCount === 0 ? { isRead: true } : {}),
        });
      } else {
        store.updateThread(action.threadId, {
          isRead: action.read,
          ...(action.read ? { unreadCount: 0 } : {}),
        });
      }
      break;
    case "star":
      store.updateThread(action.threadId, { isStarred: action.starred });
      break;
    case "addLabel":
    case "removeLabel":
    case "sendMessage":
    case "createDraft":
    case "updateDraft":
      // No universal optimistic update for these
      break;
    case "deleteDraft":
      // Remove from the current in-memory view (e.g. Drafts list).
      // This only affects the loaded thread list — navigating to INBOX reloads from DB.
      if (action.threadId) {
        store.removeThread(action.threadId);
      }
      break;
  }
}

function revertOptimisticUpdate(action: EmailAction): void {
  const store = useThreadStore.getState();
  switch (action.type) {
    case "markRead":
      store.updateThread(action.threadId, { isRead: !action.read });
      break;
    case "star":
      store.updateThread(action.threadId, { isStarred: !action.starred });
      break;
    // For removes (archive/trash/spam/move), we can't easily restore the thread
    // to the list from here. The next sync will fix it.
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the correct INBOX/SENT labels for a thread based on from_address.
 * Used when restoring a thread from TRASH/SPAM/ARCHIVE so the result
 * matches the same logic applied during IMAP sync.
 */
async function resolveInboxSentLabels(
  accountId: string,
  threadId: string,
): Promise<{ inbox: boolean; sent: boolean }> {
  const account = await getAccount(accountId);
  if (!account) return { inbox: true, sent: false };

  const db = await getDb();
  const rows = await db.select<{ from_address: string | null; date: number }[]>(
    "SELECT from_address, date FROM messages WHERE account_id = $1 AND thread_id = $2 ORDER BY date ASC",
    [accountId, threadId],
  );
  if (rows.length === 0) return { inbox: true, sent: false };

  const lowerEmail = account.email.toLowerCase();
  const isFromMe = (addr: string | null) => !!addr && addr.toLowerCase() === lowerEmail;
  const last = rows[rows.length - 1]!;

  return {
    sent: isFromMe(last.from_address),
    inbox: rows.some((r) => !isFromMe(r.from_address)),
  };
}

// ---------------------------------------------------------------------------
// Local DB updates (so offline reads reflect changes)
// ---------------------------------------------------------------------------

async function applyLocalDbUpdate(
  accountId: string,
  action: EmailAction,
): Promise<void> {
  const db = await getDb();
  switch (action.type) {
    case "markRead":
      if (action.messageIds.length > 0) {
        const placeholders = action.messageIds.map((_, i) => `$${i + 3}`).join(",");
        await db.execute(
          `UPDATE messages SET is_read = $1 WHERE account_id = $2 AND id IN (${placeholders})`,
          [action.read ? 1 : 0, accountId, ...action.messageIds],
        );
        const remaining = await db.select<{ cnt: number }[]>(
          "SELECT COUNT(*) as cnt FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_read = 0 AND is_draft = 0 AND is_trashed = 0",
          [accountId, action.threadId],
        );
        const allRead = (remaining[0]?.cnt ?? 0) === 0;
        await db.execute(
          "UPDATE threads SET is_read = $1 WHERE account_id = $2 AND id = $3",
          [allRead ? 1 : 0, accountId, action.threadId],
        );
      } else {
        await db.execute(
          "UPDATE threads SET is_read = $1 WHERE account_id = $2 AND id = $3",
          [action.read ? 1 : 0, accountId, action.threadId],
        );
        await db.execute(
          "UPDATE messages SET is_read = $1 WHERE account_id = $2 AND thread_id = $3",
          [action.read ? 1 : 0, accountId, action.threadId],
        );
      }
      break;
    case "star":
      await db.execute(
        "UPDATE threads SET is_starred = $1 WHERE account_id = $2 AND id = $3",
        [action.starred ? 1 : 0, accountId, action.threadId],
      );
      await db.execute(
        "UPDATE messages SET is_starred = $1 WHERE account_id = $2 AND thread_id = $3",
        [action.starred ? 1 : 0, accountId, action.threadId],
      );
      if (action.starred) {
        await db.execute(
          "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'STARRED')",
          [accountId, action.threadId],
        );
      } else {
        await db.execute(
          "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'STARRED'",
          [accountId, action.threadId],
        );
      }
      break;
    case "archive":
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'INBOX'",
        [accountId, action.threadId],
      );
      break;
    case "trash":
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id IN ('INBOX', 'DRAFT', 'SPAM', 'SENT')",
        [accountId, action.threadId],
      );
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'TRASH')",
        [accountId, action.threadId],
      );
      await db.execute(
        "UPDATE threads SET is_read = 1 WHERE account_id = $1 AND id = $2",
        [accountId, action.threadId],
      );
      await db.execute(
        "UPDATE messages SET is_read = 1 WHERE account_id = $1 AND thread_id = $2",
        [accountId, action.threadId],
      );
      break;
    case "permanentDelete":
      await db.execute(
        "DELETE FROM threads WHERE account_id = $1 AND id = $2",
        [accountId, action.threadId],
      );
      break;
    case "spam":
      if (action.isSpam) {
        await db.execute(
          "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id IN ('INBOX', 'TRASH')",
          [accountId, action.threadId],
        );
        await db.execute(
          "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'SPAM')",
          [accountId, action.threadId],
        );
      } else {
        await db.execute(
          "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'SPAM'",
          [accountId, action.threadId],
        );
        const { inbox, sent } = await resolveInboxSentLabels(accountId, action.threadId);
        if (inbox) {
          await db.execute(
            "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'INBOX')",
            [accountId, action.threadId],
          );
        }
        if (sent) {
          await db.execute(
            "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'SENT')",
            [accountId, action.threadId],
          );
        }
      }
      break;
    case "addLabel":
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, $3)",
        [accountId, action.threadId, action.labelId],
      );
      break;
    case "removeLabel":
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = $3",
        [accountId, action.threadId, action.labelId],
      );
      break;
    case "deleteDraft": {
      await purgeDraftFromDb(accountId, action.draftId, action.threadId ?? null);
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Core execution
// ---------------------------------------------------------------------------

function getResourceId(action: EmailAction): string {
  if ("threadId" in action && action.threadId) return action.threadId;
  if ("draftId" in action) return action.draftId;
  return crypto.randomUUID();
}

function actionToParams(action: EmailAction): Record<string, unknown> {
  // Strip the type field — it's stored separately as operation_type
  const { type: _, ...rest } = action;
  return rest;
}

async function executeViaProvider(
  accountId: string,
  action: EmailAction,
): Promise<unknown> {
  const provider = await getEmailProvider(accountId);
  switch (action.type) {
    case "archive":
      return provider.archive(action.threadId, action.messageIds);
    case "trash": {
      await provider.trash(action.threadId, action.messageIds);
      provider.markRead(action.threadId, action.messageIds, true).catch(() => {});
      return;
    }
    case "permanentDelete":
      return provider.permanentDelete(action.threadId, action.messageIds);
    case "markRead":
      return provider.markRead(action.threadId, action.messageIds, action.read);
    case "star":
      return provider.star(action.threadId, action.messageIds, action.starred);
    case "spam":
      return provider.spam(action.threadId, action.messageIds, action.isSpam);
    case "moveToFolder":
      return provider.moveToFolder(
        action.threadId,
        action.messageIds,
        action.folderPath,
      );
    case "addLabel":
      return provider.addLabel(action.threadId, action.labelId);
    case "removeLabel":
      return provider.removeLabel(action.threadId, action.labelId);
    case "sendMessage":
      return provider.sendMessage(action.rawBase64Url, action.threadId);
    case "createDraft":
      return provider.createDraft(action.rawBase64Url, action.threadId);
    case "updateDraft":
      return provider.updateDraft(
        action.draftId,
        action.rawBase64Url,
        action.threadId,
      );
    case "deleteDraft":
      return provider.deleteDraft(action.draftId, action.threadId);
  }
}

export async function executeEmailAction(
  accountId: string,
  action: EmailAction,
): Promise<ActionResult> {
  // 1. Optimistic UI update
  applyOptimisticUpdate(action);

  // 2. Local DB update
  try {
    await applyLocalDbUpdate(accountId, action);
  } catch (err) {
    console.warn("Local DB update failed:", err);
  }

  // Immediately refresh sidebar badges from the updated DB — no need to wait for
  // the network call. velo-badges-refresh is handled without debounce in the Sidebar.
  const affectsBadges =
    action.type === "markRead" ||
    action.type === "archive" ||
    action.type === "trash" ||
    action.type === "spam" ||
    action.type === "permanentDelete" ||
    action.type === "deleteDraft";
  if (affectsBadges) {
    updateBadgeCount().catch(console.error);
    window.dispatchEvent(new Event("velo-badges-refresh"));
  }

  // 3. If offline, queue
  if (!useUIStore.getState().isOnline) {
    await enqueuePendingOperation(
      accountId,
      action.type,
      getResourceId(action),
      actionToParams(action),
    );
    return { success: true, queued: true };
  }

  // 4. Try online execution
  try {
    const data = await executeViaProvider(accountId, action);
    window.dispatchEvent(new Event("velo-sync-done"));
    return { success: true, data };
  } catch (err) {
    const classified = classifyError(err);

    if (classified.isRetryable) {
      // Queue for retry
      await enqueuePendingOperation(
        accountId,
        action.type,
        getResourceId(action),
        actionToParams(action),
      );
      return { success: true, queued: true };
    }

    // Permanent error — revert optimistic update
    revertOptimisticUpdate(action);
    console.error(`Email action ${action.type} failed permanently:`, err);
    return { success: false, error: classified.message };
  }
}

// ---------------------------------------------------------------------------
// Execute a queued operation (used by queue processor)
// ---------------------------------------------------------------------------

export async function executeQueuedAction(
  accountId: string,
  operationType: string,
  params: Record<string, unknown>,
): Promise<void> {
  const action = { type: operationType, ...params } as EmailAction;
  await executeViaProvider(accountId, action);
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export function archiveThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "archive",
    threadId,
    messageIds,
  });
}

export function trashThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "trash",
    threadId,
    messageIds,
  });
}

export function permanentDeleteThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "permanentDelete",
    threadId,
    messageIds,
  });
}

export function markThreadRead(
  accountId: string,
  threadId: string,
  messageIds: string[],
  read: boolean,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "markRead",
    threadId,
    messageIds,
    read,
  });
}

export function starThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
  starred: boolean,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "star",
    threadId,
    messageIds,
    starred,
  });
}

export function spamThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
  isSpam: boolean,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "spam",
    threadId,
    messageIds,
    isSpam,
  });
}

export function moveThread(
  accountId: string,
  threadId: string,
  messageIds: string[],
  folderPath: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "moveToFolder",
    threadId,
    messageIds,
    folderPath,
  });
}

export function addThreadLabel(
  accountId: string,
  threadId: string,
  labelId: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "addLabel",
    threadId,
    labelId,
  });
}

export function removeThreadLabel(
  accountId: string,
  threadId: string,
  labelId: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "removeLabel",
    threadId,
    labelId,
  });
}

/**
 * Extract a plain-text snippet from the reply body for urgency AI judgment.
 * Decodes base64url, finds the body after the header block, strips HTML tags.
 */
function extractReplyTextFromRaw(rawBase64Url: string): string | null {
  try {
    let base64 = rawBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const raw = new TextDecoder().decode(bytes);
    const bodyStart = raw.indexOf("\r\n\r\n");
    if (bodyStart === -1) return null;
    const body = raw.slice(bodyStart + 4);
    const text = body
      .replace(/--[^\r\n]+/g, "")
      .replace(/Content-[^\r\n]+/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    return text || null;
  } catch {
    return null;
  }
}

export async function sendEmail(
  accountId: string,
  rawBase64Url: string,
  threadId?: string,
): Promise<ActionResult> {
  const result = await executeEmailAction(accountId, {
    type: "sendMessage",
    rawBase64Url,
    threadId,
  });

  if (result.success) {
    window.dispatchEvent(new Event("velo-sync-done"));
    // Auto-extinguish urgency when a reply resolves the thread
    if (threadId) {
      const replyText = extractReplyTextFromRaw(rawBase64Url) ?? undefined;
      import("./ai/heatExtinguisher").then(({ autoExtinguishOnReply }) => {
        autoExtinguishOnReply(accountId, threadId, replyText).catch(() => {});
      });
    }
  }

  return result;
}

export function createDraft(
  accountId: string,
  rawBase64Url: string,
  threadId?: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "createDraft",
    rawBase64Url,
    threadId,
  });
}

export function updateDraft(
  accountId: string,
  draftId: string,
  rawBase64Url: string,
  threadId?: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, {
    type: "updateDraft",
    draftId,
    rawBase64Url,
    threadId,
  });
}

/**
 * Extract the accountId embedded in an IMAP draftId (format: imap-{uuid}-{folder}-{uid}).
 * Returns null for non-IMAP IDs or if the UUID segment is not recognizable.
 */
function extractImapDraftAccountId(draftId: string): string | null {
  if (!draftId.startsWith("imap-")) return null;
  const afterPrefix = draftId.slice("imap-".length);
  // UUID is exactly 36 chars: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (afterPrefix.length < 37) return null;
  const candidate = afterPrefix.slice(0, 36);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(candidate) ? candidate : null;
}

/**
 * Remove a draft from the local DB completely and idempotently. Resolves the thread
 * from any of threadId / draftId / localDraftId, deletes the explicit row(s), then
 * sweeps every remaining is_draft=1 row in the thread (covers the IMAP stable-UUID row
 * whose id matches neither the server draftId nor a Gmail API id). If no messages remain
 * the thread + its labels are removed; otherwise only the DRAFT label is dropped and the
 * thread's read state recomputed.
 *
 * Call this synchronously (awaited) before closing a composer window — it is all fast
 * SQLite, so it always finishes while the JS context is alive, unlike a fire-and-forget
 * cleanup that the closing window would interrupt.
 */
export async function purgeDraftFromDb(
  accountId: string,
  draftId: string | null,
  threadId: string | null,
  localDraftId?: string | null,
): Promise<void> {
  const db = await getDb();
  const candidateIds = [draftId, localDraftId].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );

  let tid = threadId ?? null;
  if (!tid) {
    for (const id of candidateIds) {
      const row = await db.select<{ thread_id: string }[]>(
        "SELECT thread_id FROM messages WHERE account_id = $1 AND id = $2",
        [accountId, id],
      );
      if (row[0]) {
        tid = row[0].thread_id;
        break;
      }
    }
  }

  // Delete the explicit draft message row(s) by id.
  // For IMAP the local id is the stable UUID; for Gmail the API id won't match a row
  // (the thread sweep below handles it).
  for (const id of candidateIds) {
    await db.execute(
      "DELETE FROM message_embeddings WHERE account_id = $1 AND message_id = $2",
      [accountId, id],
    );
    await db.execute(
      "DELETE FROM messages WHERE account_id = $1 AND id = $2",
      [accountId, id],
    );
  }

  if (!tid) return;

  // Sweep every remaining draft message in the thread.
  const draftMsgs = await db.select<{ id: string }[]>(
    "SELECT id FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_draft = 1",
    [accountId, tid],
  );
  for (const msg of draftMsgs) {
    await db.execute(
      "DELETE FROM message_embeddings WHERE account_id = $1 AND message_id = $2",
      [accountId, msg.id],
    );
    await db.execute(
      "DELETE FROM messages WHERE account_id = $1 AND id = $2",
      [accountId, msg.id],
    );
  }

  const remaining = await db.select<{ id: string }[]>(
    "SELECT id FROM messages WHERE account_id = $1 AND thread_id = $2 LIMIT 1",
    [accountId, tid],
  );
  if (remaining.length === 0) {
    // Thread is now empty: remove it completely (this is what clears the Drafts badge).
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
      [accountId, tid],
    );
    await db.execute(
      "DELETE FROM threads WHERE account_id = $1 AND id = $2",
      [accountId, tid],
    );
  } else {
    // Thread still has messages (e.g. reply draft on an existing thread): drop DRAFT label.
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'DRAFT'",
      [accountId, tid],
    );
    // The draft was is_read=0; recompute so a fully-read thread doesn't keep a stale
    // UNREAD label after the draft is gone.
    const unreadRemaining = await db.select<{ id: string }[]>(
      "SELECT id FROM messages WHERE account_id = $1 AND thread_id = $2 AND is_read = 0 LIMIT 1",
      [accountId, tid],
    );
    if (unreadRemaining.length === 0) {
      await db.execute(
        "UPDATE threads SET is_read = 1 WHERE account_id = $1 AND id = $2",
        [accountId, tid],
      );
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'UNREAD'",
        [accountId, tid],
      );
    }
  }
}

/**
 * Write a tombstone for an IMAP draft AND remove it from the local DB.
 * Call this BEFORE closing the composer window — both SQLite ops complete in < 50ms,
 * which is imperceptible to the user but guaranteed to finish while the JS context is alive.
 *
 * Tombstone alone prevents future re-imports, but if the draft was already imported
 * by a background sync it remains in the local messages table and keeps showing in the UI.
 * Deleting the local record here ensures immediate removal from the draft list.
 */
export async function tombstoneImapDraft(
  accountId: string,
  draftId: string,
): Promise<void> {
  if (!draftId || !draftId.startsWith("imap-")) return;
  const resolvedAccountId = extractImapDraftAccountId(draftId) ?? accountId;
  const prefix = `imap-${resolvedAccountId}-`;
  if (!draftId.startsWith(prefix)) return;
  const remainder = draftId.slice(prefix.length);
  const lastDash = remainder.lastIndexOf("-");
  if (lastDash === -1) return;
  const folder = remainder.slice(0, lastDash);
  const uid = parseInt(remainder.slice(lastDash + 1), 10);
  if (!folder || isNaN(uid)) return;

  const [{ recordDeletedImapUid }, { getDb }] = await Promise.all([
    import("@/services/db/deletedImapUids"),
    import("@/services/db/connection"),
  ]);

  // Write tombstone — prevents any future re-import of this UID
  await recordDeletedImapUid(resolvedAccountId, folder, uid).catch(() => {});

  // Delete from local DB — removes from the draft list immediately even if the
  // background sync had already imported this message before the user discarded.
  try {
    const db = await getDb();
    const rows = await db.select<{ thread_id: string }[]>(
      "SELECT thread_id FROM messages WHERE id = $1 AND account_id = $2",
      [draftId, resolvedAccountId],
    );
    if (rows.length > 0) {
      const threadId = rows[0]!.thread_id;
      await db.execute(
        "DELETE FROM message_embeddings WHERE account_id = $1 AND message_id = $2",
        [resolvedAccountId, draftId],
      );
      await db.execute(
        "DELETE FROM messages WHERE id = $1 AND account_id = $2",
        [draftId, resolvedAccountId],
      );
      const remaining = await db.select<{ c: number }[]>(
        "SELECT COUNT(*) as c FROM messages WHERE thread_id = $1 AND account_id = $2",
        [threadId, resolvedAccountId],
      );
      if ((remaining[0]?.c ?? 1) === 0) {
        await db.execute(
          "DELETE FROM thread_labels WHERE thread_id = $1 AND account_id = $2",
          [resolvedAccountId, threadId],
        );
        await db.execute(
          "DELETE FROM threads WHERE id = $1 AND account_id = $2",
          [threadId, resolvedAccountId],
        );
      }
    }
  } catch (err) {
    console.warn("[tombstoneImapDraft] Local DB cleanup failed:", err);
  }
}

export async function deleteDraft(
  accountId: string,
  draftId: string,
  threadId?: string,
): Promise<ActionResult> {
  // For IMAP drafts the draftId encodes the real accountId. If separate Tauri windows
  // caused a mismatch (openComposer called without accountId param), recover here so
  // the tombstone is always written against the correct account.
  const resolvedAccountId = extractImapDraftAccountId(draftId) ?? accountId;
  // Tombstone IMAP drafts before the provider delete so background sync cannot
  // re-import the UID between the local DB removal and the server EXPUNGE.
  if (draftId.startsWith("imap-")) {
    await tombstoneImapDraft(resolvedAccountId, draftId);
  }
  return executeEmailAction(resolvedAccountId, {
    type: "deleteDraft",
    draftId,
    threadId,
  });
}

/**
 * Delete a single message within a thread.
 * When permanent=true: hard-deletes from DB (used when message is already in Trash).
 * When permanent=false: soft-trashes — message stays in DB with is_trashed=1 so it appears
 *   immediately in the Trash view, then the server is informed asynchronously.
 * If soft-trashing removes all non-trashed messages in the thread, the thread moves to Trash view.
 * Thread metadata (message_count, last_message_at) always reflects non-trashed messages only.
 */
export async function deleteSingleMessage(
  accountId: string,
  threadId: string,
  messageId: string,
  permanent: boolean = false,
): Promise<ActionResult> {
  const db = await getDb();

  if (permanent) {
    // Hard-delete: remove from DB entirely
    await db.execute("DELETE FROM message_embeddings WHERE account_id = $1 AND message_id = $2", [accountId, messageId]);
    await db.execute("DELETE FROM messages WHERE account_id = $1 AND id = $2", [accountId, messageId]);
  } else {
    // Soft-trash: mark as trashed locally. For Gmail, clear all labels and set TRASH.
    // For IMAP, move to Trash folder path and set is_trashed=1.
    const trashLabelRow = await db.select<{ imap_folder_path: string | null }[]>(
      "SELECT imap_folder_path FROM labels WHERE account_id = $1 AND id = 'TRASH'",
      [accountId],
    );
    const trashFolderPath = trashLabelRow[0]?.imap_folder_path ?? null;

    // Check if this is a Gmail message (has gmail_label_ids) or IMAP (has imap_folder)
    const msgRow = await db.select<{ gmail_label_ids: string | null; imap_folder: string | null }[]>(
      "SELECT gmail_label_ids, imap_folder FROM messages WHERE account_id = $1 AND id = $2",
      [accountId, messageId],
    );
    const isGmail = msgRow[0]?.gmail_label_ids !== null && msgRow[0]?.gmail_label_ids !== undefined;

    if (isGmail) {
      await db.execute(
        "UPDATE messages SET gmail_label_ids = '[\"TRASH\"]', is_trashed = 1, is_read = 1 WHERE account_id = $1 AND id = $2",
        [accountId, messageId],
      );
    } else if (trashFolderPath) {
      await db.execute(
        "UPDATE messages SET imap_folder = $3, imap_uid = NULL, is_trashed = 1, is_read = 1 WHERE account_id = $1 AND id = $2",
        [accountId, messageId, trashFolderPath],
      );
    } else {
      // Fallback: just mark as trashed in-place
      await db.execute(
        "UPDATE messages SET is_trashed = 1, is_read = 1 WHERE account_id = $1 AND id = $2",
        [accountId, messageId],
      );
    }
  }

  // Check remaining non-trashed messages in thread
  const remaining = await getMessagesForThread(accountId, threadId);

  // Optimistic UI
  if (remaining.length === 0) {
    if (permanent) {
      await db.execute("DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2", [accountId, threadId]);
      await db.execute("DELETE FROM threads WHERE account_id = $1 AND id = $2", [accountId, threadId]);
    } else {
      // All messages trashed — move thread to TRASH view
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id IN ('INBOX', 'DRAFT', 'SPAM', 'SENT')",
        [accountId, threadId],
      );
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'TRASH')",
        [accountId, threadId],
      );
      await db.execute("UPDATE threads SET is_read = 1 WHERE account_id = $1 AND id = $2", [accountId, threadId]);
      useThreadStore.getState().updateThread(threadId, { isRead: true });
    }
    const nextId = getNextThreadId(threadId);
    useThreadStore.getState().removeThread(threadId);
    if (nextId) navigateToThread(nextId);
  } else {
    // Recalculate thread stats and labels reflecting the soft-trashed message
    await recalculateThreadStats(accountId, threadId);
    const updated = await getThreadById(accountId, threadId);
    if (updated) {
      useThreadStore.getState().updateThread(threadId, {
        messageCount: updated.message_count,
        unreadCount: updated.unread_count,
        lastMessageAt: updated.last_message_at ?? 0,
        isRead: updated.is_read === 1,
        snippet: updated.snippet,
        fromName: updated.from_name,
        fromAddress: updated.from_address,
      });
    }
    window.dispatchEvent(new CustomEvent("velo-message-deleted", { detail: { messageId, threadId } }));
  }

  // Refresh sidebar badges — mirrors the same logic in executeEmailAction.
  updateBadgeCount().catch(console.error);
  window.dispatchEvent(new Event("velo-badges-refresh"));

  // 4. If offline, queue
  if (!useUIStore.getState().isOnline) {
    const actionType = permanent ? "permanentDelete" : "trash";
    await enqueuePendingOperation(accountId, actionType, messageId, {
      threadId,
      messageIds: [messageId],
    });
    return { success: true, queued: true };
  }

  // 5. Execute via provider
  try {
    const provider = await getEmailProvider(accountId);
    if (permanent) {
      await provider.permanentDelete(threadId, [messageId]);
    } else {
      await provider.trash(threadId, [messageId]);
    }
    return { success: true };
  } catch (err) {
    const classified = classifyError(err);
    if (classified.isRetryable) {
      const actionType = permanent ? "permanentDelete" : "trash";
      await enqueuePendingOperation(accountId, actionType, messageId, {
        threadId,
        messageIds: [messageId],
      });
      return { success: true, queued: true };
    }
    console.error("deleteSingleMessage failed:", err);
    return { success: false, error: classified.message };
  }
}

/**
 * Trash (or permanently delete) only the most recent message in a thread.
 * If it's the last message and non-permanent, the thread is soft-trashed (labels updated to TRASH).
 * If permanent, the thread is hard-deleted from DB.
 */
export async function trashLatestMessage(
  accountId: string,
  threadId: string,
  permanent: boolean = false,
): Promise<ActionResult> {
  const msgs = await getMessagesForThread(accountId, threadId);
  if (msgs.length === 0) return { success: false, error: "No messages in thread" };
  const latest = msgs[msgs.length - 1] as (typeof msgs)[number] | undefined;
  if (!latest) return { success: false, error: "No messages in thread" };
  return deleteSingleMessage(accountId, threadId, latest.id, permanent);
}

/**
 * Delete a draft thread from the Drafts folder view.
 * Routes to the correct path based on account provider:
 * - Gmail: uses the Drafts API (drafts.delete) which properly removes the draft
 * - IMAP: permanently deletes the message directly from the Drafts folder (no MOVE to Trash)
 *
 * This is the correct entry point when the user presses # in the Drafts view.
 * Never use trashThread() for drafts — IMAP MOVE assigns new UIDs, breaking
 * subsequent permanentDelete attempts.
 */
export async function deleteDraftThread(
  accountId: string,
  threadId: string,
): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) return;

  if (account.provider === "gmail_api") {
    const { getGmailClient } = await import("@/services/gmail/tokenManager");
    const { deleteDraftsForThread } =
      await import("@/services/gmail/draftDeletion");
    const client = await getGmailClient(accountId);
    await deleteDraftsForThread(client, accountId, threadId);
  } else {
    // IMAP: read UIDs from DB BEFORE cleanup — permanentDeleteThread([], ...) would
    // call resolveGrouped after applyLocalDbUpdate already cleared the messages table,
    // returning an empty map and skipping both IMAP delete and tombstone.
    const msgs = await getMessagesForThread(accountId, threadId);
    await deleteThreadFromDb(accountId, threadId);
    const provider = await getEmailProvider(accountId);
    for (const msg of msgs) {
      if (msg.imap_uid != null && msg.imap_folder) {
        const msgId = `imap-${accountId}-${msg.imap_folder}-${msg.imap_uid}`;
        await provider.deleteDraft(msgId).catch((err) =>
          console.warn("[deleteDraftThread] IMAP delete failed:", err),
        );
      }
    }
  }
}
