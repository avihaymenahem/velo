import { useState, useEffect } from "react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { getActiveLabel } from "@/router/navigate";
import { useComposerStore } from "@/stores/composerStore";
import { useLabelStore } from "@/stores/labelStore";
import { archiveThread, trashThread, permanentDeleteThread, markThreadRead, starThread, spamThread, addThreadLabel, removeThreadLabel } from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb, muteThread as muteThreadDb, unmuteThread as unmuteThreadDb } from "@/services/db/threads";
import { deleteDraftsForThread } from "@/services/gmail/draftDeletion";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { getMessagesForThread } from "@/services/db/messages";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { getEnabledQuickStepsForAccount, type DbQuickStep } from "@/services/db/quickSteps";
import { executeQuickStep } from "@/services/quickSteps/executor";
import type { QuickStep, QuickStepAction } from "@/services/quickSteps/types";
import { SnoozeDialog } from "../email/SnoozeDialog";
import {
  Reply,
  ReplyAll,
  Forward,
  Archive,
  Trash2,
  Mail,
  MailOpen,
  Star,
  Clock,
  Pin,
  Ban,
  Tag,
  ExternalLink,
  Pencil,
  Copy,
  Layers,
  VolumeX,
  Zap,
  Code,
  RefreshCw,
} from "lucide-react";
import { triggerSync } from "@/services/gmail/syncManager";
import { useUIStore } from "@/stores/uiStore";
import { setThreadCategory, ALL_CATEGORIES } from "@/services/db/threadCategories";

function buildQuote(msg: { from_name: string | null; from_address: string | null; date: string | number; body_html: string | null; body_text: string | null }): string {
  const date = new Date(msg.date).toLocaleString();
  const from = msg.from_name
    ? `${msg.from_name} &lt;${msg.from_address}&gt;`
    : (msg.from_address ?? "Unknown");
  return `<br><br><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666">On ${date}, ${from} wrote:<br>${msg.body_html ?? msg.body_text ?? ""}</div>`;
}

function buildForwardQuote(msg: { from_name: string | null; from_address: string | null; date: string | number; subject: string | null; to_addresses: string | null; body_html: string | null; body_text: string | null }): string {
  const date = new Date(msg.date).toLocaleString();
  return `<br><br>---------- Forwarded message ---------<br>From: ${msg.from_name ?? ""} &lt;${msg.from_address ?? ""}&gt;<br>Date: ${date}<br>Subject: ${msg.subject ?? ""}<br>To: ${msg.to_addresses ?? ""}<br><br>${msg.body_html ?? msg.body_text ?? ""}`;
}

export function ContextMenuPortal() {
  const menuType = useContextMenuStore((s) => s.menuType);
  const position = useContextMenuStore((s) => s.position);
  const data = useContextMenuStore((s) => s.data);
  const closeMenu = useContextMenuStore((s) => s.closeMenu);
  const [snoozeTarget, setSnoozeTarget] = useState<{ threadIds: string[]; accountId: string } | null>(null);

  if (!menuType) {
    if (snoozeTarget) {
      return (
        <SnoozeDialog
          onSnooze={async (until) => {
            for (const id of snoozeTarget.threadIds) {
              await snoozeThread(snoozeTarget.accountId, id, until);
              useThreadStore.getState().removeThread(id);
            }
            setSnoozeTarget(null);
          }}
          onClose={() => setSnoozeTarget(null)}
        />
      );
    }
    return null;
  }

  return (
    <>
      {menuType === "sidebarLabel" && (
        <SidebarLabelMenu position={position} data={data} onClose={closeMenu} />
      )}
      {menuType === "sidebarNav" && (
        <SidebarNavMenu position={position} data={data} onClose={closeMenu} />
      )}
      {menuType === "thread" && (
        <ThreadMenu
          position={position}
          data={data}
          onClose={closeMenu}
          onSnooze={setSnoozeTarget}
        />
      )}
      {menuType === "message" && (
        <MessageMenu position={position} data={data} onClose={closeMenu} />
      )}
      {snoozeTarget && (
        <SnoozeDialog
          onSnooze={async (until) => {
            for (const id of snoozeTarget.threadIds) {
              await snoozeThread(snoozeTarget.accountId, id, until);
              useThreadStore.getState().removeThread(id);
            }
            setSnoozeTarget(null);
          }}
          onClose={() => setSnoozeTarget(null)}
        />
      )}
    </>
  );
}

