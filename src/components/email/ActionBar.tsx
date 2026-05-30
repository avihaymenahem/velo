import { useState, useEffect } from "react";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { archiveThread, trashThread, permanentDeleteThread, markThreadRead, starThread, spamThread, deleteDraftThread, deleteSingleMessage } from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb, pinThread as pinThreadDb, unpinThread as unpinThreadDb, muteThread as muteThreadDb, unmuteThread as unmuteThreadDb } from "@/services/db/threads";
import { logInteraction } from "@/services/ai/reputationEngine";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { SnoozeDialog } from "./SnoozeDialog";
import { FollowUpDialog } from "./FollowUpDialog";
import { Archive, Trash2, Trash, MailOpen, Mail, Star, Clock, Ban, Pin, MailMinus, BellRing, VolumeX, Reply, ReplyAll, Forward, FolderInput, Printer, Download, ExternalLink, PanelRightClose, PanelRightOpen, ListTodo } from "lucide-react";
import type { DbMessage } from "@/services/db/messages";
import { insertFollowUpReminder, getFollowUpForThread, cancelFollowUpForThread } from "@/services/db/followUpReminders";
import { Button } from "@/components/ui/Button";
import { t } from "@/i18n";

interface ActionBarProps {
  thread: Thread;
  messages?: DbMessage[];
  noReply?: boolean;
  defaultReplyMode?: "reply" | "replyAll";
  contactSidebarVisible?: boolean;
  taskSidebarVisible?: boolean;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  onPopOut?: () => void;
  onToggleContactSidebar?: () => void;
  onToggleTaskSidebar?: () => void;
}

function Separator() {
  return <div className="w-px h-5 bg-border-secondary mx-1 shrink-0" />;
}

