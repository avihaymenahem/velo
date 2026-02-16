import { useState, useEffect } from "react";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { archiveThread, trashThread, permanentDeleteThread, markThreadRead, starThread, spamThread } from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb, muteThread as muteThreadDb, unmuteThread as unmuteThreadDb } from "@/services/db/threads";
import { deleteDraftsForThread } from "@/services/gmail/draftDeletion";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { SnoozeDialog } from "./SnoozeDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Archive, Trash2, MailOpen, Mail, Star, Clock, Ban, Pin, MailMinus, BellRing, VolumeX } from "lucide-react";
import type { DbMessage } from "@/services/db/messages";
import { insertFollowUpReminder, getFollowUpForThread, cancelFollowUpForThread } from "@/services/db/followUpReminders";
import { Button } from "@/components/ui/Button";

interface ActionBarProps {
  thread: Thread;
  messages?: DbMessage[];
}

export function ActionBar({ thread, messages }: ActionBarProps) {
  const updateThread = useThreadStore((s) => s.updateThread);
  const removeThread = useThreadStore((s) => s.removeThread);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useActiveLabel();
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
    await markThreadRead(activeAccountId, thread.id, [], !thread.isRead);
  };

  const handleToggleStar = async () => {
    if (!activeAccountId) return;
    await starThread(activeAccountId, thread.id, [], !thread.isStarred);
  };

  const handleArchive = async () => {
    if (!activeAccountId) return;
    await archiveThread(activeAccountId, thread.id, []);
  };

  const handleDelete = async () => {
    if (!activeAccountId) return;
    const isTrashView = activeLabel === "trash";
    const isDraftsView = activeLabel === "drafts";
    if (isTrashView) {
      await permanentDeleteThread(activeAccountId, thread.id, []);
      await deleteThreadFromDb(activeAccountId, thread.id);
    } else if (isDraftsView) {
      removeThread(thread.id);
      try {
        const client = await getGmailClient(activeAccountId);
        await deleteDraftsForThread(client, activeAccountId, thread.id);
      } catch (err) {
        console.error("Failed to delete drafts:", err);
      }
    } else {
      await trashThread(activeAccountId, thread.id, []);
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
    await spamThread(activeAccountId, thread.id, [], !isSpamView);
  };

  // Find the first message with an unsubscribe header
  const unsubscribeMessage = messages?.find((m) => m.list_unsubscribe);
  const hasUnsubscribe = !!unsubscribeMessage?.list_unsubscribe;
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<"idle" | "loading" | "done">("idle");

  const handleUnsubscribe = async () => {
    if (!unsubscribeMessage?.list_unsubscribe || !activeAccountId) return;
    setUnsubscribeStatus("loading");
    try {
      const { executeUnsubscribe } = await import("@/services/unsubscribe/unsubscribeManager");
      const result = await executeUnsubscribe(
        activeAccountId,
        thread.id,
        unsubscribeMessage.from_address ?? "unknown",
        unsubscribeMessage.from_name,
        unsubscribeMessage.list_unsubscribe,
        unsubscribeMessage.list_unsubscribe_post,
      );
      if (result.success) {
        setUnsubscribeStatus("done");
        // Auto-archive after successful unsubscribe
        await archiveThread(activeAccountId, thread.id, []);
      } else {
        setUnsubscribeStatus("idle");
      }
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setUnsubscribeStatus("idle");
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

  const handleToggleMute = async () => {
    if (!activeAccountId) return;
    const newMuted = !thread.isMuted;
    if (newMuted) {
      // Mute: mark as muted and archive
      updateThread(thread.id, { isMuted: true });
      try {
        await muteThreadDb(activeAccountId, thread.id);
        await archiveThread(activeAccountId, thread.id, []);
      } catch (err) {
        console.error("Failed to mute:", err);
        await unmuteThreadDb(activeAccountId, thread.id);
        updateThread(thread.id, { isMuted: false });
      }
    } else {
      // Unmute
      updateThread(thread.id, { isMuted: false });
      try {
        await unmuteThreadDb(activeAccountId, thread.id);
      } catch (err) {
        console.error("Failed to unmute:", err);
        updateThread(thread.id, { isMuted: true });
      }
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
        <ActionButton
          onClick={handleToggleMute}
          title={thread.isMuted ? "Unmute (m)" : "Mute (m)"}
          icon={<VolumeX size={14} className={thread.isMuted ? "fill-current" : ""} />}
          label={thread.isMuted ? "Unmute" : "Mute"}
          className={thread.isMuted ? "text-warning" : ""}
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
        {hasUnsubscribe && (
          <ActionButton
            onClick={handleUnsubscribe}
            title="Unsubscribe (u)"
            icon={<MailMinus size={14} />}
            label={unsubscribeStatus === "loading" ? "Unsubscribing..." : unsubscribeStatus === "done" ? "Unsubscribed" : "Unsubscribe"}
            className={unsubscribeStatus === "done" ? "text-success" : ""}
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
    <Button
      variant="secondary"
      icon={icon}
      onClick={onClick}
      title={title}
      className={`interactive-btn ${className}`}
    >
      {label}
    </Button>
  );
}