function SidebarLabelMenu({
  position,
  data,
  onClose,
}: {
  position: { x: number; y: number };
  data: Record<string, unknown>;
  onClose: () => void;
}) {
  const onEdit = data["onEdit"] as (() => void) | undefined;
  const onDelete = data["onDelete"] as (() => void) | undefined;
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const handleSync = async () => {
    if (!activeAccountId) return;
    useUIStore.getState().setSyncingFolder("label");
    try {
      await triggerSync([activeAccountId]);
    } finally {
      useUIStore.getState().setSyncingFolder(null);
    }
  };

  const items: ContextMenuItem[] = [
    {
      id: "sync-folder",
      label: "Sync this folder",
      icon: RefreshCw,
      action: handleSync,
    },
    { id: "sep-sync", label: "", separator: true },
    {
      id: "edit-label",
      label: "Edit label",
      icon: Pencil,
      action: () => onEdit?.(),
    },
    {
      id: "delete-label",
      label: "Delete label",
      icon: Trash2,
      danger: true,
      action: () => onDelete?.(),
    },
  ];

  return <ContextMenu items={items} position={position} onClose={onClose} />;
}

function SidebarNavMenu({
  position,
  data,
  onClose,
}: {
  position: { x: number; y: number };
  data: Record<string, unknown>;
  onClose: () => void;
}) {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const navId = data["navId"] as string;

  const handleSync = async () => {
    if (!activeAccountId) return;
    useUIStore.getState().setSyncingFolder(navId);
    try {
      await triggerSync([activeAccountId]);
    } finally {
      useUIStore.getState().setSyncingFolder(null);
    }
  };

  const items: ContextMenuItem[] = [
    {
      id: "sync-folder",
      label: "Sync this folder",
      icon: RefreshCw,
      action: handleSync,
    },
  ];

  return <ContextMenu items={items} position={position} onClose={onClose} />;
}

