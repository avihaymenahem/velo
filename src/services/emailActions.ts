import { useUIStore } from "@/stores/uiStore";
import { useThreadStore } from "@/stores/threadStore";
import { getEmailProvider } from "@/services/email/providerFactory";
import { enqueuePendingOperation } from "@/services/db/pendingOperations";
import { classifyError } from "@/utils/networkErrors";
import { getDb } from "@/services/db/connection";
import { navigateToThread, getSelectedThreadId } from "@/router/navigate";
import { getAccount } from "@/services/db/accounts";
import { deleteThread as deleteThreadFromDb } from "@/services/db/threads";
import { getMessagesForThread } from "@/services/db/messages";

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
      store.updateThread(action.threadId, { isRead: action.read });
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
        // Remove thread from local store if threadId is available
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
// Local DB updates (so offline reads reflect changes)
// ---------------------------------------------------------------------------

async function applyLocalDbUpdate(
  accountId: string,
  action: EmailAction,
): Promise<void> {
  const db = await getDb();
  switch (action.type) {
    case "markRead":
      await db.execute(
        "UPDATE threads SET is_read = $1 WHERE account_id = $2 AND id = $3",
        [action.read ? 1 : 0, accountId, action.threadId],
      );
      await db.execute(
        "UPDATE messages SET is_read = $1 WHERE account_id = $2 AND thread_id = $3",
        [action.read ? 1 : 0, accountId, action.threadId],
      );
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
        "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id IN ('INBOX', 'DRAFT')",
        [accountId, action.threadId],
      );
      await db.execute(
        "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'TRASH')",
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
          "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2 AND label_id = 'INBOX'",
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
        await db.execute(
          "INSERT OR IGNORE INTO thread_labels (account_id, thread_id, label_id) VALUES ($1, $2, 'INBOX')",
          [accountId, action.threadId],
        );
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
      case "deleteDraft":
        // Clean up local DB: remove thread and its labels/messages
        if (action.threadId) {
          await db.execute(
            "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
            [accountId, action.threadId],
          );
          await db.execute(
            "DELETE FROM messages WHERE account_id = $1 AND thread_id = $2",
            [accountId, action.threadId],
          );
          await db.execute(
            "DELETE FROM threads WHERE account_id = $1 AND id = $2",
            [accountId, action.threadId],
          );
        }
        break;
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
    case "trash":
      return provider.trash(action.threadId, action.messageIds);
    case "permanentDelete":
      return provider.permanentDelete(action.threadId, action.messageIds);
    case "markRead":
      return provider.markRead(
        action.threadId,
        action.messageIds,
        action.read,
      );
    case "star":
      return provider.star(
        action.threadId,
        action.messageIds,
        action.starred,
      );
    case "spam":
      return provider.spam(
        action.threadId,
        action.messageIds,
        action.isSpam,
      );
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

  // Notify the UI to refresh (so sent message appears in Sent folder)
  if (result.success) {
    window.dispatchEvent(new Event("velo-sync-done"));
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

export function deleteDraft(
  accountId: string,
  draftId: string,
  threadId?: string,
): Promise<ActionResult> {
  return executeEmailAction(accountId, { type: "deleteDraft", draftId, threadId });
}

/**
 * Delete a single message within a thread.
 * When permanent=true: permanently removes the message (used when already in Trash).
 * When permanent=false: moves the message to Trash.
 * If the message was the last one in the thread, the thread is also removed from UI and DB.
 */
export async function deleteSingleMessage(
  accountId: string,
  threadId: string,
  messageId: string,
  permanent: boolean = false,
): Promise<ActionResult> {
  const db = await getDb();

  // 1. Local DB: remove the message
  await db.execute(
    "DELETE FROM messages WHERE account_id = $1 AND id = $2",
    [accountId, messageId],
  );

  // 2. Check remaining messages in thread
  const remaining = await getMessagesForThread(accountId, threadId);

  // 3. Optimistic UI
  if (remaining.length === 0) {
    await db.execute(
      "DELETE FROM thread_labels WHERE account_id = $1 AND thread_id = $2",
      [accountId, threadId],
    );
    await db.execute(
      "DELETE FROM threads WHERE account_id = $1 AND id = $2",
      [accountId, threadId],
    );
    const nextId = getNextThreadId(threadId);
    useThreadStore.getState().removeThread(threadId);
    if (nextId) navigateToThread(nextId);
  } else {
    window.dispatchEvent(new CustomEvent("velo-message-deleted", { detail: { messageId, threadId } }));
  }

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
    const { deleteDraftsForThread } = await import("@/services/gmail/draftDeletion");
    const client = await getGmailClient(accountId);
    await deleteDraftsForThread(client, accountId, threadId);
  } else {
    // IMAP: delete directly from current folder (avoids UID-changing MOVE to Trash)
    await permanentDeleteThread(accountId, threadId, []);
    await deleteThreadFromDb(accountId, threadId);
  }
}
