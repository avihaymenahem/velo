import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  registerActionTypes,
  onAction,
} from "@tauri-apps/plugin-notification";
import { getSetting } from "../db/settings";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useComposerStore } from "../../stores/composerStore";
import { useThreadStore } from "../../stores/threadStore";

let initialized = false;
let notificationsEnabled = true;

interface NotificationContext {
  threadId?: string;
  accountId?: string;
  fromAddress?: string;
  subject?: string;
}

let lastNotificationContext: NotificationContext | null = null;
const recentContexts = new Map<string, NotificationContext>();

async function showAndFocusMainWindow(): Promise<void> {
  const mainWindow = await WebviewWindow.getByLabel("main");
  if (mainWindow) {
    await mainWindow.show();
    await mainWindow.setFocus();
  }
}

/**
 * Initialize notification permissions and action types.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const setting = await getSetting("notifications_enabled");
  notificationsEnabled = setting !== "false";

  if (!notificationsEnabled) return;

  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }

  if (!granted) {
    notificationsEnabled = false;
    return;
  }

  // Register action types and handlers (not available on all platforms)
  try {
    await registerActionTypes([
      {
        id: "default",
        actions: [],
      },
      {
        id: "email",
        actions: [
          { id: "reply", title: "Reply" },
          { id: "archive", title: "Archive" },
        ],
      },
    ]);

    await onAction(async (event) => {
      const actionId = event.actionTypeId;
      const ctx = lastNotificationContext;

      if (actionId === "reply" && ctx?.threadId && ctx?.accountId) {
        await showAndFocusMainWindow();
        useComposerStore.getState().openComposer({
          mode: "reply",
          to: ctx.fromAddress ? [ctx.fromAddress] : [],
          subject: ctx.subject ? `Re: ${ctx.subject}` : "",
          threadId: ctx.threadId,
        });
      } else if (actionId === "archive" && ctx?.threadId && ctx?.accountId) {
        const threadStore = useThreadStore.getState();
        threadStore.removeThread(ctx.threadId);
        const { getGmailClient } = await import("../gmail/tokenManager");
        const client = await getGmailClient(ctx.accountId);
        if (client) {
          try {
            await client.modifyThread(ctx.threadId, [], ["INBOX"]);
          } catch (err) {
            console.error("Failed to archive from notification:", err);
          }
        }
      } else {
        await showAndFocusMainWindow();
        if (ctx?.threadId) {
          useThreadStore.getState().selectThread(ctx.threadId);
        }
      }
    });
  } catch {
    // registerActionTypes/onAction not available on this platform (e.g. Windows)
  }
}

/**
 * Show a notification for new emails.
 * Batches notifications to avoid spam during sync.
 */
let pendingCount = 0;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

export function queueNewEmailNotification(
  from: string,
  subject: string,
  threadId?: string,
  accountId?: string,
  fromAddress?: string,
): void {
  if (!notificationsEnabled) return;

  pendingCount++;

  // Store context for action handling
  const ctx = { threadId, accountId, fromAddress, subject };
  lastNotificationContext = ctx;
  if (threadId) recentContexts.set(threadId, ctx);

  // Debounce: wait 2s before showing, to batch during sync
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    if (pendingCount === 1) {
      sendNotification({
        title: from,
        body: subject || "(No subject)",
        actionTypeId: "email",
      });
    } else if (pendingCount > 1) {
      sendNotification({
        title: "Velo",
        body: `${pendingCount} new emails`,
        actionTypeId: "email",
      });
    }
    pendingCount = 0;
    notifyTimer = null;
  }, 2000);
}

/**
 * Show a notification for a snoozed email returning.
 */
export function notifySnoozeReturn(subject: string): void {
  if (!notificationsEnabled) return;
  sendNotification({
    title: "Snoozed email returned",
    body: subject || "(No subject)",
    actionTypeId: "default",
  });
}
