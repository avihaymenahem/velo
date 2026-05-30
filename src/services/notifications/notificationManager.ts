import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  registerActionTypes,
  onAction,
} from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getSetting } from "../db/settings";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useComposerStore } from "../../stores/composerStore";
import { navigateToLabel } from "../../router/navigate";
import { normalizeEmail } from "@/utils/emailUtils";
import { playSound } from "../soundService";

let initialized = false;
let notificationsEnabled = true;
// Tracks whether custom action types (Reply/Archive buttons) were successfully
// registered. On macOS, action buttons require "Alert" notification style; if
// registerActionTypes fails or the style isn't Alerts, fall back to "default"
// so the banner actually appears on the desktop instead of going to NC silently.
let actionTypesRegistered = false;

interface NotificationContext {
  threadId?: string;
  accountId?: string;
  fromAddress?: string;
  subject?: string;
  meetingUrl?: string;
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

  // Register action types and handlers (not available on all platforms).
  // On macOS, action buttons (Reply/Archive) only appear with "Alerts" notification
  // style. If registration succeeds we use actionTypeId "email"; otherwise we fall
  // back to "default" so the notification still shows as a banner.
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
      {
        id: "calendar",
        actions: [
          { id: "join", title: "Join" },
        ],
      },
      {
        id: "calendar-no-join",
        actions: [],
      },
    ]);
    actionTypesRegistered = true;

    await onAction(async (event) => {
      const actionId = event.actionTypeId;
      const ctx = lastNotificationContext;

      if (actionId === "join" && ctx?.meetingUrl) {
        openUrl(ctx.meetingUrl).catch((err) =>
          console.error("Failed to open meeting URL:", err),
        );
      } else if (actionId === "reply" && ctx?.threadId && ctx?.accountId) {
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
  snippet?: string,
): void {
  if (!notificationsEnabled) return;

  pendingCount++;

  // Store context for action handling
  const ctx = { threadId, accountId, fromAddress, subject };
  lastNotificationContext = ctx;
  if (threadId) recentContexts.set(threadId, ctx);

  // Play sound immediately (once per batch, debounced with the notification)
  if (!notifyTimer) void playSound("receive");

  // Debounce: wait 2s before showing, to batch during sync
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    const emailActionTypeId = actionTypesRegistered ? "email" : "default";
    if (pendingCount === 1) {
      // Title = sender name (shown bold on macOS, appears first); body = subject + snippet
      const bodyParts: string[] = [subject || "(No subject)"];
      if (snippet) {
        const preview = snippet.trim().slice(0, 200);
        bodyParts.push(preview);
      }
      sendNotification({
        title: from,
        body: bodyParts.join("\n"),
        actionTypeId: emailActionTypeId,
      });
    } else if (pendingCount > 1) {
      sendNotification({
        title: "Melo",
        body: `${pendingCount} new emails`,
        actionTypeId: emailActionTypeId,
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
    title: "Follow up needed",
    body: subject || "(No subject)",
    actionTypeId: "email",
  });
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

/**
 * Show a notification for an upcoming calendar event (5 minutes before start).
 * If a meeting URL is present, shows a "Join" action button.
 */
export function notifyUpcomingCalendarEvent(
  summary: string,
  meetingUrl: string | null,
): void {
  if (!notificationsEnabled) return;
  const ctx: NotificationContext = { subject: summary, meetingUrl: meetingUrl ?? undefined };
  lastNotificationContext = ctx;
  sendNotification({
    title: summary || "Upcoming event",
    body: meetingUrl ? "Starting in 5 minutes — tap Join to connect." : "Starting in 5 minutes.",
    actionTypeId: meetingUrl ? "calendar" : "calendar-no-join",
  });
}