function ThreadMenu({
  position,
  data,
  onClose,
  onSnooze,
}: {
  position: { x: number; y: number };
  data: Record<string, unknown>;
  onClose: () => void;
  onSnooze: (target: { threadIds: string[]; accountId: string }) => void;
}) {
  const threadId = data["threadId"] as string;
  const threads = useThreadStore((s) => s.threads);
  const selectedThreadIds = useThreadStore((s) => s.selectedThreadIds);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = getActiveLabel();
  const labels = useLabelStore((s) => s.labels);
  const openComposer = useComposerStore((s) => s.openComposer);
  const [quickSteps, setQuickSteps] = useState<DbQuickStep[]>([]);

  useEffect(() => {
    if (!activeAccountId) return;
    getEnabledQuickStepsForAccount(activeAccountId).then(setQuickSteps).catch(() => {
      // quick_steps table may not exist yet before migration
    });
  }, [activeAccountId]);

  // Determine target threads: if right-clicked thread is in multi-select, use all selected; otherwise just this one
  const isInMultiSelect = selectedThreadIds.has(threadId);
  const targetIds = isInMultiSelect && selectedThreadIds.size > 1
    ? [...selectedThreadIds]
    : [threadId];
  const isMulti = targetIds.length > 1;

  const thread = threads.find((t) => t.id === threadId);
  if (!thread || !activeAccountId) {
    return <ContextMenu items={[]} position={position} onClose={onClose} />;
  }

  const isTrashView = activeLabel === "trash";
  const isDraftsView = activeLabel === "drafts";
  const isSpamView = activeLabel === "spam";

  // For single thread: show current state. For multi: be generic
  const isRead = isMulti ? true : thread.isRead;
  const isStarred = isMulti ? false : thread.isStarred;
  const isPinned = isMulti ? false : thread.isPinned;
  const isMuted = isMulti ? false : thread.isMuted;

  const handleReply = async () => {
    const messages = await getMessagesForThread(activeAccountId, thread.id);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
    openComposer({
      mode: "reply",
      to: replyTo ? [replyTo] : [],
      subject: `Re: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  };

  const handleReplyAll = async () => {
    const messages = await getMessagesForThread(activeAccountId, thread.id);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    const replyTo = lastMessage.reply_to ?? lastMessage.from_address;
    const allRecipients = new Set<string>();
    if (replyTo) allRecipients.add(replyTo);
    if (lastMessage.to_addresses) {
      lastMessage.to_addresses.split(",").forEach((a) => allRecipients.add(a.trim()));
    }
    const ccList: string[] = [];
    if (lastMessage.cc_addresses) {
      lastMessage.cc_addresses.split(",").forEach((a) => ccList.push(a.trim()));
    }
    openComposer({
      mode: "replyAll",
      to: Array.from(allRecipients),
      cc: ccList,
      subject: `Re: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  };

  const handleForward = async () => {
    const messages = await getMessagesForThread(activeAccountId, thread.id);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    openComposer({
      mode: "forward",
      to: [],
      subject: `Fwd: ${lastMessage.subject ?? ""}`,
      bodyHtml: buildForwardQuote(lastMessage),
      threadId: lastMessage.thread_id,
      inReplyToMessageId: lastMessage.id,
    });
  };

  const handleArchive = async () => {
    for (const id of targetIds) {
      await archiveThread(activeAccountId, id, []);
    }
  };

  const handleDelete = async () => {
    for (const id of targetIds) {
      if (isTrashView) {
        await permanentDeleteThread(activeAccountId, id, []);
        await deleteThreadFromDb(activeAccountId, id);
      } else if (isDraftsView) {
        useThreadStore.getState().removeThread(id);
        try {
          const client = await getGmailClient(activeAccountId);
          await deleteDraftsForThread(client, activeAccountId, id);
        } catch (err) {
          console.error("Failed to delete drafts:", err);
        }
      } else {
        await trashThread(activeAccountId, id, []);
      }
    }
  };

  const handleToggleRead = async () => {
    for (const id of targetIds) {
      const t = threads.find((th) => th.id === id);
      if (!t) continue;
      await markThreadRead(activeAccountId, id, [], !t.isRead);
    }
  };

  const handleToggleStar = async () => {
    for (const id of targetIds) {
      const t = threads.find((th) => th.id === id);
      if (!t) continue;
      await starThread(activeAccountId, id, [], !t.isStarred);
    }
  };

  const handleTogglePin = async () => {
    for (const id of targetIds) {
      const t = threads.find((th) => th.id === id);
      if (!t) continue;
      const newPinned = !t.isPinned;
      useThreadStore.getState().updateThread(id, { isPinned: newPinned });
      if (newPinned) {
        await pinThreadDb(activeAccountId, id);
      } else {
        await unpinThreadDb(activeAccountId, id);
      }
    }
  };

  const handleSpam = async () => {
    for (const id of targetIds) {
      await spamThread(activeAccountId, id, [], !isSpamView);
    }
  };

  const handleSnooze = () => {
    onSnooze({ threadIds: [...targetIds], accountId: activeAccountId });
  };

  const handleToggleMute = async () => {
    for (const id of targetIds) {
      const t = threads.find((th) => th.id === id);
      if (!t) continue;
      const newMuted = !t.isMuted;
      if (newMuted) {
        await muteThreadDb(activeAccountId, id);
        await archiveThread(activeAccountId, id, []);
      } else {
        await unmuteThreadDb(activeAccountId, id);
        useThreadStore.getState().updateThread(id, { isMuted: false });
      }
    }
  };

  const handlePopOut = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const windowLabel = `thread-${thread.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const url = `index.html?thread=${encodeURIComponent(thread.id)}&account=${encodeURIComponent(thread.accountId)}`;
      const existing = await WebviewWindow.getByLabel(windowLabel);
      if (existing) {
        await existing.setFocus();
        return;
      }
      const win = new WebviewWindow(windowLabel, {
        url,
        title: thread.subject ?? "Thread",
        width: 800,
        height: 700,
        center: true,
        dragDropEnabled: false,
      });
      win.once("tauri://error", (e) => {
        console.error("Failed to create pop-out window:", e);
      });
    } catch (err) {
      console.error("Failed to open pop-out window:", err);
    }
  };

  const handleToggleLabel = async (labelId: string) => {
    for (const id of targetIds) {
      const t = useThreadStore.getState().threads.find((th) => th.id === id);
      if (!t) continue;
      const hasLabel = t.labelIds.includes(labelId);
      if (hasLabel) {
        await removeThreadLabel(activeAccountId, id, labelId);
        useThreadStore.getState().updateThread(id, {
          labelIds: t.labelIds.filter((l) => l !== labelId),
        });
      } else {
        await addThreadLabel(activeAccountId, id, labelId);
        useThreadStore.getState().updateThread(id, {
          labelIds: [...t.labelIds, labelId],
        });
      }
    }
  };

  // Build label submenu items
  const labelItems: ContextMenuItem[] = labels.map((label) => {
    // For single thread, show checkmark if label is applied
    const isApplied = !isMulti && thread.labelIds.includes(label.id);
    return {
      id: `label-${label.id}`,
      label: label.name,
      checked: isApplied,
      action: () => handleToggleLabel(label.id),
    };
  });

  const items: ContextMenuItem[] = [
    {
      id: "reply",
      label: "Reply",
      icon: Reply,
      shortcut: "r",
      disabled: isMulti,
      action: handleReply,
    },
    {
      id: "reply-all",
      label: "Reply All",
      icon: ReplyAll,
      shortcut: "a",
      disabled: isMulti,
      action: handleReplyAll,
    },
    {
      id: "forward",
      label: "Forward",
      icon: Forward,
      shortcut: "f",
      disabled: isMulti,
      action: handleForward,
    },
    { id: "sep-1", label: "", separator: true },
    {
      id: "archive",
      label: "Archive",
      icon: Archive,
      shortcut: "e",
      action: handleArchive,
    },
    {
      id: "delete",
      label: isTrashView ? "Delete Permanently" : "Delete",
      icon: Trash2,
      shortcut: "#",
      danger: isTrashView,
      action: handleDelete,
    },
    {
      id: "toggle-read",
      label: isRead ? "Mark as Unread" : "Mark as Read",
      icon: isRead ? Mail : MailOpen,
      action: handleToggleRead,
    },
    {
      id: "toggle-star",
      label: isStarred ? "Unstar" : "Star",
      icon: Star,
      shortcut: "s",
      action: handleToggleStar,
    },
    { id: "sep-2", label: "", separator: true },
    {
      id: "snooze",
      label: "Snooze...",
      icon: Clock,
      shortcut: "h",
      action: handleSnooze,
    },
    {
      id: "toggle-pin",
      label: isPinned ? "Unpin" : "Pin",
      icon: Pin,
      shortcut: "p",
      action: handleTogglePin,
    },
    {
      id: "toggle-mute",
      label: isMuted ? "Unmute" : "Mute",
      icon: VolumeX,
      shortcut: "m",
      action: handleToggleMute,
    },
    {
      id: "spam",
      label: isSpamView ? "Not Spam" : "Report Spam",
      icon: Ban,
      shortcut: "!",
      action: handleSpam,
    },
    { id: "sep-3", label: "", separator: true },
    ...(labelItems.length > 0
      ? [{
          id: "apply-label",
          label: "Apply Label",
          icon: Tag,
          children: labelItems,
        }]
      : []),
    {
      id: "move-to-category",
      label: "Move to Category",
      icon: Layers,
      children: ALL_CATEGORIES.map((cat) => ({
        id: `cat-${cat}`,
        label: cat,
        action: async () => {
          for (const id of targetIds) {
            await setThreadCategory(activeAccountId, id, cat, true);
          }
          window.dispatchEvent(new Event("velo-sync-done"));
        },
      })),
    },
    ...(quickSteps.length > 0
      ? [
          { id: "sep-4", label: "", separator: true },
          {
            id: "quick-steps",
            label: "Quick Steps",
            icon: Zap,
            children: quickSteps.map((qs) => {
              let parsedActions: QuickStepAction[] = [];
              try {
                parsedActions = JSON.parse(qs.actions_json) as QuickStepAction[];
              } catch { /* ignore */ }
              return {
                id: `qs-${qs.id}`,
                label: qs.name,
                action: async () => {
                  const step: QuickStep = {
                    id: qs.id,
                    accountId: qs.account_id,
                    name: qs.name,
                    description: qs.description,
                    shortcut: qs.shortcut,
                    actions: parsedActions,
                    icon: qs.icon,
                    isEnabled: qs.is_enabled === 1,
                    continueOnError: qs.continue_on_error === 1,
                    sortOrder: qs.sort_order,
                    createdAt: qs.created_at,
                  };
                  await executeQuickStep(step, [...targetIds], activeAccountId);
                },
              };
            }),
          } as ContextMenuItem,
        ]
      : []),
    {
      id: "pop-out",
      label: "Open in New Window",
      icon: ExternalLink,
      disabled: isMulti,
      action: handlePopOut,
    },
  ];

  return <ContextMenu items={items} position={position} onClose={onClose} />;
}

function MessageMenu({
  position,
  data,
  onClose,
}: {
  position: { x: number; y: number };
  data: Record<string, unknown>;
  onClose: () => void;
}) {
  const openComposer = useComposerStore((s) => s.openComposer);

  const messageId = data["messageId"] as string;
  const threadId = data["threadId"] as string;
  const accountId = data["accountId"] as string | null;
  const fromAddress = data["fromAddress"] as string | null;
  const fromName = data["fromName"] as string | null;
  const replyTo = data["replyTo"] as string | null;
  const toAddresses = data["toAddresses"] as string | null;
  const ccAddresses = data["ccAddresses"] as string | null;
  const subject = data["subject"] as string | null;
  const date = data["date"] as string | number;
  const bodyHtml = data["bodyHtml"] as string | null;
  const bodyText = data["bodyText"] as string | null;

  const msg = { from_name: fromName, from_address: fromAddress, date, body_html: bodyHtml, body_text: bodyText, subject, to_addresses: toAddresses };

  const handleReply = () => {
    const replyAddr = replyTo ?? fromAddress;
    openComposer({
      mode: "reply",
      to: replyAddr ? [replyAddr] : [],
      subject: `Re: ${subject ?? ""}`,
      bodyHtml: buildQuote(msg),
      threadId,
      inReplyToMessageId: messageId,
    });
  };

  const handleReplyAll = () => {
    const replyAddr = replyTo ?? fromAddress;
    const allRecipients = new Set<string>();
    if (replyAddr) allRecipients.add(replyAddr);
    if (toAddresses) {
      toAddresses.split(",").forEach((a) => allRecipients.add(a.trim()));
    }
    const ccList: string[] = [];
    if (ccAddresses) {
      ccAddresses.split(",").forEach((a) => ccList.push(a.trim()));
    }
    openComposer({
      mode: "replyAll",
      to: Array.from(allRecipients),
      cc: ccList,
      subject: `Re: ${subject ?? ""}`,
      bodyHtml: buildQuote(msg),
      threadId,
      inReplyToMessageId: messageId,
    });
  };

  const handleForward = () => {
    openComposer({
      mode: "forward",
      to: [],
      subject: `Fwd: ${subject ?? ""}`,
      bodyHtml: buildForwardQuote(msg),
      threadId,
      inReplyToMessageId: messageId,
    });
  };

  const handleCopy = async () => {
    const text = bodyText ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback: no-op in non-secure contexts
    }
  };

  const items: ContextMenuItem[] = [
    {
      id: "reply",
      label: "Reply",
      icon: Reply,
      shortcut: "r",
      action: handleReply,
    },
    {
      id: "reply-all",
      label: "Reply All",
      icon: ReplyAll,
      shortcut: "a",
      action: handleReplyAll,
    },
    {
      id: "forward",
      label: "Forward",
      icon: Forward,
      shortcut: "f",
      action: handleForward,
    },
    { id: "sep-1", label: "", separator: true },
    {
      id: "copy-text",
      label: "Copy Message Text",
      icon: Copy,
      action: handleCopy,
    },
    ...(accountId
      ? [
          { id: "sep-2", label: "", separator: true },
          {
            id: "view-source",
            label: "View Source",
            icon: Code,
            action: () => {
              window.dispatchEvent(
                new CustomEvent("velo-view-raw-message", {
                  detail: { messageId, accountId },
                }),
              );
            },
          },
        ]
      : []),
  ];

  return <ContextMenu items={items} position={position} onClose={onClose} />;
}
