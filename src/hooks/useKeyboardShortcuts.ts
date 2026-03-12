import { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/uiStore";
import { useThreadStore, threadKey, parseThreadKey } from "@/stores/threadStore";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore, ALL_ACCOUNTS_ID, getAllAccountIds } from "@/stores/accountStore";
import { useShortcutStore } from "@/stores/shortcutStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { navigateToLabel, navigateToThread, navigateBack, getActiveLabel, getSelectedThreadId } from "@/router/navigate";
import { archiveThread, trashThread, permanentDeleteThread, starThread, spamThread } from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb, muteThread as muteThreadDb, unmuteThread as unmuteThreadDb } from "@/services/db/threads";
import { deleteDraftsForThread } from "@/services/gmail/draftDeletion";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { getMessagesForThread } from "@/services/db/messages";
import { parseUnsubscribeUrl } from "@/components/email/MessageItem";
import { openUrl } from "@tauri-apps/plugin-opener";
import { triggerSync } from "@/services/gmail/syncManager";

/**
 * Parse a key binding string and check if it matches a keyboard event.
 * Supports formats like: "j", "#", "Ctrl+K", "Ctrl+Shift+E", "Ctrl+Enter"
 */
function matchesKey(binding: string, e: KeyboardEvent): boolean {
  const parts = binding.split("+");
  const key = parts[parts.length - 1]!;
  const needsCtrl = parts.some((p) => p === "Ctrl" || p === "Cmd");
  const needsShift = parts.some((p) => p === "Shift");
  const needsAlt = parts.some((p) => p === "Alt");

  const ctrlMatch = needsCtrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
  const shiftMatch = needsShift ? e.shiftKey : !e.shiftKey;
  const altMatch = needsAlt ? e.altKey : !e.altKey;

  // For single character keys, compare case-insensitively
  const keyMatch = key.length === 1
    ? e.key === key || e.key === key.toLowerCase() || e.key === key.toUpperCase()
    : e.key === key;

  return ctrlMatch && shiftMatch && altMatch && keyMatch;
}

/**
 * Build a reverse map: key binding -> action ID.
 * For "g then X" sequences, stores as "g then X" literally.
 */
function buildReverseMap(keyMap: Record<string, string>): {
  singleKey: Map<string, string>;
  twoKeySequences: Map<string, string>; // second key -> action ID (first key is always "g")
  ctrlCombos: Map<string, string>;
} {
  const singleKey = new Map<string, string>();
  const twoKeySequences = new Map<string, string>();
  const ctrlCombos = new Map<string, string>();

  for (const [id, keys] of Object.entries(keyMap)) {
    if (keys.includes(" then ")) {
      // Two-key sequence like "g then i"
      const secondKey = keys.split(" then ")[1]!.trim();
      twoKeySequences.set(secondKey, id);
    } else if (keys.includes("+") && (keys.includes("Ctrl") || keys.includes("Cmd"))) {
      ctrlCombos.set(id, keys);
    } else {
      singleKey.set(keys, id);
    }
  }

  return { singleKey, twoKeySequences, ctrlCombos };
}

// Cached reverse map to avoid rebuilding on every keypress
let cachedKeyMap: Record<string, string> | null = null;
let cachedReverseMap: ReturnType<typeof buildReverseMap> | null = null;

function getCachedReverseMap(keyMap: Record<string, string>): ReturnType<typeof buildReverseMap> {
  if (cachedKeyMap === keyMap && cachedReverseMap) return cachedReverseMap;
  cachedKeyMap = keyMap;
  cachedReverseMap = buildReverseMap(keyMap);
  return cachedReverseMap;
}

/** Resolve the accountId for the currently selected thread */
function getSelectedThreadAccountId(): string | null {
  const selectedKey = getSelectedThreadId();
  if (!selectedKey) return null;
  const thread = useThreadStore.getState().threadMap.get(selectedKey);
  if (thread) return thread.accountId;
  // Fallback to activeAccountId if thread not in map
  return useAccountStore.getState().activeAccountId;
}

/** Resolve accountId for a given composite key */
function getAccountIdForKey(key: string): string {
  const thread = useThreadStore.getState().threadMap.get(key);
  if (thread) return thread.accountId;
  return parseThreadKey(key).accountId;
}

/**
 * Global keyboard shortcuts handler (Superhuman-inspired).
 * Uses customizable key bindings from the shortcut store.
 */
