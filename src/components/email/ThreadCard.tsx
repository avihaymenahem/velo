import { memo, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { formatRelativeDate } from "@/utils/date";
import { decodeHtml } from "@/utils/sanitize";
import { Paperclip, Star, Check, Pin, BellRing, VolumeX, Zap, Wind } from "lucide-react";
import type { DragData } from "@/components/dnd/DndProvider";
import { t } from "@/i18n";
import { useContactsStore } from "@/stores/contactsStore";

const CATEGORY_COLORS: Record<string, string> = {
  Updates: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  Promotions: "bg-green-500/15 text-green-600 dark:text-green-400",
  Social: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  Newsletters: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

interface ThreadCardProps {
  thread: Thread;
  isSelected: boolean;
  onClick: (thread: Thread) => void;
  onContextMenu?: (e: React.MouseEvent, threadId: string) => void;
  category?: string;
  showCategoryBadge?: boolean;
  hasFollowUp?: boolean;
}

export const ThreadCard = memo(function ThreadCard({ thread, isSelected, onClick, onContextMenu, category, showCategoryBadge, hasFollowUp }: ThreadCardProps) {
  const isMultiSelected = useThreadStore((s) => s.selectedThreadIds.has(thread.id));
  const hasMultiSelect = useThreadStore((s) => s.selectedThreadIds.size > 0);
  const toggleThreadSelection = useThreadStore((s) => s.toggleThreadSelection);
  const selectThreadRange = useThreadStore((s) => s.selectThreadRange);
  const activeLabel = useActiveLabel();
  const emailDensity = useUIStore((s) => s.emailDensity);
  const contactsMap = useContactsStore((s) => s.contactsMap);
  const isSpam = thread.labelIds.includes("SPAM");
  const account = useAccountStore((s) => s.accounts.find((a) => a.id === thread.accountId) ?? null);
  const accountColor = account?.color ?? null;

  const isSent = thread.labelIds.includes("SENT") && !thread.labelIds.includes("INBOX");

  const senderDisplay = useMemo(() => {
    const accountEmail = account?.email.toLowerCase() ?? "";

    if (isSent) {
      const raw = thread.allRecipients ?? thread.fromAddress ?? "";
      if (!raw) return t("threadCard.unknown");
      const names = raw.split(/,\s*/).flatMap((entry) => {
        const match = entry.trim().match(/^(.*?)\s*<([^>]+)>$/);
        const email = (match ? match[2]! : entry).trim().toLowerCase();
        if (email === accountEmail) return [];
        const name = match ? match[1]!.trim().replace(/^["']|["']$/g, "") : entry.trim();
        return [name || email];
      });
      return names.join(", ") || t("threadCard.unknown");
    }

    // allSenders is pre-filtered in SQL to exclude the account's own from_address.
    // Format: "Name <email>" or plain "email" — parse to do contactsMap lookup.
    // Do NOT use thread.fromAddress for contact lookup here: fromAddress comes from
    // the latest message, which may be the account's own reply, not the external sender.
    if (thread.allSenders) {
      const names = thread.allSenders.split(/,\s*/).map((entry) => {
        const match = entry.trim().match(/^(.*?)\s*<([^>]+)>$/);
        const email = (match ? match[2]! : entry).trim().toLowerCase();
        const fallbackName = match ? match[1]!.trim() : entry.trim();
        return contactsMap[email] || fallbackName || email;
      });
      return names.join(", ") || t("threadCard.unknown");
    }

    // Fallback: allSenders is null means every sender in the thread is the account itself
    // (e.g. self-sent email, or trashed before being categorised). Show recipients instead,
    // mirroring the isSent path so trash/draft threads don't show "sconosciuto".
    if (!thread.fromAddress || thread.fromAddress.toLowerCase() === accountEmail) {
      const raw = thread.allRecipients ?? "";
      if (raw) {
        const names = raw.split(/,\s*/).flatMap((entry) => {
          const match = entry.trim().match(/^(.*?)\s*<([^>]+)>$/);
          const email = (match ? match[2]! : entry).trim().toLowerCase();
          if (email === accountEmail) return [];
          const name = match ? match[1]!.trim().replace(/^["']|["']$/g, "") : entry.trim();
          return [contactsMap[email] || name || email];
        });
        const nameStr = names.join(", ");
        if (nameStr) return nameStr;
      }
      return t("threadCard.unknown");
    }
    return contactsMap[thread.fromAddress.toLowerCase()] ||
      thread.fromName ||
      thread.fromAddress ||
      t("threadCard.unknown");
  }, [account, isSent, thread.allRecipients, thread.allSenders, thread.fromName, thread.fromAddress, contactsMap]);

  // Read selectedThreadIds lazily for drag — avoids subscribing all cards to the Set reference
  const dragData: DragData = useMemo(() => ({
    threadIds: hasMultiSelect && isMultiSelected
      ? [...useThreadStore.getState().selectedThreadIds]
      : [thread.id],
    sourceLabel: activeLabel,
  }), [hasMultiSelect, isMultiSelected, thread.id, activeLabel]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `thread-${thread.id}`,
    data: dragData,
  });

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      e.preventDefault();
      selectThreadRange(thread.id);
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleThreadSelection(thread.id);
    } else if (hasMultiSelect) {
      toggleThreadSelection(thread.id);
    } else {
      onClick(thread);
    }
  };

  const handleContextMenu = onContextMenu
    ? (e: React.MouseEvent) => onContextMenu(e, thread.id)
    : undefined;
  const initial = (senderDisplay[0] ?? "?").toUpperCase();

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`${thread.isRead ? "" : t("threadCard.unreadPrefix")}email from ${senderDisplay}: ${thread.subject ?? t("threadCard.noSubject")}`}
      aria-selected={isSelected}
      className={`relative w-full text-left border-b border-border-secondary group hover-lift press-scale ${
        emailDensity === "compact" ? "pl-4 pr-3 py-1.5" : emailDensity === "spacious" ? "pl-5 pr-4 py-4" : "pl-5 pr-4 py-3"
      } ${
        isDragging
          ? "opacity-50"
          : isMultiSelected
            ? "bg-accent/10"
            : isSelected
              ? "bg-bg-selected"
              : "hover:bg-bg-hover"
      } ${isSpam ? "bg-red-500/8 dark:bg-red-500/10" : ""}`}
    >
      {accountColor && (
        <span
          className="absolute left-0 top-0 -bottom-px w-0.5"
          style={{ backgroundColor: accountColor }}
        />
      )}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className={`rounded-full flex items-center justify-center shrink-0 font-medium text-white ${
            emailDensity === "compact" ? "w-7 h-7 text-xs" : emailDensity === "spacious" ? "w-10 h-10 text-sm" : "w-9 h-9 text-sm"
          } ${
            isMultiSelected ? "bg-accent" : thread.isRead ? "bg-text-tertiary" : "bg-accent"
          }`}
        >
          {isMultiSelected ? <Check size={emailDensity === "compact" ? 14 : 16} /> : initial}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* First row: sender + date */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm truncate ${
                thread.isRead
                  ? "text-text-secondary"
                  : "font-semibold text-text-primary"
              }`}
            >
              {senderDisplay}
            </span>
            <span className="text-xs text-text-tertiary whitespace-nowrap shrink-0">
              {formatRelativeDate(thread.lastMessageAt)}
            </span>
          </div>

          {/* Subject */}
          <div
            className={`text-sm truncate mt-0.5 ${
              thread.isRead ? "text-text-secondary" : "text-text-primary"
            }`}
          >
            {thread.subject ?? t("threadCard.noSubject")}
          </div>

          {/* Snippet + indicators */}
          <div className={`flex items-center gap-1.5 mt-0.5 ${emailDensity === "compact" ? "hidden" : ""}`}>
            <span className="text-xs text-text-tertiary truncate flex-1">
              {decodeHtml(thread.snippet ?? "")}
            </span>
            {showCategoryBadge && category && category !== "Primary" && CATEGORY_COLORS[category] && (
              <span className={`shrink-0 text-[0.625rem] px-1.5 rounded-full leading-normal ${CATEGORY_COLORS[category]}`}>
                {category}
              </span>
            )}
            {hasFollowUp && (
              <span className="shrink-0 text-accent" title={t("threadCard.followUpReminder")}>
                <BellRing size={12} />
              </span>
            )}
            {!thread.isMuted && !thread.isHeatExtinguished && (thread.urgencyScore ?? 0) >= 0.6 && (
              <span className="shrink-0 text-danger" title={t("threadCard.highUrgency")}>
                <Zap size={12} className="fill-current" />
              </span>
            )}
            {!thread.isMuted && !thread.isHeatExtinguished && (thread.urgencyScore ?? 0) >= 0.3 && (thread.urgencyScore ?? 0) < 0.6 && (
              <span className="shrink-0 text-warning" title={t("threadCard.moderateUrgency")}>
                <Zap size={12} />
              </span>
            )}
            {!thread.isMuted && thread.isHeatExtinguished && (thread.urgencyScore ?? 0) === 0 && (
              <span className="shrink-0 text-success" title={t("threadCard.urgencyResolved")}>
                <Wind size={12} />
              </span>
            )}
            {thread.isMuted && (
              <span className="shrink-0 text-text-tertiary" title={t("threadCard.mutedUrgency")}>
                <VolumeX size={12} />
              </span>
            )}
            {thread.isPinned && (
              <span className="shrink-0 text-accent" title={t("threadCard.pinned")}>
                <Pin size={12} className="fill-current" />
              </span>
            )}
            {thread.hasAttachments && (
              <span className="shrink-0 text-text-tertiary" title={t("threadCard.hasAttachments")}>
                <Paperclip size={12} />
              </span>
            )}
            {thread.isStarred && (
              <span className="shrink-0 text-warning star-animate" title={t("threadCard.starred")}>
                <Star size={12} className="fill-current" />
              </span>
            )}
            {(thread.unreadCount > 0 || thread.messageCount > 1) && (
              <span className={`text-xs shrink-0 rounded-full px-1.5 ${thread.unreadCount > 0 ? "bg-accent text-white font-medium" : "bg-bg-tertiary text-text-tertiary"}`}>
                {thread.unreadCount > 0 ? `${thread.unreadCount}/${thread.messageCount}` : thread.messageCount}
              </span>
            )}
          </div>
        </div>
      </div>

    </button>
  );
});
