import { memo, useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Thread } from "@/stores/threadStore";
import { useThreadStore } from "@/stores/threadStore";
import { useUIStore } from "@/stores/uiStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { formatRelativeDate } from "@/utils/date";
import { Paperclip, Star, Check, Pin, BellRing, VolumeX, AlertCircle } from "lucide-react";
import type { DragData } from "@/components/dnd/DndProvider";

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
  urgency?: "low" | "medium" | "high" | null;
}

export const ThreadCard = memo(function ThreadCard({ thread, isSelected, onClick, onContextMenu, category, showCategoryBadge, hasFollowUp, urgency }: ThreadCardProps) {
  const isMultiSelected = useThreadStore((s) => s.selectedThreadIds.has(thread.id));
  const hasMultiSelect = useThreadStore((s) => s.selectedThreadIds.size > 0);
  const toggleThreadSelection = useThreadStore((s) => s.toggleThreadSelection);
  const selectThreadRange = useThreadStore((s) => s.selectThreadRange);
  const activeLabel = useActiveLabel();
  const emailDensity = useUIStore((s) => s.emailDensity);
  const isSpam = thread.labelIds.includes("SPAM");

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
  const initial = (
    thread.fromName?.[0] ??
    thread.fromAddress?.[0] ??
    "?"
  ).toUpperCase();

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`${thread.isRead ? "" : "Unread "}email from ${thread.fromName ?? thread.fromAddress ?? "Unknown"}: ${thread.subject ?? "(No subject)"}`}
      aria-selected={isSelected}
      className={`w-full text-left border-b border-border-secondary group hover-lift press-scale ${
        emailDensity === "compact" ? "px-3 py-1.5" : emailDensity === "spacious" ? "px-4 py-4" : "px-4 py-3"
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
              {thread.fromName ?? thread.fromAddress ?? "Unknown"}
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
            {thread.subject ?? "(No subject)"}
          </div>

          {/* Snippet + indicators */}
          <div className={`flex items-center gap-1.5 mt-0.5 ${emailDensity === "compact" ? "hidden" : ""}`}>
            <span className="text-xs text-text-tertiary truncate flex-1">
              {thread.snippet}
            </span>
            {showCategoryBadge && category && category !== "Primary" && CATEGORY_COLORS[category] && (
              <span className={`shrink-0 text-[0.625rem] px-1.5 rounded-full leading-normal ${CATEGORY_COLORS[category]}`}>
                {category}
              </span>
            )}
            {hasFollowUp && (
              <span className="shrink-0 text-accent" title="Follow-up reminder set">
                <BellRing size={12} />
              </span>
            )}
            {urgency === "high" && (
              <span className="shrink-0" title="High urgency">
                <AlertCircle className="w-2.5 h-2.5 text-red-500" />
              </span>
            )}
            {urgency === "medium" && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500 inline-block" title="Medium urgency" />
            )}
            {thread.isMuted && (
              <span className="shrink-0 text-warning" title="Muted">
                <VolumeX size={12} />
              </span>
            )}
            {thread.isPinned && (
              <span className="shrink-0 text-accent" title="Pinned">
                <Pin size={12} className="fill-current" />
              </span>
            )}
            {thread.hasAttachments && (
              <span className="shrink-0 text-text-tertiary" title="Has attachments">
                <Paperclip size={12} />
              </span>
            )}
            {thread.isStarred && (
              <span className="shrink-0 text-warning star-animate" title="Starred">
                <Star size={12} className="fill-current" />
              </span>
            )}
            {thread.messageCount > 1 && (
              <span className="text-xs text-text-tertiary shrink-0 bg-bg-tertiary rounded-full px-1.5">
                {thread.messageCount}
              </span>
            )}
          </div>
        </div>
      </div>

    </button>
  );
});
