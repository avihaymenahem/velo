import { useEffect, useState, useCallback, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./components/layout/Sidebar";
import { AddAccount } from "./components/accounts/AddAccount";
import { UndoSendToast } from "./components/composer/UndoSendToast";
import { CommandPalette } from "./components/search/CommandPalette";
import { ShortcutsHelp } from "./components/search/ShortcutsHelp";
import { AskInbox } from "./components/search/AskInbox";
import { useUIStore } from "./stores/uiStore";
import { useAccountStore } from "./stores/accountStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { runMigrations, repairMojibakeData, repairHasAttachmentsFlags } from "./services/db/migrations";
import { getAllAccounts } from "./services/db/accounts";
import { getSetting, deleteSetting } from "./services/db/settings";
import { setLocale } from "./i18n";
import {
  startBackgroundSync,
  stopBackgroundSync,
  syncAccount,
  triggerSync,
  onSyncStatus,
} from "./services/gmail/syncManager";
import { initializeClients } from "./services/gmail/tokenManager";
import {
  startIdleForAccounts,
  stopAllIdle,
} from "./services/imap/imapIdleManager";
import {
  startSnoozeChecker,
  stopSnoozeChecker,
} from "./services/snooze/snoozeManager";
import {
  startScheduledSendChecker,
  stopScheduledSendChecker,
} from "./services/snooze/scheduledSendManager";
import {
  startFollowUpChecker,
  stopFollowUpChecker,
} from "./services/followup/followupManager";
import {
  startBundleChecker,
  stopBundleChecker,
} from "./services/bundles/bundleManager";
import {
  startCalendarReminderChecker,
  stopCalendarReminderChecker,
} from "./services/calendar/calendarReminderManager";
import { initNotifications } from "./services/notifications/notificationManager";
import {
  initGlobalShortcut,
  unregisterComposeShortcut,
} from "./services/globalShortcut";
import { initDeepLinkHandler } from "./services/deepLinkHandler";
import { updateBadgeCount } from "./services/badgeManager";
import {
  startQueueProcessor,
  stopQueueProcessor,
  triggerQueueFlush,
} from "./services/queue/queueProcessor";
import {
  startPreCacheManager,
  stopPreCacheManager,
} from "./services/attachments/preCacheManager";
import {
  startUpdateChecker,
  stopUpdateChecker,
} from "./services/updateManager";
import { fetchSendAsAliases } from "./services/gmail/sendAs";
import { getGmailClient } from "./services/gmail/tokenManager";
import { invoke } from "@tauri-apps/api/core";
import { DndProvider } from "./components/dnd/DndProvider";
import { TitleBar } from "./components/layout/TitleBar";
import { useShortcutStore } from "./stores/shortcutStore";
import { useContactsStore } from "./stores/contactsStore";
import { useTaskStore } from "./stores/taskStore";
import { purgeOldDeletedTasks, purgeOldCompletedTasks } from "./services/tasks/taskManager";
import { pruneCalendarInvites } from "./services/calendarInviteManager";
import { ContextMenuPortal } from "./components/ui/ContextMenuPortal";
import { LocalFilePreview } from "./components/ui/LocalFilePreview";
import { MoveToFolderDialog } from "./components/email/MoveToFolderDialog";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import { UpdateToast } from "./components/ui/UpdateToast";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { formatSyncError } from "./utils/networkErrors";
import {
  sendEmail,
  deleteDraft as deleteDraftAction,
  deleteDraftThread,
  archiveThread,
} from "./services/emailActions";
import { upsertContact } from "./services/db/contacts";
import { useOutgoingStore } from "./stores/outgoingStore";
import { getThemeById, COLOR_THEMES } from "./constants/themes";
import type { ColorThemeId } from "./constants/themes";
import { router } from "./router";
import { getSelectedThreadId } from "./router/navigate";
import { loadSoul, startSoulWatcher } from "./services/ai/soulService";
import {
  runEmbeddingBackfill,
  stopEmbeddingBackfill,
  isEmbeddingBackfillRunning,
} from "./services/ai/embeddingBackfill";
import { runUrgencyBackfill, runExtinguishBackfill } from "./services/ai/urgencyPipeline";

/**
 * Sync bridge: subscribes to router state changes and writes the selected
 * thread ID to the threadStore so that range-select and other multi-select
 * logic can use it as an anchor.
 */
function useRouterSyncBridge() {
  useEffect(() => {
    return router.subscribe("onResolved", () => {
      const threadId = getSelectedThreadId();
      if (useThreadStore.getState().selectedThreadId !== threadId) {
        useThreadStore.getState().selectThread(threadId);
      }
    });
  }, []);
}

import { useThreadStore } from "./stores/threadStore";
import { playSound } from "./services/soundService";

export default function App() {
  const theme = useUIStore((s) => s.theme);
  const fontScale = useUIStore((s) => s.fontScale);
  const colorTheme = useUIStore((s) => s.colorTheme);
  const backgroundMode = useUIStore((s) => s.backgroundMode);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAskInbox, setShowAskInbox] = useState(false);
  const [localFilePreview, setLocalFilePreview] = useState<File | null>(null);
  const [moveToFolderState, setMoveToFolderState] = useState<{
    open: boolean;
    threadIds: string[];
  }>({ open: false, threadIds: [] });
  const deepLinkCleanupRef = useRef<(() => void) | undefined>(undefined);

  // Sync bridge: router state → Zustand stores (temporary)
  useRouterSyncBridge();

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  // Network status detection
  useEffect(() => {
    const { setOnline } = useUIStore.getState();
    setOnline(navigator.onLine);

    const handleOnline = () => {
      setOnline(true);
      triggerQueueFlush();
      const accounts = useAccountStore.getState().accounts;
      const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
      if (activeIds.length > 0) {
        triggerSync(activeIds);
        startIdleForAccounts(activeIds).catch((e) =>
          console.warn("[imapIdle] restart on online failed:", e),
        );
      }
    };
    const handleOffline = () => {
      setOnline(false);
      stopAllIdle().catch((e) =>
        console.warn("[imapIdle] stop on offline failed:", e),
      );
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Suppress default browser context menu globally (Tauri app should feel native)
  // Elements with data-native-context-menu opt out so the browser menu is available
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.("[data-native-context-menu]"))
        return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // Prevent WKWebView from navigating to dropped files (replacing the entire app UI).
  // Files dropped outside the composer are shown in a local preview modal instead.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      // The composer stops propagation when it handles files; anything reaching
      // document is a drop outside the composer.
      const file = e.dataTransfer?.files?.[0];
      if (file) setLocalFilePreview(file);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, []);


  // Listen for command palette / shortcuts help toggle events
  useEffect(() => {
    const togglePalette = () => setShowCommandPalette((p) => !p);
    const toggleHelp = () => setShowShortcutsHelp((p) => !p);
    const toggleAskInbox = () => setShowAskInbox((p) => !p);
    const handleMoveToFolder = (e: Event) => {
      const detail = (e as CustomEvent<{ threadIds: string[] }>).detail;
      setMoveToFolderState({ open: true, threadIds: detail.threadIds });
    };
    window.addEventListener("velo-toggle-command-palette", togglePalette);
    window.addEventListener("velo-toggle-shortcuts-help", toggleHelp);
    window.addEventListener("velo-toggle-ask-inbox", toggleAskInbox);
    window.addEventListener("velo-move-to-folder", handleMoveToFolder);
    return () => {
      window.removeEventListener("velo-toggle-command-palette", togglePalette);
      window.removeEventListener("velo-toggle-shortcuts-help", toggleHelp);
      window.removeEventListener("velo-toggle-ask-inbox", toggleAskInbox);
      window.removeEventListener("velo-move-to-folder", handleMoveToFolder);
    };
  }, []);

  // Composer window (separate WebviewWindow) signals that a scheduled email was saved.
  // Re-broadcast as a DOM event so Sidebar and EmailList refresh counts/list.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("velo-scheduled-saved", () => {
        window.dispatchEvent(new Event("velo-sync-done"));
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => { unlisten?.(); };
  }, []);

  // Composer window signals that a draft was saved or deleted. Re-broadcast as a DOM
  // event so the Drafts badge and folder list in the main window refresh immediately.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("velo-draft-changed", () => {
        window.dispatchEvent(new Event("velo-sync-done"));
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => { unlisten?.(); };
  }, []);

  // Composer window hands off the server-side draft delete (IMAP EXPUNGE / Gmail draft
  // delete) here because its own JS context dies when it closes. The local DB was already
  // purged by the composer, so this only touches the server, then refreshes the UI.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("velo-delete-draft", async (event) => {
        const p = event.payload as {
          accountId: string;
          draftId: string | null;
          threadId: string | null;
        };
        try {
          if (p.draftId) {
            await deleteDraftAction(p.accountId, p.draftId, p.threadId ?? undefined);
          } else if (p.threadId) {
            await deleteDraftThread(p.accountId, p.threadId);
          }
        } catch (err) {
          console.error("[App] velo-delete-draft failed:", err);
        } finally {
          window.dispatchEvent(new Event("velo-sync-done"));
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => { unlisten?.(); };
  }, []);

  // Composer window hands off SMTP to main window via this event so the composer
  // can close immediately after the UNDO period without waiting for SMTP to complete.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("velo-execute-send", async (event) => {
        const p = event.payload as {
          outgoingId: string;
          accountId: string;
          raw: string;
          threadId: string | null;
          currentDraftId: string | null;
          localDraftId: string | null;
          sendAndArchive: boolean;
          contacts: string[];
          to: string[];
          cc: string[];
          bcc: string[];
          subject: string;
          bodyHtml: string;
          inReplyToMessageId: string | null;
        };

        try {
          const sendResult = await sendEmail(p.accountId, p.raw, p.threadId ?? undefined);

          if (!sendResult.success) {
            // Permanent send failure — notify the user
            void playSound("send_error");
            import("@tauri-apps/plugin-notification").then(({ sendNotification }) => {
              sendNotification({
                title: "Send failed",
                body: sendResult.error
                  ? `Could not send email: ${sendResult.error}`
                  : "Could not send email. Please check your SMTP settings.",
              });
            }).catch(() => {});
            // Draft is already gone (tombstoned in Composer) so we can't recover it.
            // Skip the rest of the cleanup to avoid deleting unrelated data.
            return;
          }

          if (!sendResult.queued && p.threadId) {
            // Successful send — notify ThreadView to reload messages immediately.
            void playSound("send");
            window.dispatchEvent(new CustomEvent("velo-message-sent", { detail: { threadId: p.threadId } }));
          }

          if (sendResult.queued) {
            // Retryable failure — message is now in the Outgoing queue view (pending_operations).
            // Dispatch velo-sync-done so the Outgoing badge and queue view refresh immediately.
            void playSound("send_error");
            window.dispatchEvent(new Event("velo-sync-done"));
            import("@tauri-apps/plugin-notification").then(({ sendNotification }) => {
              sendNotification({
                title: "Send queued",
                body: "Could not reach the server. The email is saved in Outgoing and will be sent automatically.",
              });
            }).catch(() => {});
          }

          if (p.currentDraftId) {
            // currentDraftId = server UID-based IMAP ID (or Gmail API ID).
            // deleteDraftAction tombstones + EXPUNGEs the server draft and cleans
            // up the local stable-UUID row via is_draft=1 query on the thread.
            await deleteDraftAction(
              p.accountId,
              p.currentDraftId,
              p.threadId ?? undefined,
            ).catch(() => {});
          } else if (p.localDraftId) {
            // No server draft (sent within the 18s server debounce window):
            // only a local SQLite row exists — delete it directly.
            const { getDb } = await import("./services/db/connection");
            const db = await getDb();
            const rows = await db.select<{ thread_id: string }[]>(
              "SELECT thread_id FROM messages WHERE account_id=$1 AND id=$2",
              [p.accountId, p.localDraftId],
            );
            if (rows[0]) {
              const tid = rows[0].thread_id;
              await db.execute("DELETE FROM messages WHERE account_id=$1 AND id=$2", [p.accountId, p.localDraftId]);
              const remaining = await db.select<{ id: string }[]>(
                "SELECT id FROM messages WHERE account_id=$1 AND thread_id=$2 LIMIT 1",
                [p.accountId, tid],
              );
              if (remaining.length === 0) {
                await db.execute("DELETE FROM thread_labels WHERE account_id=$1 AND thread_id=$2", [p.accountId, tid]);
                await db.execute("DELETE FROM threads WHERE account_id=$1 AND id=$2", [p.accountId, tid]);
              } else {
                await db.execute(
                  "DELETE FROM thread_labels WHERE account_id=$1 AND thread_id=$2 AND label_id='DRAFT'",
                  [p.accountId, tid],
                );
              }
            }
          }
          // Remove the SQLite persistence key so the composer doesn't restore a stale
          // draft on the next open. The key encodes threadId (for replies) or "new".
          const persistKey = `v_draft_${p.accountId}_${p.threadId ?? "new"}`;
          await deleteSetting(persistKey).catch(() => {});
          if (p.sendAndArchive && p.threadId) {
            await archiveThread(p.accountId, p.threadId, []).catch(() => {});
          }
          for (const addr of p.contacts) {
            await upsertContact(addr, null);
          }
        } catch (err) {
          console.error("[App] velo-execute-send failed:", err);
        } finally {
          useOutgoingStore.getState().removeEmail(p.outgoingId);
        }
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, []);

  // Listen for tray "Check for Mail" button
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("tray-check-mail", () => {
        const accounts = useAccountStore.getState().accounts;
        const activeIds = accounts.filter((a) => a.isActive).map((a) => a.id);
        if (activeIds.length > 0) {
          triggerSync(activeIds);
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Initialize database, load accounts, start sync
  useEffect(() => {
    async function init() {
      try {
        try {
          await runMigrations();
        } catch (migErr) {
          console.error("Migration failed, continuing with existing schema:", migErr);
        }
        repairMojibakeData().catch((err) =>
          console.error("[App] mojibake repair failed:", err),
        );
        import("./services/db/messages").then(({ purgeGhostDrafts }) =>
          purgeGhostDrafts().catch((err) =>
            console.error("[App] purgeGhostDrafts failed:", err),
          ),
        );

        const ui = useUIStore.getState();

        // Restore persisted theme
        const savedTheme = await getSetting("theme");
        if (
          savedTheme === "light" ||
          savedTheme === "dark" ||
          savedTheme === "system"
        ) {
          ui.setTheme(savedTheme);
        }

        // Restore persisted sidebar state
        const savedSidebar = await getSetting("sidebar_collapsed");
        if (savedSidebar === "true") {
          ui.setSidebarCollapsed(true);
        }

        // Restore contact sidebar visibility
        const savedContactSidebar = await getSetting("contact_sidebar_visible");
        if (savedContactSidebar === "false") {
          ui.setContactSidebarVisible(false);
        }

        // Restore reading pane position
        const savedPanePos = await getSetting("reading_pane_position");
        if (
          savedPanePos === "right" ||
          savedPanePos === "bottom" ||
          savedPanePos === "hidden"
        ) {
          ui.setReadingPanePosition(savedPanePos);
        }

        // Restore read filter
        const savedReadFilter = await getSetting("read_filter");
        if (
          savedReadFilter === "all" ||
          savedReadFilter === "read" ||
          savedReadFilter === "unread"
        ) {
          ui.setReadFilter(savedReadFilter);
        }

        // Restore email list width
        const savedListWidth = await getSetting("email_list_width");
        if (savedListWidth) {
          const w = parseInt(savedListWidth, 10);
          if (w >= 240 && w <= 800) ui.setEmailListWidth(w);
        }

        // Restore email density
        const savedDensity = await getSetting("email_density");
        if (
          savedDensity === "compact" ||
          savedDensity === "default" ||
          savedDensity === "spacious"
        ) {
          ui.setEmailDensity(savedDensity);
        }

        // Restore default reply mode
        const savedReplyMode = await getSetting("default_reply_mode");
        if (savedReplyMode === "reply" || savedReplyMode === "replyAll") {
          ui.setDefaultReplyMode(savedReplyMode);
        }

        // Restore mark-as-read behavior
        const savedMarkRead = await getSetting("mark_as_read_behavior");
        if (
          savedMarkRead === "instant" ||
          savedMarkRead === "2s" ||
          savedMarkRead === "manual"
        ) {
          ui.setMarkAsReadBehavior(savedMarkRead);
        }

        // Restore send and archive
        const savedSendArchive = await getSetting("send_and_archive");
        if (savedSendArchive === "true") {
          ui.setSendAndArchive(true);
        }

        // Restore font scale
        const savedFontScale = await getSetting("font_size");
        if (
          savedFontScale === "small" ||
          savedFontScale === "default" ||
          savedFontScale === "large" ||
          savedFontScale === "xlarge"
        ) {
          ui.setFontScale(savedFontScale);
        }

        // Restore composer font family
        const savedComposerFont = await getSetting("composer_font_family");
        if (
          savedComposerFont === "system" ||
          savedComposerFont === "arial" ||
          savedComposerFont === "calibri" ||
          savedComposerFont === "times" ||
          savedComposerFont === "courier" ||
          savedComposerFont === "georgia" ||
          savedComposerFont === "verdana" ||
          savedComposerFont === "avenir" ||
          savedComposerFont === "inter"
        ) {
          ui.setComposerFontFamily(savedComposerFont);
        }

        // Restore composer font size
        const savedComposerSize = await getSetting("composer_font_size");
        if (
          savedComposerSize === "10px" ||
          savedComposerSize === "12px" ||
          savedComposerSize === "14px" ||
          savedComposerSize === "16px" ||
          savedComposerSize === "18px" ||
          savedComposerSize === "20px" ||
          savedComposerSize === "24px"
        ) {
          ui.setComposerFontSize(savedComposerSize);
        }

        // Restore color theme
        const savedColorTheme = await getSetting("color_theme");
        if (
          savedColorTheme &&
          COLOR_THEMES.some((t) => t.id === savedColorTheme)
        ) {
          ui.setColorTheme(savedColorTheme as ColorThemeId);
        }

        // Restore inbox view mode
        const savedViewMode = await getSetting("inbox_view_mode");
        if (savedViewMode === "unified" || savedViewMode === "split") {
          ui.setInboxViewMode(savedViewMode);
        }

        // Restore background mode preference
        const savedBgMode = await getSetting("background_mode");
        if (savedBgMode === "aurora" || savedBgMode === "spotlight" || savedBgMode === "flat") {
          ui.setBackgroundMode(savedBgMode);
        }

        // Restore UI language preference
        const savedLanguage = await getSetting("ui_language");
        if (savedLanguage) {
          setLocale(savedLanguage);
        }

        // Restore task sidebar visibility
        const savedTaskSidebar = await getSetting("task_sidebar_visible");
        if (savedTaskSidebar === "true") {
          ui.setTaskSidebarVisible(true);
        }

        // Restore sidebar nav config
        const savedNavConfig = await getSetting("sidebar_nav_config");
        if (savedNavConfig) {
          try {
            const parsed = JSON.parse(savedNavConfig);
            if (Array.isArray(parsed)) ui.restoreSidebarNavConfig(parsed);
          } catch {
            /* ignore malformed JSON */
          }
        }

        // Apply app icon style (tray only now)
        const savedAppIconStyle = (await getSetting("app_icon_style")) || "auto";
        try {
          await invoke("set_tray_icon_style", { style: savedAppIconStyle });
        } catch {
          // commands may not be available yet
        }

        // Load custom keyboard shortcuts
        await useShortcutStore.getState().loadKeyMap();

        // Load contacts display-name cache
        useContactsStore.getState().loadContacts().catch(console.error);

        const dbAccounts = await getAllAccounts();
        const mapped = dbAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
          isActive: a.is_active === 1,
          provider: a.provider,
          color: a.color ?? null,
          includeInGlobal: a.include_in_global !== 0,
          sortOrder: a.sort_order ?? 0,
          label: a.label ?? null,
        }));
        const savedAccountId = await getSetting("active_account_id");
        useAccountStore.getState().setAccounts(mapped, savedAccountId);

// Initialize Gmail clients for existing accounts
         await initializeClients();

         // Load SOUL.md for AI personality
         await loadSoul();
         startSoulWatcher().catch(console.error);

        // Fetch send-as aliases for Gmail API accounts only (IMAP and CalDAV have no OAuth tokens)
        const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
        const gmailAccountIds = mapped
          .filter((a) => a.isActive && a.provider === "gmail_api")
          .map((a) => a.id);
        for (const accountId of gmailAccountIds) {
          try {
            const client = await getGmailClient(accountId);
            await fetchSendAsAliases(client, accountId);
          } catch (err) {
            console.warn(
              `Failed to fetch send-as aliases for ${accountId}:`,
              err,
            );
          }
        }

        // Start background sync for active accounts
        if (activeIds.length > 0) {
          startBackgroundSync(activeIds);
          // Push-mode IDLE for IMAP accounts (no-op for Gmail-API accounts)
          startIdleForAccounts(activeIds).catch((e) =>
            console.warn("[imapIdle] startup failed:", e),
          );
        }

        // If the date-repair ran this startup, force an immediate re-sync of the
        // affected accounts so re-fetched messages appear without waiting 60s.
        const pendingSyncRaw = await getSetting("imap_date_repair_v1_pending_sync");
        if (pendingSyncRaw) {
          try {
            const pendingIds: string[] = JSON.parse(pendingSyncRaw);
            const toSync = pendingIds.filter((id) => activeIds.includes(id));
            if (toSync.length > 0) {
              console.log("[repair] Forcing re-sync for date-repaired accounts:", toSync);
              for (const id of toSync) syncAccount(id).catch(console.warn);
            }
          } catch { /* malformed JSON — ignore */ }
          // Clear the flag so it doesn't fire again on next startup
          const { deleteSetting } = await import("./services/db/settings");
          deleteSetting("imap_date_repair_v1_pending_sync").catch(() => {});
        }

        startSnoozeChecker();
        startScheduledSendChecker();
        startFollowUpChecker();
        startBundleChecker();
        startCalendarReminderChecker();
        startQueueProcessor();
        startPreCacheManager();

        // Initialize notifications
        await initNotifications();

        // Initialize global compose shortcut
        await initGlobalShortcut();

        // Initialize deep link handler
        deepLinkCleanupRef.current = await initDeepLinkHandler();

        // Initial badge count
        await updateBadgeCount();

        // Load initial task badge counts (active + overdue per account)
        await useTaskStore.getState().refreshTaskBadges();
        // Purge soft-deleted and completed tasks per user-configured retention settings — fire-and-forget
        purgeOldDeletedTasks();
        purgeOldCompletedTasks();
        pruneCalendarInvites();

        // Start auto-update checker
        startUpdateChecker();

        // Kick off embedding backfill (fire-and-forget; no-ops if rag_enabled != 'true')
        runEmbeddingBackfill().catch(() => {});

        // Kick off AI urgency backfill (fire-and-forget; no-ops if behavioral intelligence is off)
        runUrgencyBackfill().catch(() => {});
        // Retroactively extinguish threads already replied to before auto-extinguish was active
        runExtinguishBackfill().catch(() => {});
      } catch (err) {
        console.error("Failed to initialize:", err);
      }
      setInitialized(true);
      invoke("close_splashscreen").catch(() => {});
      repairHasAttachmentsFlags().catch((err) =>
        console.error("[repair] has_attachments flags:", err),
      );
    }

    init();

    return () => {
      stopBackgroundSync();
      stopSnoozeChecker();
      stopScheduledSendChecker();
      stopFollowUpChecker();
      stopBundleChecker();
      stopCalendarReminderChecker();
      stopQueueProcessor();
      stopPreCacheManager();
      stopUpdateChecker();
      stopEmbeddingBackfill();
      unregisterComposeShortcut();
      deepLinkCleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store setters are stable references
  }, []);

  // Listen for sync status updates
  useEffect(() => {
    const unsub = onSyncStatus((accountId, status, progress, error, storedCount, flagChangedCount) => {
      const { setAccountSyncPhase } = useUIStore.getState();
      if (status === "syncing") {
        setAccountSyncPhase(accountId, "syncing");
        if (progress) {
          if (progress.phase === "messages") {
            setSyncStatus(
              `Syncing: ${progress.current}/${progress.total} messages`,
            );
          } else if (progress.phase === "labels") {
            setSyncStatus("Syncing labels...");
          } else if (progress.phase === "threads") {
            setSyncStatus(
              `Building threads... (${progress.current}/${progress.total})`,
            );
          }
        } else {
          setSyncStatus("Syncing...");
        }
      } else if (status === "done") {
        setAccountSyncPhase(accountId, "idle");
        // Only show "Sync complete" and reload UI when something actually changed.
        // storedCount === undefined means Gmail or initial sync — always reload.
        // storedCount === 0 means idle delta sync — skip to avoid GC churn every 60s.
        if (storedCount === undefined || storedCount > 0) {
          setSyncStatus("Sync complete");
          setTimeout(() => setSyncStatus(null), 2_000);
          window.dispatchEvent(new Event("velo-sync-done"));
        } else if (flagChangedCount && flagChangedCount > 0) {
          window.dispatchEvent(new Event("velo-sync-done"));
          setSyncStatus(null);
        } else {
          setSyncStatus(null);
        }
        updateBadgeCount();

        // Resume embedding backfill only when new messages arrived
        if ((storedCount === undefined || storedCount > 0) && !isEmbeddingBackfillRunning()) {
          runEmbeddingBackfill().catch(() => {});
        }

        // Categorize any uncategorized inbox threads (new arrivals or first run).
        // Runs whenever new messages were stored so delta-sync emails are immediately
        // classified instead of staying "Primary" until the next session restart.
        if (storedCount === undefined || storedCount > 0) {
          import("./services/categorization/backfillService")
            .then(({ backfillUncategorizedThreads }) =>
              backfillUncategorizedThreads(accountId),
            )
            .catch((err) => console.error("Backfill error:", err));
        }
      } else if (status === "error") {
        setAccountSyncPhase(accountId, "error", error);
        const acct = useAccountStore
          .getState()
          .accounts.find((a) => a.id === accountId);
        const acctLabel = acct ? acct.email : accountId;
        setSyncStatus(
          error
            ? `Sync failed (${acctLabel}): ${formatSyncError(error)}`
            : `Sync failed (${acctLabel})`,
        );
        // Still dispatch sync-done so the UI refreshes with any partially stored data
        window.dispatchEvent(new Event("velo-sync-done"));
        // Auto-clear the error after 8 seconds
        setTimeout(() => setSyncStatus(null), 8_000);
      }
    });
    return unsub;
  }, []);

  // Sync theme class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = async () => {
        if (mq.matches) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      };
      apply();
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  // Sync font-scale class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      "font-scale-small",
      "font-scale-default",
      "font-scale-large",
      "font-scale-xlarge",
    );
    root.classList.add(`font-scale-${fontScale}`);
  }, [fontScale]);

  // Sync background mode classes to <html> element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("bg-aurora", "bg-spotlight");
    if (backgroundMode === "aurora") root.classList.add("bg-aurora");
    else if (backgroundMode === "spotlight") root.classList.add("bg-spotlight");
  }, [backgroundMode]);

  // Spotlight: track cursor position in CSS vars
  useEffect(() => {
    if (backgroundMode !== "spotlight") return;
    const handler = (e: MouseEvent) => {
      document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
      document.documentElement.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [backgroundMode]);

  // Apply color theme CSS custom properties to <html>
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const themeData = getThemeById(colorTheme);
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      const colors = isDark ? themeData.dark : themeData.light;
      root.style.setProperty("--color-accent", colors.accent);
      root.style.setProperty("--color-accent-hover", colors.accentHover);
      root.style.setProperty("--color-accent-light", colors.accentLight);
      root.style.setProperty("--color-accent-lower-bar", colors.accentLowerBar);
      root.style.setProperty("--color-bg-selected", colors.bgSelected);
      root.style.setProperty("--color-sidebar-active", colors.sidebarActive);
    };

    apply();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [colorTheme, theme]);

  const handleAddAccountSuccess = useCallback(async () => {
    setShowAddAccount(false);
    const dbAccounts = await getAllAccounts();
    const mapped = dbAccounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.display_name,
      avatarUrl: a.avatar_url,
      isActive: a.is_active === 1,
      provider: a.provider,
      color: a.color ?? null,
      includeInGlobal: a.include_in_global !== 0,
      sortOrder: a.sort_order ?? 0,
      label: a.label ?? null,
    }));
    useAccountStore.getState().setAccounts(mapped);

    // Re-initialize clients for the new account
    await initializeClients();

    const newest = mapped[mapped.length - 1];
    if (newest) {
      // Sync the new account immediately — before restarting the background
      // timer so it doesn't queue behind delta syncs for existing accounts.
      syncAccount(newest.id);

      // Fetch send-as aliases in the background (non-blocking, skip CalDAV-only accounts)
      if (newest.provider !== "caldav") {
        getGmailClient(newest.id)
          .then((client) => fetchSendAsAliases(client, newest.id))
          .catch((err) =>
            console.warn(
              `Failed to fetch send-as aliases for new account:`,
              err,
            ),
          );
      }
    }

    // Restart background sync for all accounts, but skip the immediate run
    // since we already triggered the new account's sync above.
    const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
    startBackgroundSync(activeIds, true);
    startIdleForAccounts(activeIds).catch((e) =>
      console.warn("[imapIdle] start after account add failed:", e),
    );
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
          </div>
          <span className="text-xs text-text-tertiary animate-pulse">
            Loading your inbox...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden text-text-primary">
      <OfflineBanner />
      <div className="animated-bg" aria-hidden="true" />
      <TitleBar />
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <DndProvider>
          <ErrorBoundary name="Sidebar">
            <Sidebar
              collapsed={sidebarCollapsed}
              onAddAccount={() => setShowAddAccount(true)}
            />
          </ErrorBoundary>
          <Outlet />
        </DndProvider>
      </div>

      {/* Sync status pill */}
      {syncStatus && (
        <div
          className={`fixed bottom-4 right-4 glass-panel text-white text-xs px-3.5 py-1.5 rounded-lg z-40 shadow-lg w-fit animate-[slideUp_200ms_ease-out,fadeIn_200ms_ease-out] ${
            syncStatus.startsWith("Sync failed")
              ? "bg-danger/90"
              : ""
          }`}
          style={syncStatus.startsWith("Sync failed") ? undefined : { backgroundColor: "color-mix(in srgb, var(--color-accent-lower-bar) 90%, transparent)" }}
        >
          {syncStatus}
        </div>
      )}

      {showAddAccount && (
        <AddAccount
          onClose={() => setShowAddAccount(false)}
          onSuccess={handleAddAccountSuccess}
        />
      )}

      <UndoSendToast />
      <UpdateToast />
      <ErrorBoundary name="CommandPalette">
        <CommandPalette
          isOpen={showCommandPalette}
          onClose={() => setShowCommandPalette(false)}
        />
      </ErrorBoundary>
      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
      <ErrorBoundary name="AskInbox">
        <AskInbox
          isOpen={showAskInbox}
          onClose={() => setShowAskInbox(false)}
        />
      </ErrorBoundary>
      <ContextMenuPortal />
      <MoveToFolderDialog
        isOpen={moveToFolderState.open}
        threadIds={moveToFolderState.threadIds}
        onClose={() => setMoveToFolderState({ open: false, threadIds: [] })}
      />
      {localFilePreview && (
        <LocalFilePreview
          file={localFilePreview}
          onClose={() => setLocalFilePreview(null)}
        />
      )}
    </div>
  );
}
