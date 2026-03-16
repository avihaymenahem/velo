import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { Archive, Trash2, MailOpen, Mail, Star, Clock, Ban, Pin, MailMinus, BellRing, VolumeX, Reply, ReplyAll, Forward, FolderInput, Printer, Download, ExternalLink, PanelRightClose, PanelRightOpen, ListTodo } from "lucide-react";
import type { DbMessage } from "@/services/db/messages";
import { insertFollowUpReminder, getFollowUpForThread, cancelFollowUpForThread } from "@/services/db/followUpReminders";
import { Button } from "@/components/ui/Button";

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
  const { t } = useTranslation("email");
  const updateThread = useThreadStore((s) => s.updateThread);
  const removeThread = useThreadStore((s) => s.removeThread);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useActiveLabel();
  const [showSnooze, setShowSnooze] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const isSpamView = activeLabel === "spam";
  const hasLastMessage = !!messages?.length;

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
      <div className="flex items-center gap-1 px-3 py-3 border-b border-border-secondary bg-bg-secondary">
        {/* Reply / Forward group */}
        {hasLastMessage && (
          <>
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <ReplyAll size={15} /> : <Reply size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReplyAll : onReply}
              disabled={noReply}
              title={noReply ? t("noReply") : defaultReplyMode === "replyAll" ? t("replyAllShortcut") : t("replyShortcut")}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={defaultReplyMode === "replyAll" ? <Reply size={15} /> : <ReplyAll size={15} />}
              onClick={defaultReplyMode === "replyAll" ? onReply : onReplyAll}
              disabled={noReply}
              title={noReply ? t("noReply") : defaultReplyMode === "replyAll" ? t("replyShortcut") : t("replyAllShortcut")}
              className="disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            />
            <Button
              variant="secondary"
              iconOnly
              icon={<Forward size={15} />}
              onClick={onForward}
              title={t("forwardShortcut")}
            />
            <Separator />
          </>
        )}

        {/* Core actions group */}
        <Button variant="secondary" iconOnly icon={<Archive size={15} />} onClick={handleArchive} title={t("archiveShortcut")} />
        <Button variant="secondary" iconOnly icon={<Trash2 size={15} />} onClick={handleDelete} title={t("deleteShortcut")} />
        <Button
          variant="secondary"
          iconOnly
          icon={thread.isRead ? <Mail size={15} /> : <MailOpen size={15} />}
          onClick={handleToggleRead}
          title={thread.isRead ? t("markUnread") : t("markRead")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Star size={15} className={thread.isStarred ? "fill-current" : ""} />}
          onClick={handleToggleStar}
          title={thread.isStarred ? t("unstarShortcut") : t("starShortcut")}
          className={thread.isStarred ? "text-warning" : ""}
        />
        <Button variant="secondary" iconOnly icon={<Clock size={15} />} onClick={() => setShowSnooze(true)} title={t("snoozeShortcut")} />
        <Button
          variant="secondary"
          iconOnly
          icon={<Ban size={15} />}
          onClick={handleSpam}
          title={isSpamView ? t("notSpamShortcut") : t("reportSpamShortcut")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<FolderInput size={15} />}
          onClick={() => {
            if (!activeAccountId) return;
            window.dispatchEvent(new CustomEvent("velo-move-to-folder", { detail: { threadIds: [thread.id] } }));
          }}
          title={t("moveToFolderShortcut")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<Pin size={15} className={thread.isPinned ? "fill-current" : ""} />}
          onClick={handleTogglePin}
          title={thread.isPinned ? t("unpinShortcut") : t("pinShortcut")}
          className={thread.isPinned ? "text-accent" : ""}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={<VolumeX size={15} className={thread.isMuted ? "fill-current" : ""} />}
          onClick={handleToggleMute}
          title={thread.isMuted ? t("unmuteShortcut") : t("muteShortcut")}
          className={thread.isMuted ? "text-warning" : ""}
        />
        {hasFollowUp ? (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} className="fill-current" />}
            onClick={handleCancelFollowUp}
            title={t("cancelFollowUp")}
            className="text-accent"
          />
        ) : (
          <Button
            variant="secondary"
            iconOnly
            icon={<BellRing size={15} />}
            onClick={() => setShowFollowUp(true)}
            title={t("remindNoReply")}
          />
        )}
        {hasUnsubscribe && (
          <Button
            variant="secondary"
            iconOnly
            icon={<MailMinus size={15} />}
            onClick={handleUnsubscribe}
            title={unsubscribeStatus === "loading" ? t("unsubscribing") : unsubscribeStatus === "done" ? t("unsubscribed") : t("unsubscribeShortcut")}
            className={unsubscribeStatus === "done" ? "text-success" : ""}
          />
        )}

        {/* Spacer */}
        <div className="ml-auto" />

        {/* Utility group */}
        <Button variant="secondary" iconOnly icon={<Printer size={15} />} onClick={onPrint} title={t("print")} />
        <Button variant="secondary" iconOnly icon={<Download size={15} />} onClick={onExport} title={t("exportEml")} />
        <Button variant="secondary" iconOnly icon={<ExternalLink size={15} />} onClick={onPopOut} title={t("openInNewWindow")} />
        <Button
          variant="secondary"
          iconOnly
          icon={<ListTodo size={15} className={taskSidebarVisible ? "text-accent" : ""} />}
          onClick={onToggleTaskSidebar}
          title={taskSidebarVisible ? t("hideTaskPanel") : t("showTaskPanel")}
        />
        <Button
          variant="secondary"
          iconOnly
          icon={contactSidebarVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          onClick={onToggleContactSidebar}
          title={contactSidebarVisible ? t("hideContactSidebar") : t("showContactSidebar")}
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