export function ActionBar({ thread, messages, noReply, defaultReplyMode = "reply", contactSidebarVisible, taskSidebarVisible, onReply, onReplyAll, onForward, onPrint, onExport, onPopOut, onToggleContactSidebar, onToggleTaskSidebar }: ActionBarProps) {
  const updateThread = useThreadStore((s) => s.updateThread);
  const removeThread = useThreadStore((s) => s.removeThread);
  const selectedMessageId = useThreadStore((s) => s.selectedMessageId);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  // In unified/global view activeAccountId is null — fall back to the thread's own account.
  const accountId = activeAccountId ?? thread.accountId;
  const activeLabel = useActiveLabel();
  const [showSnooze, setShowSnooze] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const isSpamView = activeLabel === "spam";
  const hasLastMessage = !!messages?.length;

  // Check if thread has an active follow-up reminder
  useEffect(() => {
    if (!accountId) return;
    getFollowUpForThread(accountId, thread.id)
      .then((r) => setHasFollowUp(r !== null))
      .catch(() => setHasFollowUp(false));
  }, [accountId, thread.id]);

  const handleToggleRead = async () => {
    if (!accountId) return;
    await markThreadRead(accountId, thread.id, messages?.map(m => m.id) || [], !thread.isRead);
  };

  const handleToggleStar = async () => {
    if (!accountId) return;
    await starThread(accountId, thread.id, messages?.map(m => m.id) || [], !thread.isStarred);
  };

  const handleArchive = async () => {
    if (!accountId) return;
    await archiveThread(accountId, thread.id, messages?.map(m => m.id) || []);
  };

  const handleDelete = async () => {
    if (!accountId) return;
    const isTrashView = activeLabel === "trash";
    const isDraftsView = activeLabel === "drafts";
    const msgIds = messages?.map((m) => m.id) || [];
    if (isTrashView) {
      await permanentDeleteThread(accountId, thread.id, msgIds);
      await deleteThreadFromDb(accountId, thread.id);
    } else if (isDraftsView) {
      removeThread(thread.id);
      await deleteDraftThread(accountId, thread.id);
    } else {
      await trashThread(accountId, thread.id, msgIds);
    }
  };

  const handleDeleteMessage = async () => {
    if (!accountId || !messages || messages.length === 0) return;
    const isTrashView = activeLabel === "trash";
    const msgId = selectedMessageId ?? messages[messages.length - 1]!.id;
    await deleteSingleMessage(accountId, thread.id, msgId, isTrashView);
  };

  const handleSnooze = async (until: number) => {
    if (!accountId) return;
    setShowSnooze(false);
    try {
      await snoozeThread(accountId, thread.id, until);
      removeThread(thread.id);
    } catch (err) {
      console.error("Failed to snooze:", err);
    }
  };

  const handleSpam = async () => {
    if (!accountId) return;
    await spamThread(accountId, thread.id, messages?.map(m => m.id) || [], !isSpamView);
  };

  // Find the first message with an unsubscribe header
  const unsubscribeMessage = messages?.find((m) => m.list_unsubscribe);
  const hasUnsubscribe = !!unsubscribeMessage?.list_unsubscribe;
  const [unsubscribeStatus, setUnsubscribeStatus] = useState<"idle" | "loading" | "done">("idle");

  const handleUnsubscribe = async () => {
    if (!unsubscribeMessage?.list_unsubscribe || !accountId) return;
    setUnsubscribeStatus("loading");
    try {
      const { executeUnsubscribe } = await import("@/services/unsubscribe/unsubscribeManager");
      const result = await executeUnsubscribe(
        accountId,
        thread.id,
        unsubscribeMessage.from_address ?? "unknown",
        unsubscribeMessage.from_name,
        unsubscribeMessage.list_unsubscribe,
        unsubscribeMessage.list_unsubscribe_post,
      );
      if (result.success) {
        setUnsubscribeStatus("done");
        await archiveThread(accountId, thread.id, []);
      } else {
        setUnsubscribeStatus("idle");
      }
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setUnsubscribeStatus("idle");
    }
  };

  const handleTogglePin = async () => {
    if (!accountId) return;
    const newPinned = !thread.isPinned;
    updateThread(thread.id, { isPinned: newPinned });
    try {
      if (newPinned) {
        await pinThreadDb(accountId, thread.id);
      } else {
        await unpinThreadDb(accountId, thread.id);
      }
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      updateThread(thread.id, { isPinned: !newPinned });
    }
  };

  const handleToggleMute = async () => {
    if (!accountId) return;
    const newMuted = !thread.isMuted;
    if (newMuted) {
      updateThread(thread.id, { isMuted: true, urgencyScore: 0.05 });
      try {
        await muteThreadDb(accountId, thread.id);
        if (thread.fromAddress) {
          logInteraction(accountId, thread.fromAddress, "MUTE_URGENCY", thread.id).catch(() => {});
        }
      } catch (err) {
        console.error("Failed to mute:", err);
        await unmuteThreadDb(accountId, thread.id);
        updateThread(thread.id, { isMuted: false });
      }
    } else {
      updateThread(thread.id, { isMuted: false });
      try {
        await unmuteThreadDb(accountId, thread.id);
      } catch (err) {
        console.error("Failed to unmute:", err);
        updateThread(thread.id, { isMuted: true });
      }
    }
  };

  const handleFollowUp = async (remindAt: number) => {
    if (!accountId || !messages || messages.length === 0) return;
    setShowFollowUp(false);
    const lastMsg = messages[messages.length - 1]!;
    try {
      await insertFollowUpReminder(accountId, thread.id, lastMsg.id, remindAt);
      setHasFollowUp(true);
    } catch (err) {
      console.error("Failed to set follow-up reminder:", err);
    }
  };

  const handleCancelFollowUp = async () => {
    if (!accountId) return;
    try {
      await cancelFollowUpForThread(accountId, thread.id);
      setHasFollowUp(false);
    } catch (err) {
      console.error("Failed to cancel follow-up:", err);
    }
  };

  return (
    <>
      <div className="action-bar flex items-center gap-1 px-3 py-3 border-b border-border-secondary bg-bg-secondary">
        {/* Reply / Forward group */}
        {hasLastMessage && (
          <>
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <ReplyAll size={15} /> : <Reply size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReplyAll : onReply}
              disabled={noReply}
              title={noReply ? t("actionBar.noReply") : defaultReplyMode === "replyAll" ? t("actionBar.replyAllSwitched") : t("actionBar.reply")}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <Reply size={15} /> : <ReplyAll size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReply : onReplyAll}
              disabled={noReply}
              title={noReply ? t("actionBar.noReply") : defaultReplyMode === "replyAll" ? t("actionBar.replySwitched") : t("actionBar.replyAll")}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={<Forward size={15} />}
              onClick={onForward}
              title={t("actionBar.forward")}
            />
            <Separator />
          </>
        )}

        {/* Core actions group */}
        <Button variant="secondary" iconOnly icon={<Archive size={15} />} onClick={handleArchive} title={t("actionBar.archive")} />
        <Button variant="secondary" iconOnly icon={<Trash2 size={15} />} onClick={handleDelete} title={t("actionBar.deleteThread")} />
        {messages && messages.length > 0 && (
          <Button variant="secondary" iconOnly icon={<Trash size={15} />} onClick={handleDeleteMessage} title={t("actionBar.deleteMessage")} />
        )}
        <Button
          variant="secondary"
          iconOnly
          icon={thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
          onClick={handleToggleRead}
          title={thread.isRead ? t("actionBar.markUnread") : t("actionBar.markRead")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Star size={15} className={thread.isStarred ? "fill-current" : ""} />}
          onClick={handleToggleStar}
          title={thread.isStarred ? t("actionBar.unstar") : t("actionBar.star")}
          className={thread.isStarred ? "text-warning" : ""}
        />
        <Button variant="secondary" iconOnly icon={<Clock size={15} />} onClick={() => setShowSnooze(true)} title={t("actionBar.snooze")} />
        <Button
          variant="secondary"
          iconOnly
          icon={<Ban size={15} />}
          onClick={handleSpam}
          title={isSpamView ? t("actionBar.notSpam") : t("actionBar.reportSpam")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<FolderInput size={15} />}
          onClick={() => {
            if (!activeAccountId) return;
            window.dispatchEvent(new CustomEvent("velo-move-to-folder", { detail: { threadIds: [thread.id] } }));
          }}
          title={t("actionBar.moveToFolder")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Pin size={15} className={thread.isPinned ? "fill-current" : ""} />}
          onClick={handleTogglePin}
          title={thread.isPinned ? t("actionBar.unpin") : t("actionBar.pin")}
          className={thread.isPinned ? "text-accent" : ""}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<VolumeX size={15} className={thread.isMuted ? "fill-current" : ""} />}
          onClick={handleToggleMute}
          title={thread.isMuted ? t("actionBar.unmute") : t("actionBar.mute")}
          className={thread.isMuted ? "text-warning" : ""}
        />
        {hasFollowUp ? (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} className="fill-current" />}
            onClick={handleCancelFollowUp}
            title={t("actionBar.cancelFollowUp")}
            className="text-accent"
          />
        ) : (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} />}
            onClick={() => setShowFollowUp(true)}
            title={t("actionBar.followUp")}
          />
        )}
        {hasUnsubscribe && (
          <Button
            variant="secondary"
            iconOnly
            icon={<MailMinus size={15} />}
            onClick={handleUnsubscribe}
            title={unsubscribeStatus === "loading" ? t("actionBar.unsubscribing") : unsubscribeStatus === "done" ? t("actionBar.unsubscribed") : t("actionBar.unsubscribe")}
            className={unsubscribeStatus === "done" ? "text-success" : ""}
          />
        )}

        {/* Spacer */}
        <div className="ml-auto" />

        {/* Utility group */}
        <Button variant="secondary" iconOnly icon={<Printer size={15} strokeWidth={1.5} />} onClick={onPrint} title="Print" />
        <Button variant="secondary" iconOnly icon={<Download size={15} strokeWidth={1.5} />} onClick={onExport} title="Export as .eml" />
        <Button variant="secondary" iconOnly icon={<ExternalLink size={15} strokeWidth={1.5} />} onClick={onPopOut} title="Open in new window" />
        <Button
          variant="secondary"
          iconOnly
          icon={<ListTodo size={15} className={taskSidebarVisible ? "text-accent" : ""} />}
          onClick={onToggleTaskSidebar}
          title={taskSidebarVisible ? "Hide task panel" : "Show task panel"}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={contactSidebarVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          onClick={onToggleContactSidebar}
          title={contactSidebarVisible ? "Hide contact sidebar" : "Show contact sidebar"}
        />
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
