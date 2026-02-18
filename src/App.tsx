import { useEffect, useState, useCallback, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./components/layout/Sidebar";
import { AddAccount } from "./components/accounts/AddAccount";
import { Composer } from "./components/composer/Composer";
import { UndoSendToast } from "./components/composer/UndoSendToast";
import { CommandPalette } from "./components/search/CommandPalette";
import { ShortcutsHelp } from "./components/search/ShortcutsHelp";
import { AskInbox } from "./components/search/AskInbox";
import { useUIStore } from "./stores/uiStore";
import { useAccountStore } from "./stores/accountStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { runMigrations } from "./services/db/migrations";
import { getAllAccounts } from "./services/db/accounts";
import { getSetting } from "./services/db/settings";
import {
  startBackgroundSync,
  stopBackgroundSync,
  syncAccount,
  triggerSync,
  onSyncStatus,
} from "./services/gmail/syncManager";
import { initializeClients } from "./services/gmail/tokenManager";
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
import { fetchSendAsAliases } from "./services/gmail/sendAs";
import { getGmailClient } from "./services/gmail/tokenManager";
import { invoke } from "@tauri-apps/api/core";
import { DndProvider } from "./components/dnd/DndProvider";
import { TitleBar } from "./components/layout/TitleBar";
import { useShortcutStore } from "./stores/shortcutStore";
import { ContextMenuPortal } from "./components/ui/ContextMenuPortal";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { getThemeById, COLOR_THEMES } from "./constants/themes";
import type { ColorThemeId } from "./constants/themes";
import { router } from "./router";
import { getSelectedThreadId } from "./router/navigate";

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

export default function App() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed, setContactSidebarVisible, setReadingPanePosition, setReadFilter, setEmailListWidth, setEmailDensity, setDefaultReplyMode, setMarkAsReadBehavior, setSendAndArchive, fontScale, setFontScale, colorTheme, setColorTheme, setInboxViewMode } = useUIStore();
  const { setAccounts } = useAccountStore();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAskInbox, setShowAskInbox] = useState(false);
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
      if (activeIds.length > 0) triggerSync(activeIds);
    };
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Suppress default browser context menu globally (Tauri app should feel native)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // Listen for command palette / shortcuts help toggle events
  useEffect(() => {
    const togglePalette = () => setShowCommandPalette((p) => !p);
    const toggleHelp = () => setShowShortcutsHelp((p) => !p);
    const toggleAskInbox = () => setShowAskInbox((p) => !p);
    window.addEventListener("velo-toggle-command-palette", togglePalette);
    window.addEventListener("velo-toggle-shortcuts-help", toggleHelp);
    window.addEventListener("velo-toggle-ask-inbox", toggleAskInbox);
    return () => {
      window.removeEventListener("velo-toggle-command-palette", togglePalette);
      window.removeEventListener("velo-toggle-shortcuts-help", toggleHelp);
      window.removeEventListener("velo-toggle-ask-inbox", toggleAskInbox);
    };
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
      }).then((fn) => { unlisten = fn; });
    });
    return () => { unlisten?.(); };
  }, []);

  // Initialize database, load accounts, start sync
  useEffect(() => {
    async function init() {
      try {
        await runMigrations();

        // Restore persisted theme
        const savedTheme = await getSetting("theme");
        if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
          setTheme(savedTheme);
        }

        // Restore persisted sidebar state
        const savedSidebar = await getSetting("sidebar_collapsed");
        if (savedSidebar === "true") {
          setSidebarCollapsed(true);
        }

        // Restore contact sidebar visibility
        const savedContactSidebar = await getSetting("contact_sidebar_visible");
        if (savedContactSidebar === "false") {
          setContactSidebarVisible(false);
        }

        // Restore reading pane position
        const savedPanePos = await getSetting("reading_pane_position");
        if (savedPanePos === "right" || savedPanePos === "bottom" || savedPanePos === "hidden") {
          setReadingPanePosition(savedPanePos);
        }

        // Restore read filter
        const savedReadFilter = await getSetting("read_filter");
        if (savedReadFilter === "all" || savedReadFilter === "read" || savedReadFilter === "unread") {
          setReadFilter(savedReadFilter);
        }

        // Restore email list width
        const savedListWidth = await getSetting("email_list_width");
        if (savedListWidth) {
          const w = parseInt(savedListWidth, 10);
          if (w >= 240 && w <= 800) setEmailListWidth(w);
        }

        // Restore email density
        const savedDensity = await getSetting("email_density");
        if (savedDensity === "compact" || savedDensity === "default" || savedDensity === "spacious") {
          setEmailDensity(savedDensity);
        }

        // Restore default reply mode
        const savedReplyMode = await getSetting("default_reply_mode");
        if (savedReplyMode === "reply" || savedReplyMode === "replyAll") {
          setDefaultReplyMode(savedReplyMode);
        }

        // Restore mark-as-read behavior
        const savedMarkRead = await getSetting("mark_as_read_behavior");
        if (savedMarkRead === "instant" || savedMarkRead === "2s" || savedMarkRead === "manual") {
          setMarkAsReadBehavior(savedMarkRead);
        }

        // Restore send and archive
        const savedSendArchive = await getSetting("send_and_archive");
        if (savedSendArchive === "true") {
          setSendAndArchive(true);
        }

        // Restore font scale
        const savedFontScale = await getSetting("font_size");
        if (savedFontScale === "small" || savedFontScale === "default" || savedFontScale === "large" || savedFontScale === "xlarge") {
          setFontScale(savedFontScale);
        }

        // Restore color theme
        const savedColorTheme = await getSetting("color_theme");
        if (savedColorTheme && COLOR_THEMES.some((t) => t.id === savedColorTheme)) {
          setColorTheme(savedColorTheme as ColorThemeId);
        }

        // Restore inbox view mode
        const savedViewMode = await getSetting("inbox_view_mode");
        if (savedViewMode === "unified" || savedViewMode === "split") {
          setInboxViewMode(savedViewMode);
        }

        // Load custom keyboard shortcuts
        await useShortcutStore.getState().loadKeyMap();

        const dbAccounts = await getAllAccounts();
        const mapped = dbAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
          isActive: a.is_active === 1,
        }));
        const savedAccountId = await getSetting("active_account_id");
        setAccounts(mapped, savedAccountId);

        // Initialize Gmail clients for existing accounts
        await initializeClients();

        // Fetch send-as aliases for each active account
        const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
        for (const accountId of activeIds) {
          try {
            const client = await getGmailClient(accountId);
            await fetchSendAsAliases(client, accountId);
          } catch (err) {
            console.warn(`Failed to fetch send-as aliases for ${accountId}:`, err);
          }
        }

        // Start background sync for active accounts
        if (activeIds.length > 0) {
          startBackgroundSync(activeIds);
        }

        // Start snooze, scheduled send, follow-up, bundle, and queue checkers
        startSnoozeChecker();
        startScheduledSendChecker();
        startFollowUpChecker();
        startBundleChecker();
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
      } catch (err) {
        console.error("Failed to initialize:", err);
      }
      setInitialized(true);
      invoke("close_splashscreen").catch(() => {});
    }

    init();

    return () => {
      stopBackgroundSync();
      stopSnoozeChecker();
      stopScheduledSendChecker();
      stopFollowUpChecker();
      stopBundleChecker();
      stopQueueProcessor();
      stopPreCacheManager();
      unregisterComposeShortcut();
      deepLinkCleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store setters are stable references
  }, []);

  // Listen for sync status updates
  const backfillDoneRef = useRef(false);
  useEffect(() => {
    const unsub = onSyncStatus((accountId, status, progress, error) => {
      if (status === "syncing") {
        if (progress) {
          if (progress.phase === "messages") {
            setSyncStatus(
              `Syncing: ${progress.current}/${progress.total} threads`,
            );
          } else if (progress.phase === "labels") {
            setSyncStatus("Syncing labels...");
          } else if (progress.phase === "threads") {
            setSyncStatus(`Fetching threads... (${progress.current})`);
          }
        } else {
          setSyncStatus("Syncing...");
        }
      } else if (status === "done") {
        setSyncStatus(null);
        window.dispatchEvent(new Event("velo-sync-done"));
        updateBadgeCount();

        // Backfill uncategorized threads after first successful sync
        if (!backfillDoneRef.current) {
          backfillDoneRef.current = true;
          import("./services/categorization/backfillService")
            .then(({ backfillUncategorizedThreads }) => backfillUncategorizedThreads(accountId))
            .catch((err) => console.error("Backfill error:", err));
        }
      } else if (status === "error") {
        setSyncStatus(error ? `Sync failed: ${error}` : "Sync failed");
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
      const apply = () => {
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
    root.classList.remove("font-scale-small", "font-scale-default", "font-scale-large", "font-scale-xlarge");
    root.classList.add(`font-scale-${fontScale}`);
  }, [fontScale]);

  // Apply color theme CSS custom properties to <html>
  useEffect(() => {
    const root = document.documentElement;
    const props = ["--color-accent", "--color-accent-hover", "--color-accent-light", "--color-bg-selected", "--color-sidebar-active"];

    const apply = () => {
      if (colorTheme === "indigo") {
        // Default theme — remove inline overrides, let CSS handle it
        for (const p of props) root.style.removeProperty(p);
        return;
      }
      const themeData = getThemeById(colorTheme);
      const isDark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const colors = isDark ? themeData.dark : themeData.light;
      root.style.setProperty("--color-accent", colors.accent);
      root.style.setProperty("--color-accent-hover", colors.accentHover);
      root.style.setProperty("--color-accent-light", colors.accentLight);
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
    }));
    setAccounts(mapped);

    // Re-initialize clients for the new account
    await initializeClients();

    const newest = mapped[mapped.length - 1];
    if (newest) {
      // Sync the new account immediately — before restarting the background
      // timer so it doesn't queue behind delta syncs for existing accounts.
      syncAccount(newest.id);

      // Fetch send-as aliases in the background (non-blocking)
      getGmailClient(newest.id)
        .then((client) => fetchSendAsAliases(client, newest.id))
        .catch((err) => console.warn(`Failed to fetch send-as aliases for new account:`, err));
    }

    // Restart background sync for all accounts, but skip the immediate run
    // since we already triggered the new account's sync above.
    const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
    startBackgroundSync(activeIds, true);
  }, [setAccounts]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center text-text-secondary">
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden text-text-primary">
      <OfflineBanner />
      {/* Animated gradient blobs for glassmorphism effect */}
      <div className="animated-bg" aria-hidden="true">
        <div className="blob" />
        <div className="blob" />
        <div className="blob" />
        <div className="blob" />
        <div className="blob" />
      </div>
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

      {/* Sync status bar */}
      {syncStatus && (
        <div className={`fixed bottom-0 left-0 right-0 glass-panel text-white text-xs px-4 py-1.5 text-center z-40 ${syncStatus.startsWith("Sync failed") ? "bg-danger/90" : "bg-accent/90"}`}>
          {syncStatus}
        </div>
      )}

      {showAddAccount && (
        <AddAccount
          onClose={() => setShowAddAccount(false)}
          onSuccess={handleAddAccountSuccess}
        />
      )}

      <ErrorBoundary name="Composer">
        <Composer />
      </ErrorBoundary>
      <UndoSendToast />
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
    </div>
  );
}