export function useKeyboardShortcuts() {
  const pendingKeyRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Close context menu on Escape before any other handling
      if (e.key === "Escape" && useContextMenuStore.getState().menuType) {
        e.preventDefault();
        useContextMenuStore.getState().closeMenu();
        return;
      }

      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      const keyMap = useShortcutStore.getState().keyMap;
      const { singleKey, twoKeySequences, ctrlCombos } = getCachedReverseMap(keyMap);

      // Ctrl/Cmd shortcuts work everywhere
      if (e.ctrlKey || e.metaKey) {
        for (const [actionId, binding] of ctrlCombos) {
          if (matchesKey(binding, e)) {
            e.preventDefault();
            executeAction(actionId);
            return;
          }
        }
        // Ctrl+K for command palette (also check binding)
        if (e.key === "k" && !e.shiftKey) {
          const paletteBinding = keyMap["app.commandPalette"];
          if (paletteBinding === "Ctrl+K" || paletteBinding === "/" || !paletteBinding) {
            e.preventDefault();
            window.dispatchEvent(new Event("velo-toggle-command-palette"));
            return;
          }
        }
        if (e.key === "Enter") {
          // Send email shortcut handled by composer
          return;
        }
        return;
      }

      // F5 sync works even when input is focused
      if (e.key === "F5") {
        e.preventDefault();
        const syncActionId = singleKey.get("F5");
        if (syncActionId) {
          await executeAction(syncActionId);
        }
        return;
      }

      // Don't process single-key shortcuts when typing in inputs
      if (isInputFocused) return;

      const key = e.key;

      // Handle two-key sequences (pending "g" key)
      if (pendingKeyRef.current === "g") {
        pendingKeyRef.current = null;
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        const actionId = twoKeySequences.get(key);
        if (actionId) {
          e.preventDefault();
          executeAction(actionId);
          return;
        }
      }

      // Check if "g" starts a two-key sequence
      if (key === "g" && twoKeySequences.size > 0) {
        pendingKeyRef.current = "g";
        pendingTimerRef.current = setTimeout(() => {
          pendingKeyRef.current = null;
        }, 1000);
        return;
      }

      // Arrow keys navigate the thread list when no thread is open full-screen
      // (In split-pane mode or list-only view, arrows move between threads)
      if (key === "ArrowDown" || key === "ArrowUp") {
        const selectedId = getSelectedThreadId();
        const paneOff = useUIStore.getState().readingPanePosition === "hidden";
        // Only handle here if no thread is open in full-screen mode
        // (when pane is off and a thread is selected, ThreadView handles arrows for message nav)
        if (!(paneOff && selectedId)) {
          e.preventDefault();
          await executeAction(key === "ArrowDown" ? "nav.next" : "nav.prev");
          return;
        }
      }

      // Single key shortcuts
      let actionId = singleKey.get(key);
      // Delete and Backspace always trigger delete action
      if (!actionId && (key === "Delete" || key === "Backspace")) {
        actionId = "action.delete";
      }
      if (actionId) {
        e.preventDefault();
        await executeAction(actionId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

async function executeAction(actionId: string): Promise<void> {
  const threads = useThreadStore.getState().threads;
  const selectedKey = getSelectedThreadId();
  const currentIdx = threads.findIndex((t) => threadKey(t) === selectedKey);

  switch (actionId) {
    case "nav.next": {
      const nextIdx = Math.min(currentIdx + 1, threads.length - 1);
      if (threads[nextIdx]) {
        navigateToThread(threadKey(threads[nextIdx]));
      }
      break;
    }
    case "nav.prev": {
      const prevIdx = Math.max(currentIdx - 1, 0);
      if (threads[prevIdx]) {
        navigateToThread(threadKey(threads[prevIdx]));
      }
      break;
    }
    case "nav.open": {
      if (!selectedKey && threads[0]) {
        navigateToThread(threadKey(threads[0]));
      }
      break;
    }
    case "nav.goInbox":
      navigateToLabel("inbox");
      break;
    case "nav.goStarred":
      navigateToLabel("starred");
      break;
    case "nav.goSent":
      navigateToLabel("sent");
      break;
    case "nav.goDrafts":
      navigateToLabel("drafts");
      break;
    case "nav.goPrimary":
      if (useUIStore.getState().inboxViewMode === "split") {
        navigateToLabel("inbox", { category: "Primary" });
      }
      break;
    case "nav.goUpdates":
      if (useUIStore.getState().inboxViewMode === "split") {
        navigateToLabel("inbox", { category: "Updates" });
      }
      break;
    case "nav.goPromotions":
      if (useUIStore.getState().inboxViewMode === "split") {
        navigateToLabel("inbox", { category: "Promotions" });
      }
      break;
    case "nav.goSocial":
      if (useUIStore.getState().inboxViewMode === "split") {
        navigateToLabel("inbox", { category: "Social" });
      }
      break;
    case "nav.goNewsletters":
      if (useUIStore.getState().inboxViewMode === "split") {
        navigateToLabel("inbox", { category: "Newsletters" });
      }
      break;
    case "nav.goTasks":
      navigateToLabel("tasks");
      break;
    case "nav.goAttachments":
      navigateToLabel("attachments");
      break;
    case "nav.escape": {
      if (useComposerStore.getState().isOpen) {
        useComposerStore.getState().closeComposer();
      } else if (useThreadStore.getState().selectedThreadIds.size > 0) {
        useThreadStore.getState().clearMultiSelect();
      } else if (selectedKey) {
        navigateBack();
      }
      break;
    }
    case "action.compose":
      useComposerStore.getState().openComposer();
      break;
    case "action.reply": {
      if (selectedKey) {
        const replyMode = useUIStore.getState().defaultReplyMode;
        window.dispatchEvent(new CustomEvent("velo-inline-reply", { detail: { mode: replyMode } }));
      }
      break;
    }
    case "action.replyAll":
      if (selectedKey) {
        window.dispatchEvent(new CustomEvent("velo-inline-reply", { detail: { mode: "replyAll" } }));
      }
      break;
    case "action.forward":
      if (selectedKey) {
        window.dispatchEvent(new CustomEvent("velo-inline-reply", { detail: { mode: "forward" } }));
      }
      break;
    case "action.archive": {
      const multiKeys = useThreadStore.getState().selectedThreadIds;
      if (multiKeys.size > 0) {
        const keys = [...multiKeys];
        for (const key of keys) {
          const acctId = getAccountIdForKey(key);
          const { threadId } = parseThreadKey(key);
          await archiveThread(acctId, threadId, []);
        }
      } else if (selectedKey) {
        const acctId = getSelectedThreadAccountId();
        if (acctId) {
          const { threadId } = parseThreadKey(selectedKey);
          await archiveThread(acctId, threadId, []);
        }
      }
      break;
    }
    case "action.delete": {
      const deleteLabelCtx = getActiveLabel();
      const isTrashView = deleteLabelCtx === "trash";
      const isDraftsView = deleteLabelCtx === "drafts";
      const multiDeleteKeys = useThreadStore.getState().selectedThreadIds;
      if (multiDeleteKeys.size > 0) {
        const keys = [...multiDeleteKeys];
        for (const key of keys) {
          const acctId = getAccountIdForKey(key);
          const { threadId } = parseThreadKey(key);
          if (isTrashView) {
            await permanentDeleteThread(acctId, threadId, []);
            await deleteThreadFromDb(acctId, threadId);
          } else if (isDraftsView) {
            try {
              const client = await getGmailClient(acctId);
              await deleteDraftsForThread(client, acctId, threadId);
              useThreadStore.getState().removeThread(key);
            } catch (err) {
              console.error("Draft delete failed:", err);
            }
          } else {
            await trashThread(acctId, threadId, []);
          }
        }
      } else if (selectedKey) {
        const acctId = getSelectedThreadAccountId();
        if (acctId) {
          const { threadId } = parseThreadKey(selectedKey);
          if (isTrashView) {
            await permanentDeleteThread(acctId, threadId, []);
            await deleteThreadFromDb(acctId, threadId);
          } else if (isDraftsView) {
            try {
              const client = await getGmailClient(acctId);
              await deleteDraftsForThread(client, acctId, threadId);
              useThreadStore.getState().removeThread(selectedKey);
            } catch (err) {
              console.error("Draft delete failed:", err);
            }
          } else {
            await trashThread(acctId, threadId, []);
          }
        }
      }
      break;
    }
    case "action.star": {
      if (selectedKey) {
        const thread = threads.find((t) => threadKey(t) === selectedKey);
        if (thread) {
          await starThread(thread.accountId, thread.id, [], !thread.isStarred);
        }
      }
      break;
    }
    case "action.spam": {
      const isSpamView = getActiveLabel() === "spam";
      const multiSpamKeys = useThreadStore.getState().selectedThreadIds;
      if (multiSpamKeys.size > 0) {
        const keys = [...multiSpamKeys];
        for (const key of keys) {
          const acctId = getAccountIdForKey(key);
          const { threadId } = parseThreadKey(key);
          await spamThread(acctId, threadId, [], !isSpamView);
        }
      } else if (selectedKey) {
        const acctId = getSelectedThreadAccountId();
        if (acctId) {
          const { threadId } = parseThreadKey(selectedKey);
          await spamThread(acctId, threadId, [], !isSpamView);
        }
      }
      break;
    }
    case "action.pin": {
      if (selectedKey) {
        const thread = threads.find((t) => threadKey(t) === selectedKey);
        if (thread) {
          const newPinned = !thread.isPinned;
          useThreadStore.getState().updateThread(selectedKey, { isPinned: newPinned });
          try {
            if (newPinned) {
              await pinThreadDb(thread.accountId, thread.id);
            } else {
              await unpinThreadDb(thread.accountId, thread.id);
            }
          } catch (err) {
            console.error("Pin failed:", err);
            useThreadStore.getState().updateThread(selectedKey, { isPinned: !newPinned });
          }
        }
      }
      break;
    }
    case "action.selectAll": {
      useThreadStore.getState().selectAll();
      break;
    }
    case "action.selectFromHere": {
      useThreadStore.getState().selectAllFromHere();
      break;
    }
    case "action.unsubscribe": {
      if (selectedKey) {
        const acctId = getSelectedThreadAccountId();
        if (acctId) {
          const { threadId } = parseThreadKey(selectedKey);
          try {
            const msgs = await getMessagesForThread(acctId, threadId);
            const unsubMsg = msgs.find((m) => m.list_unsubscribe);
            if (unsubMsg) {
              const url = parseUnsubscribeUrl(unsubMsg.list_unsubscribe!);
              if (url) {
                await openUrl(url);
                await archiveThread(acctId, threadId, []);
              }
            }
          } catch (err) {
            console.error("Unsubscribe failed:", err);
          }
        }
      }
      break;
    }
    case "action.mute": {
      const multiMuteKeys = useThreadStore.getState().selectedThreadIds;
      if (multiMuteKeys.size > 0) {
        const keys = [...multiMuteKeys];
        for (const key of keys) {
          const t = useThreadStore.getState().threadMap.get(key);
          if (!t) continue;
          if (t.isMuted) {
            await unmuteThreadDb(t.accountId, t.id);
            useThreadStore.getState().updateThread(key, { isMuted: false });
          } else {
            await muteThreadDb(t.accountId, t.id);
            await archiveThread(t.accountId, t.id, []);
          }
        }
      } else if (selectedKey) {
        const thread = threads.find((t) => threadKey(t) === selectedKey);
        if (thread) {
          if (thread.isMuted) {
            await unmuteThreadDb(thread.accountId, thread.id);
            useThreadStore.getState().updateThread(selectedKey, { isMuted: false });
          } else {
            await muteThreadDb(thread.accountId, thread.id);
            await archiveThread(thread.accountId, thread.id, []);
          }
        }
      }
      break;
    }
    case "action.createTaskFromEmail": {
      if (selectedKey) {
        const { threadId } = parseThreadKey(selectedKey);
        window.dispatchEvent(new CustomEvent("velo-extract-task", { detail: { threadId } }));
      }
      break;
    }
    case "action.moveToFolder": {
      const multiMoveKeys = useThreadStore.getState().selectedThreadIds;
      const moveThreadIds = multiMoveKeys.size > 0
        ? [...multiMoveKeys].map((k) => parseThreadKey(k).threadId)
        : selectedKey ? [parseThreadKey(selectedKey).threadId] : [];
      if (moveThreadIds.length > 0) {
        window.dispatchEvent(new CustomEvent("velo-move-to-folder", { detail: { threadIds: moveThreadIds } }));
      }
      break;
    }
    case "app.commandPalette":
      window.dispatchEvent(new Event("velo-toggle-command-palette"));
      break;
    case "app.toggleSidebar":
      useUIStore.getState().toggleSidebar();
      break;
    case "app.askInbox":
      window.dispatchEvent(new Event("velo-toggle-ask-inbox"));
      break;
    case "app.help":
      window.dispatchEvent(new Event("velo-toggle-shortcuts-help"));
      break;
    case "app.syncFolder": {
      const activeAccountId = useAccountStore.getState().activeAccountId;
      if (activeAccountId) {
        const currentLabel = getActiveLabel();
        useUIStore.getState().setSyncingFolder(currentLabel);
        const ids = activeAccountId === ALL_ACCOUNTS_ID ? getAllAccountIds() : [activeAccountId];
        triggerSync(ids);
      }
      break;
    }
  }
}
