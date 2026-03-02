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
import { navigateToLabel } from "../../router/navigate";
import { normalizeEmail } from "@/utils/emailUtils";
import i18n from "@/i18n";

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
        try {
          const { archiveThread } = await import("../emailActions");
          await archiveThread(ctx.accountId, ctx.threadId, []);
        } catch (err) {
          console.error("Failed to archive from notification:", err);
        }
      } else {
        await showAndFocusMainWindow();
        if (ctx?.threadId) {
          navigateToLabel("inbox", { threadId: ctx.threadId });
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
        body: subject || i18n.t("common:noSubject"),
        actionTypeId: "email",
      });
    } else if (pendingCount > 1) {
      sendNotification({
        title: i18n.t("notifications:velo"),
        body: i18n.t("notifications:newEmails", { count: pendingCount }),
        actionTypeId: "email",
      });
    }
    pendingCount = 0;
    notifyTimer = null;
  }, 2000);
}

/**
 * Determine if a new email should trigger a notification based on smart notification settings.
 * Pure function — no I/O, all config is passed in from the sync cycle.
 */
export function shouldNotifyForMessage(
  smartEnabled: boolean,
  allowedCategories: Set<string>,
  vipSenders: Set<string>,
  threadCategory: string | null,
  fromAddress?: string,
): boolean {
  if (!smartEnabled) return true; // Smart notifications off → notify everything
  if (fromAddress && vipSenders.has(normalizeEmail(fromAddress))) return true; // VIP always notifies
  const category = threadCategory ?? "Primary"; // uncategorized defaults to Primary
  return allowedCategories.has(category);
}

/**
 * Show a notification for a follow-up reminder that fired.
 */
export function notifyFollowUpDue(
  subject: string,
  threadId?: string,
  accountId?: string,
): void {
  if (!notificationsEnabled) return;
  const ctx = { threadId, accountId, subject };
  lastNotificationContext = ctx;
  if (threadId) recentContexts.set(threadId, ctx);
  sendNotification({
    title: i18n.t("notifications:followUpNeeded"),
    body: subject || i18n.t("common:noSubject"),
    actionTypeId: "email",
  });
}

/**
 * Show a notification for a snoozed email returning.
 */
export function notifySnoozeReturn(subject: string): void {
  if (!notificationsEnabled) return;
  sendNotification({
    title: i18n.t("notifications:snoozedReturned"),
    body: subject || i18n.t("common:noSubject"),
    actionTypeId: "default",
  });
}
