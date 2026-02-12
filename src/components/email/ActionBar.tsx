import { useState, useEffect } from "react";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb } from "@/services/db/threads";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { parseUnsubscribeUrl } from "./MessageItem";
import { SnoozeDialog } from "./SnoozeDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Archive, Trash2, MailOpen, Mail, Star, Clock, Ban, Pin, MailMinus, BellRing } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { DbMessage } from "@/services/db/messages";
import { insertFollowUpReminder, getFollowUpForThread, cancelFollowUpForThread } from "@/services/db/followUpReminders";

interface ActionBarProps {
  thread: Thread;
  messages?: DbMessage[];
}

export function ActionBar({ thread, messages }: ActionBarProps) {
  const updateThread = useThreadStore((s) => s.updateThread);
  const removeThread = useThreadStore((s) => s.removeThread);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useUIStore((s) => s.activeLabel);
  const [showSnooze, setShowSnooze] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const isSpamView = activeLabel === "spam";

  // Check if thread has an active follow-up reminder
  useEffect(() => {
    if (!activeAccountId) return;
    getFollowUpForThread(activeAccountId, thread.id)
      .then((r) => setHasFollowUp(r !== null))
      .catch(() => setHasFollowUp(false));
  }, [activeAccountId, thread.id]);

  const handleToggleRead = async () => {
    if (!activeAccountId) return;
    const newIsRead = !thread.isRead;
    updateThread(thread.id, { isRead: newIsRead });

    try {
      const client = await getGmailClient(activeAccountId);
      if (newIsRead) {
        await client.modifyThread(thread.id, undefined, ["UNREAD"]);
      } else {
        await client.modifyThread(thread.id, ["UNREAD"]);
      }
    } catch (err) {
      console.error("Failed to toggle read:", err);
      updateThread(thread.id, { isRead: !newIsRead }); // revert
    }
  };

  const handleToggleStar = async () => {
    if (!activeAccountId) return;
    const newIsStarred = !thread.isStarred;
    updateThread(thread.id, { isStarred: newIsStarred });

    try {
      const client = await getGmailClient(activeAccountId);
      if (newIsStarred) {
        await client.modifyThread(thread.id, ["STARRED"]);
      } else {
        await client.modifyThread(thread.id, undefined, ["STARRED"]);
      }
    } catch (err) {
      console.error("Failed to toggle star:", err);
      updateThread(thread.id, { isStarred: !newIsStarred });
    }
  };

  const handleArchive = async () => {
    if (!activeAccountId) return;
    // Optimistic: remove from UI immediately
    removeThread(thread.id);
    try {
      const client = await getGmailClient(activeAccountId);
      await client.modifyThread(thread.id, undefined, ["INBOX"]);
    } catch (err) {
      console.error("Failed to archive:", err);
    }
  };

  const handleDelete = async () => {
    if (!activeAccountId) return;
    const isTrashView = activeLabel === "trash";
    // Optimistic: remove from UI immediately
    removeThread(thread.id);
    try {
      const client = await getGmailClient(activeAccountId);
      if (isTrashView) {
        await client.deleteThread(thread.id);
        await deleteThreadFromDb(activeAccountId, thread.id);
      } else {
        await client.modifyThread(thread.id, ["TRASH"], ["INBOX"]);
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleSnooze = async (until: number) => {
    if (!activeAccountId) return;
    setShowSnooze(false);
    try {
      await snoozeThread(activeAccountId, thread.id, until);
      removeThread(thread.id);
    } catch (err) {
      console.error("Failed to snooze:", err);
    }
  };

  const handleSpam = async () => {
    if (!activeAccountId) return;
    removeThread(thread.id);
    try {
      const client = await getGmailClient(activeAccountId);
      if (isSpamView) {
        await client.modifyThread(thread.id, ["INBOX"], ["SPAM"]);
      } else {
        await client.modifyThread(thread.id, ["SPAM"], ["INBOX"]);
      }
    } catch (err) {
      console.error("Failed to report spam:", err);
    }
  };

  // Find the first message with an unsubscribe header
  const unsubscribeMessage = messages?.find((m) => m.list_unsubscribe);
  const unsubscribeUrl = unsubscribeMessage
    ? parseUnsubscribeUrl(unsubscribeMessage.list_unsubscribe!)
    : null;

  const handleUnsubscribe = async () => {
    if (!unsubscribeUrl) return;
    try {
      await openUrl(unsubscribeUrl);
      // Optionally archive after unsubscribing
      if (activeAccountId) {
        removeThread(thread.id);
        const client = await getGmailClient(activeAccountId);
        await client.modifyThread(thread.id, undefined, ["INBOX"]);
      }
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
    }
  };

  const handleTogglePin = async () => {
    if (!activeAccountId) return;
    const newPinned = !thread.isPinned;
    updateThread(thread.id, { isPinned: newPinned });
    try {
      if (newPinned) {
        await pinThreadDb(activeAccountId, thread.id);
      } else {
        await unpinThreadDb(activeAccountId, thread.id);
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      updateThread(thread.id, { isPinned: !newPinned });
    }
  };

  const handleFollowUp = async (remindAt: number) => {
    if (!activeAccountId || !messages || messages.length === 0) return;
    setShowFollowUp(false);
    const lastMsg = messages[messages.length - 1]!;
    try {
      await insertFollowUpReminder(activeAccountId, thread.id, lastMsg.id, remindAt);
      setHasFollowUp(true);
    } catch (err) {
      console.error("Failed to set follow-up reminder:", err);
    }
  };

  const handleCancelFollowUp = async () => {
    if (!activeAccountId) return;
    try {
      await cancelFollowUpForThread(activeAccountId, thread.id);
      setHasFollowUp(false);
    } catch (err) {
      console.error("Failed to cancel follow-up:", err);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border-secondary bg-bg-secondary">
        <ActionButton
          onClick={handleArchive}
          title="Archive (e)"
          icon={<Archive size={14} />}
          label="Archive"
        />
        <ActionButton
          onClick={handleDelete}
          title="Delete (#)"
          icon={<Trash2 size={14} />}
          label="Delete"
        />
        <ActionButton
          onClick={handleToggleRead}
          title={thread.isRead ? "Mark unread" : "Mark read"}
          icon={thread.isRead ? <Mail size={14} /> : <MailOpen size={14} />}
          label={thread.isRead ? "Unread" : "Read"}
        />
        <ActionButton
          onClick={handleToggleStar}
          title={thread.isStarred ? "Unstar (s)" : "Star (s)"}
          icon={<Star size={14} className={thread.isStarred ? "fill-current" : ""} />}
          label={thread.isStarred ? "Starred" : "Star"}
          className={thread.isStarred ? "text-warning" : ""}
        />
        <ActionButton
          onClick={() => setShowSnooze(true)}
          title="Snooze (h)"
          icon={<Clock size={14} />}
          label="Snooze"
        />
        <ActionButton
          onClick={handleSpam}
          title={isSpamView ? "Not Spam (!)" : "Report Spam (!)"}
          icon={<Ban size={14} />}
          label={isSpamView ? "Not Spam" : "Spam"}
        />
        <ActionButton
          onClick={handleTogglePin}
          title={thread.isPinned ? "Unpin (p)" : "Pin (p)"}
          icon={<Pin size={14} className={thread.isPinned ? "fill-current" : ""} />}
          label={thread.isPinned ? "Unpin" : "Pin"}
          className={thread.isPinned ? "text-accent" : ""}
        />
        {hasFollowUp ? (
          <ActionButton
            onClick={handleCancelFollowUp}
            title="Cancel follow-up reminder"
            icon={<BellRing size={14} className="fill-current" />}
            label="Following up"
            className="text-accent"
          />
        ) : (
          <ActionButton
            onClick={() => setShowFollowUp(true)}
            title="Remind me if no reply"
            icon={<BellRing size={14} />}
            label="Follow up"
          />
        )}
        {unsubscribeUrl && (
          <ActionButton
            onClick={handleUnsubscribe}
            title="Unsubscribe (u)"
            icon={<MailMinus size={14} />}
            label="Unsubscribe"
          />
        )}
      </div>

      <SnoozeDialog
        isOpen={showSnooze}
        onSnooze={handleSnooze}
        onClose={() => setShowSnooze(false)}
      />
      <FollowUpDialog
        isOpen={showFollowUp}
        onSetReminder={handleFollowUp}
        onClose={() => setShowFollowUp(false)}
      />
    </>
  );
}

function ActionButton({
  onClick,
  title,
  icon,
  label,
  className = "",
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:bg-bg-hover text-text-secondary hover:text-text-primary interactive-btn ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
