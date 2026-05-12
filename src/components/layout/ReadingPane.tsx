import { useState, useEffect } from "react";
import { ThreadView } from "../email/ThreadView";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useSelectedThreadId } from "@/hooks/useRouteNavigation";
import { getThreadById, getThreadLabelIds } from "@/services/db/threads";
import { EmptyState } from "../ui/EmptyState";
import { ReadingPaneIllustration } from "../ui/illustrations";

export function ReadingPane() {
  const selectedThreadId = useSelectedThreadId();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const storeThread = useThreadStore((s) =>
    selectedThreadId ? s.threadMap.get(selectedThreadId) ?? null : null,
  );
  const [localThread, setLocalThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (storeThread) {
      setLocalThread(null);
      setLoading(false);
      return;
    }

    if (!selectedThreadId || !activeAccountId) {
      setLocalThread(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchThread = async () => {
      try {
        const dbThread = await getThreadById(activeAccountId, selectedThreadId);
        if (!dbThread || cancelled) return;

        const labelIds = await getThreadLabelIds(activeAccountId, selectedThreadId);
        if (cancelled) return;

        const mapped: Thread = {
          id: dbThread.id,
          accountId: dbThread.account_id,
          subject: dbThread.subject,
          snippet: dbThread.snippet,
          lastMessageAt: dbThread.last_message_at ?? 0,
          messageCount: dbThread.message_count,
          isRead: dbThread.is_read === 1,
          isStarred: dbThread.is_starred === 1,
          isPinned: dbThread.is_pinned === 1,
          isMuted: dbThread.is_muted === 1,
          hasAttachments: dbThread.has_attachments === 1,
          labelIds,
          fromName: dbThread.from_name,
          fromAddress: dbThread.from_address,
          urgencyScore: dbThread.urgency_score ?? 0,
          sentimentScore: dbThread.sentiment_score ?? 0,
          isHeatExtinguished: dbThread.is_heat_extinguished === 1,
        };

        setLocalThread(mapped);
      } catch (err) {
        console.error("Failed to fetch thread for reading pane:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchThread();
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, activeAccountId, storeThread]);

  const thread = storeThread || localThread;

  if (loading && !thread) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary/50 glass-panel">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col bg-bg-primary/50 glass-panel">
        <EmptyState
          illustration={ReadingPaneIllustration}
          title="Velo"
          subtitle="Select an email to read"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-bg-primary/50 overflow-hidden glass-panel">
      <ThreadView thread={thread} />
    </div>
  );
}
