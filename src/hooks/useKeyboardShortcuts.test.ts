import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies needed for the hook to mount and dispatch events.
// The hook reads store state and calls navigate/emailActions — only mock
// what's needed for the three event-dispatch tests below.
vi.mock("@/stores/uiStore", () => ({
  useUIStore: { getState: () => ({ inboxViewMode: "unified", toggleSidebar: vi.fn() }) },
}));
const mockThreadState = vi.hoisted(() => ({
  threads: [] as Array<{ id: string; isRead: boolean }>,
  selectedThreadIds: new Set<string>(),
}));
const mockAccountState = vi.hoisted(() => ({ activeAccountId: null as string | null }));
vi.mock("@/stores/threadStore", () => ({
  useThreadStore: {
    getState: () => ({
      threads: mockThreadState.threads,
      selectedThreadIds: mockThreadState.selectedThreadIds,
      removeThread: vi.fn(),
      removeThreads: vi.fn(),
      updateThread: vi.fn(),
      clearMultiSelect: vi.fn(),
      selectAll: vi.fn(),
      selectAllFromHere: vi.fn(),
    }),
  },
}));
vi.mock("@/stores/composerStore", () => ({
  useComposerStore: { getState: () => ({ isOpen: false, openComposer: vi.fn(), closeComposer: vi.fn() }) },
}));
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: { getState: () => ({ activeAccountId: mockAccountState.activeAccountId }) },
}));
vi.mock("@/stores/shortcutStore", () => ({
  useShortcutStore: {
    getState: () => ({
      keyMap: {
        "app.askInbox": "i",
        "app.commandPalette": "/",
        "app.toggleSidebar": "Ctrl+Shift+E",
        "app.help": "?",
        "action.toggleRead": "n",
      },
    }),
  },
}));
vi.mock("@/stores/contextMenuStore", () => ({
  useContextMenuStore: { getState: () => ({ menuType: null, closeMenu: vi.fn() }) },
}));
vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
  navigateToThread: vi.fn(),
  navigateBack: vi.fn(),
  getActiveLabel: () => "inbox",
  getSelectedThreadId: () => null,
}));
vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(),
  trashThread: vi.fn(),
  permanentDeleteThread: vi.fn(),
  starThread: vi.fn(),
  spamThread: vi.fn(),
  markThreadRead: vi.fn(),
}));
vi.mock("@/services/db/threads", () => ({
  deleteThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn(),
  muteThread: vi.fn(),
  unmuteThread: vi.fn(),
}));
vi.mock("@/services/gmail/draftDeletion", () => ({ deleteDraftsForThread: vi.fn() }));
vi.mock("@/services/gmail/tokenManager", () => ({ getGmailClient: vi.fn() }));
vi.mock("@/services/db/messages", () => ({ getMessagesForThread: vi.fn() }));
vi.mock("@/components/email/MessageItem", () => ({ parseUnsubscribeUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("@/services/gmail/syncManager", () => ({ triggerSync: vi.fn() }));

import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { markThreadRead } from "@/services/emailActions";

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThreadState.threads = [];
    mockThreadState.selectedThreadIds = new Set();
    mockAccountState.activeAccountId = null;
  });

  it("dispatches velo-toggle-ask-inbox when 'i' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("velo-toggle-ask-inbox", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "i", bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("velo-toggle-ask-inbox", listener);
  });

  it("dispatches velo-toggle-command-palette when '/' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("velo-toggle-command-palette", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("velo-toggle-command-palette", listener);
  });

  it("dispatches velo-toggle-shortcuts-help when '?' is pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    const listener = vi.fn();
    window.addEventListener("velo-toggle-shortcuts-help", listener);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }),
    );

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("velo-toggle-shortcuts-help", listener);
  });

  describe("action.toggleRead (n)", () => {
    const pressToggleReadKey = () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "n", bubbles: true }),
      );
    };

    it("marks all selected threads read when any is unread", () => {
      mockAccountState.activeAccountId = "acc1";
      mockThreadState.threads = [
        { id: "t1", isRead: true },
        { id: "t2", isRead: false },
        { id: "t3", isRead: false },
      ];
      mockThreadState.selectedThreadIds = new Set(["t1", "t2", "t3"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      // Only threads whose state differs are updated (t1 is already read)
      expect(markThreadRead).toHaveBeenCalledTimes(2);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t2", [], true);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t3", [], true);
    });

    it("marks all selected threads unread when all are read", () => {
      mockAccountState.activeAccountId = "acc1";
      mockThreadState.threads = [
        { id: "t1", isRead: true },
        { id: "t2", isRead: true },
      ];
      mockThreadState.selectedThreadIds = new Set(["t1", "t2"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).toHaveBeenCalledTimes(2);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t1", [], false);
      expect(markThreadRead).toHaveBeenCalledWith("acc1", "t2", [], false);
    });

    it("does nothing with no selection and no open thread", () => {
      mockAccountState.activeAccountId = "acc1";
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).not.toHaveBeenCalled();
    });

    it("does nothing without an active account", () => {
      mockThreadState.threads = [{ id: "t1", isRead: false }];
      mockThreadState.selectedThreadIds = new Set(["t1"]);
      renderHook(() => useKeyboardShortcuts());

      pressToggleReadKey();

      expect(markThreadRead).not.toHaveBeenCalled();
    });
  });
});
