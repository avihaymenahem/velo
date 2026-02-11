import { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { EmailList } from "./components/layout/EmailList";
import { ReadingPane } from "./components/layout/ReadingPane";
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
import { initNotifications } from "./services/notifications/notificationManager";
import {
  initGlobalShortcut,
  unregisterComposeShortcut,
} from "./services/globalShortcut";
import { initDeepLinkHandler } from "./services/deepLinkHandler";
import { updateBadgeCount } from "./services/badgeManager";
import { invoke } from "@tauri-apps/api/core";
import { SettingsPage } from "./components/settings/SettingsPage";
import { CalendarPage } from "./components/calendar/CalendarPage";
import { DndProvider } from "./components/dnd/DndProvider";
import { TitleBar } from "./components/layout/TitleBar";
import { useShortcutStore } from "./stores/shortcutStore";
import { ContextMenuPortal } from "./components/ui/ContextMenuPortal";

function ResizableEmailLayout() {
  const emailListWidth = useUIStore((s) => s.emailListWidth);
  const setEmailListWidth = useUIStore((s) => s.setEmailListWidth);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = listRef.current?.offsetWidth ?? emailListWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newWidth = Math.min(800, Math.max(240, startWidth + delta));
      // Direct DOM mutation — no React re-renders during drag
      if (listRef.current) listRef.current.style.width = `${newWidth}px`;
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Commit final width to store (persists to DB)
      const delta = ev.clientX - startX;
      const finalWidth = Math.min(800, Math.max(240, startWidth + delta));
      setEmailListWidth(finalWidth);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [emailListWidth, setEmailListWidth]);

  return (
    <div ref={containerRef} className="flex flex-1 min-w-0 flex-row">
      <EmailList width={emailListWidth} listRef={listRef} />
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize bg-border-primary hover:bg-accent/50 active:bg-accent transition-colors shrink-0"
      />
      <ReadingPane />
    </div>
  );
}

export default function App() {
  const { theme, setTheme, sidebarCollapsed, setSidebarCollapsed, setContactSidebarVisible, readingPanePosition, setReadingPanePosition, setReadFilter, setEmailListWidth, activeLabel } = useUIStore();
  const { setAccounts } = useAccountStore();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showAskInbox, setShowAskInbox] = useState(false);


  // Register global keyboard shortcuts
  useKeyboardShortcuts();

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
        setAccounts(mapped);

        // Initialize Gmail clients for existing accounts
        await initializeClients();

        // Start background sync for active accounts
        const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
        if (activeIds.length > 0) {
          startBackgroundSync(activeIds);
        }

        // Start snooze and scheduled send checkers
        startSnoozeChecker();
        startScheduledSendChecker();

        // Initialize notifications
        await initNotifications();

        // Initialize global compose shortcut
        await initGlobalShortcut();

        // Initialize deep link handler
        deepLinkCleanupRef = await initDeepLinkHandler();

        // Initial badge count
        await updateBadgeCount();
      } catch (err) {
        console.error("Failed to initialize:", err);
      }
      setInitialized(true);
      invoke("close_splashscreen").catch(() => {});
    }

    let deepLinkCleanupRef: (() => void) | undefined;
    init();

    return () => {
      stopBackgroundSync();
      stopSnoozeChecker();
      stopScheduledSendChecker();
      unregisterComposeShortcut();
      deepLinkCleanupRef?.();
    };
  }, [setAccounts, setTheme, setSidebarCollapsed, setContactSidebarVisible, setReadingPanePosition, setReadFilter, setEmailListWidth]);

  // Listen for sync status updates
  useEffect(() => {
    const unsub = onSyncStatus((_accountId, status, progress) => {
      if (status === "syncing" && progress) {
        if (progress.phase === "messages") {
          setSyncStatus(
            `Syncing: ${progress.current}/${progress.total} threads`,
          );
        } else if (progress.phase === "labels") {
          setSyncStatus("Syncing labels...");
        } else if (progress.phase === "threads") {
          setSyncStatus(`Fetching threads... (${progress.current})`);
        }
      } else if (status === "done") {
        setSyncStatus(null);
        window.dispatchEvent(new Event("velo-sync-done"));
        updateBadgeCount();
      } else if (status === "error") {
        setSyncStatus(null);
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

    // Re-initialize clients and start sync for the new account
    await initializeClients();
    const activeIds = mapped.filter((a) => a.isActive).map((a) => a.id);
    startBackgroundSync(activeIds);

    // Trigger immediate sync for the latest account
    const newest = mapped[mapped.length - 1];
    if (newest) {
      syncAccount(newest.id);
    }
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
          <Sidebar
            collapsed={sidebarCollapsed}
            onAddAccount={() => setShowAddAccount(true)}
          />
          {activeLabel === "settings" ? (
            <SettingsPage />
          ) : activeLabel === "calendar" ? (
            <CalendarPage />
          ) : readingPanePosition === "right" ? (
            <ResizableEmailLayout />
          ) : (
            <div className={`flex flex-1 min-w-0 ${readingPanePosition === "bottom" ? "flex-col" : "flex-row"}`}>
              <EmailList />
              {readingPanePosition !== "hidden" && <ReadingPane />}
            </div>
          )}
        </DndProvider>
      </div>

      {/* Sync status bar */}
      {syncStatus && (
        <div className="fixed bottom-0 left-0 right-0 bg-accent/90 glass-panel text-white text-xs px-4 py-1.5 text-center z-40">
          {syncStatus}
        </div>
      )}

      {showAddAccount && (
        <AddAccount
          onClose={() => setShowAddAccount(false)}
          onSuccess={handleAddAccountSuccess}
        />
      )}

      <Composer />
      <UndoSendToast />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />
      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
      <AskInbox
        isOpen={showAskInbox}
        onClose={() => setShowAskInbox(false)}
      />
      <ContextMenuPortal />
    </div>
  );
}
