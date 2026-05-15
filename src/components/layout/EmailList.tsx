import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { ThreadCard } from "../email/ThreadCard";
import { SwipeableThreadCard } from "../email/SwipeableThreadCard";
import { CategoryTabs } from "../email/CategoryTabs";
import { SearchBar } from "../search/SearchBar";
import { AnswerPanel } from "../search/AnswerPanel";
import { EmailListSkeleton } from "../ui/Skeleton";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import {
  useActiveLabel,
  useSelectedThreadId,
  useActiveCategory,
} from "@/hooks/useRouteNavigation";
import { navigateToThread, navigateToLabel } from "@/router/navigate";
import {
  getThreadsForAccount,
  getThreadsForCategory,
  getThreadById,
  getThreadLabelIds,
  getThreadIdsForLabel,
  deleteThread as deleteThreadFromDb,
} from "@/services/db/threads";
import {
  getCategoriesForThreads,
  getCategoryUnreadCounts,
} from "@/services/db/threadCategories";
import { getActiveFollowUpThreadIds } from "@/services/db/followUpReminders";
import { applyTemporalDecay } from "@/services/ai/reputationEngine";
import { getSetting } from "@/services/db/settings";
import {
  archiveThread,
  trashThread,
  permanentDeleteThread,
  spamThread,
  markThreadRead,
} from "@/services/emailActions";
import {
  getBundleRules,
  getHeldThreadIds,
  getBundleSummaries,
  type DbBundleRule,
} from "@/services/db/bundleRules";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { useLabelStore, type Label } from "@/stores/labelStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useComposerStore } from "@/stores/composerStore";
import { getMessagesForThread } from "@/services/db/messages";
import {
  getSmartFolderSearchQuery,
  mapSmartFolderRows,
  type SmartFolderRow,
} from "@/services/search/smartFolderQuery";
import { getDb } from "@/services/db/connection";
import {
  Archive,
  Trash2,
  X,
  Ban,
  Filter,
  ChevronRight,
  Package,
  FolderSearch,
  Mail,
  MailOpen,
} from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import {
  InboxClearIllustration,
  NoSearchResultsIllustration,
  NoAccountIllustration,
  GenericEmptyIllustration,
} from "../ui/illustrations";
import { scrollTracker } from "@/utils/scrollTracker";

const PAGE_SIZE = 50;
const MAX_THREAD_STORE_SIZE = 500;

// Map sidebar labels to Gmail label IDs
const LABEL_MAP: Record<string, string> = {
  inbox: "INBOX",
  starred: "STARRED",
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
  spam: "SPAM",
  snoozed: "SNOOZED",
  all: "", // no filter
};

export function EmailList({
  width,
  listRef,
}: {
  width?: number;
  listRef?: React.Ref<HTMLDivElement>;
}) {
  const threads = useThreadStore((s) => s.threads);
  const selectedThreadId = useSelectedThreadId();
  const selectedThreadIds = useThreadStore((s) => s.selectedThreadIds);
  const isLoading = useThreadStore((s) => s.isLoading);
  const setThreads = useThreadStore((s) => s.setThreads);
  const setLoading = useThreadStore((s) => s.setLoading);
  const removeThreads = useThreadStore((s) => s.removeThreads);
const selectThread = useThreadStore((s) => s.selectThread);
   const clearMultiSelect = useThreadStore((s) => s.clearMultiSelect);
   const setSelectedMessageId = useThreadStore((s) => s.setSelectedMessageId);
  const selectAll = useThreadStore((s) => s.selectAll);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useActiveLabel();
  const readFilter = useUIStore((s) => s.readFilter);
  const setReadFilter = useUIStore((s) => s.setReadFilter);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const userLabels = useLabelStore((s) => s.labels);
  const smartFolders = useSmartFolderStore((s) => s.folders);

  // Detect smart folder mode
  const isSmartFolder = activeLabel.startsWith("smart-folder:");
  const smartFolderId = isSmartFolder
    ? activeLabel.replace("smart-folder:", "")
    : null;
  const activeSmartFolder = smartFolderId
    ? (smartFolders.find((f) => f.id === smartFolderId) ?? null)
    : null;

  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const routerCategory = useActiveCategory();

  // In split mode, use the router's category; in unified mode, always use "All"
  const activeCategory = inboxViewMode === "split" ? routerCategory : "All";
  const setActiveCategory =
    inboxViewMode === "split"
      ? (cat: string) => navigateToLabel("inbox", { category: cat })
      : () => { };

const [hasMore, setHasMore] = useState(true);
   const [loadingMore, setLoadingMore] = useState(false);
   const scrollContainerRef = useRef<HTMLDivElement | null>(null);
   const [isScrolling, setIsScrolling] = useState(false);
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [categoryUnreadCounts, setCategoryUnreadCounts] = useState<
    Map<string, number>
  >(() => new Map());
  const [followUpThreadIds, setFollowUpThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bundleRules, setBundleRules] = useState<DbBundleRule[]>([]);
  const [heldThreadIds, setHeldThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(
    () => new Set(),
  );
  const [bundleSummaries, setBundleSummaries] = useState<
    Map<
      string,
      {
        count: number;
        latestSubject: string | null;
        latestSender: string | null;
      }
    >
  >(() => new Map());

  const openMenu = useContextMenuStore((s) => s.openMenu);
  const multiSelectCount = selectedThreadIds.size;

  const openComposer = useComposerStore((s) => s.openComposer);
  const multiSelectBarRef = useRef<HTMLDivElement>(null);

  const handleThreadContextMenu = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      e.preventDefault();
      openMenu("thread", { x: e.clientX, y: e.clientY }, { threadId });
    },
    [openMenu],
  );

  const handleDraftClick = useCallback(
    async (thread: Thread) => {
      if (!activeAccountId) return;
      try {
        const messages = await getMessagesForThread(activeAccountId, thread.id);
        // Get the last message (the draft)
        const draftMsg = messages[messages.length - 1];
        if (!draftMsg) return;

        // Look up the Gmail draft ID so auto-save can update the existing draft
        let draftId: string | null = null;
        try {
          const client = await getGmailClient(activeAccountId);
          const drafts = await client.listDrafts();
          const match = drafts.find((d: any) => d.message.id === draftMsg.id);
          if (match) draftId = match.id;
        } catch {
          // If we can't get draft ID, composer will create a new draft on save
        }

        const to = draftMsg.to_addresses
          ? draftMsg.to_addresses
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
          : [];
        const cc = draftMsg.cc_addresses
          ? draftMsg.cc_addresses
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
          : [];
        const bcc = draftMsg.bcc_addresses
          ? draftMsg.bcc_addresses
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean)
          : [];

        openComposer({
          mode: "new",
          to,
          cc,
          bcc,
          subject: draftMsg.subject ?? "",
          bodyHtml: draftMsg.body_html ?? draftMsg.body_text ?? "",
          threadId: thread.id,
          draftId,
        });
      } catch (err) {
        console.error("Failed to open draft:", err);
      }
    },
    [activeAccountId, openComposer],
  );

  const handleThreadClick = useCallback(
    (thread: Thread) => {
      if (activeLabel === "drafts") {
        handleDraftClick(thread);
      } else {
        navigateToThread(thread.id);
      }
    },
    [activeLabel, handleDraftClick],
  );

  const handleBulkDelete = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const isTrashView = activeLabel === "trash";
    const ids = [...selectedThreadIds];

    // Optimistic remove is handled by executeEmailAction, but for bulk
    // we do it here for immediate feedback since we process them in parallel
    removeThreads(ids);
    clearMultiSelect();

    try {
      await Promise.all(
        ids.map(async (id) => {
          if (isTrashView) {
            await permanentDeleteThread(activeAccountId, id, []);
            await deleteThreadFromDb(activeAccountId, id);
          } else {
            await trashThread(activeAccountId, id, []);
          }
        }),
      );
    } catch (err) {
      console.error("Bulk delete failed:", err);
      // Next sync will restore any that failed
    }
  };

  const handleBulkArchive = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    removeThreads(ids);
    clearMultiSelect();

    try {
      await Promise.all(
        ids.map((id) => archiveThread(activeAccountId, id, [])),
      );
    } catch (err) {
      console.error("Bulk archive failed:", err);
    }
  };

  const handleBulkSpam = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    const isSpamView = activeLabel === "spam";
    removeThreads(ids);
    clearMultiSelect();

    try {
      await Promise.all(
        ids.map((id) => spamThread(activeAccountId, id, [], !isSpamView)),
      );
    } catch (err) {
      console.error("Bulk spam failed:", err);
    }
  };

  const handleBulkMarkRead = async (read: boolean) => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    clearMultiSelect();
    try {
      await Promise.all(
        ids.map((id) => markThreadRead(activeAccountId, id, [], read)),
      );
    } catch (err) {
      console.error(`Bulk mark ${read ? "read" : "unread"} failed:`, err);
    }
  };

  const handleBulkMarkAllSpamRead = async () => {
    if (!activeAccountId || activeLabel !== "spam") return;
    try {
      const allSpamThreadIds = await getThreadIdsForLabel(
        activeAccountId,
        "SPAM",
      );
      if (allSpamThreadIds.length === 0) return;
      await Promise.all(
        allSpamThreadIds.map((id) =>
          markThreadRead(activeAccountId, id, [], true),
        ),
      );
    } catch (err) {
      console.error("Bulk mark all spam as read failed:", err);
    }
  };

  const handleBulkMoveAllSpamToTrash = async () => {
    if (!activeAccountId || activeLabel !== "spam") return;
    try {
      const allSpamThreadIds = await getThreadIdsForLabel(
        activeAccountId,
        "SPAM",
      );
      if (allSpamThreadIds.length === 0) return;
      removeThreads(allSpamThreadIds);
      await Promise.all(
        allSpamThreadIds.map((id) => trashThread(activeAccountId, id, [])),
      );
    } catch (err) {
      console.error("Bulk move all spam to trash failed:", err);
    }
  };

  const handleBulkMarkAllTrashRead = async () => {
    if (!activeAccountId || activeLabel !== "trash") return;
    try {
      const allTrashThreadIds = await getThreadIdsForLabel(
        activeAccountId,
        "TRASH",
      );
      if (allTrashThreadIds.length === 0) return;
      await Promise.all(
        allTrashThreadIds.map((id) =>
          markThreadRead(activeAccountId, id, [], true),
        ),
      );
    } catch (err) {
      console.error("Bulk mark all trash as read failed:", err);
    }
  };

  const handleBulkEmptyTrash = async () => {
    if (!activeAccountId || activeLabel !== "trash") return;
    try {
      const allTrashThreadIds = await getThreadIdsForLabel(
        activeAccountId,
        "TRASH",
      );
      if (allTrashThreadIds.length === 0) return;
      removeThreads(allTrashThreadIds);
      await Promise.all(
        allTrashThreadIds.map((id) =>
          permanentDeleteThread(activeAccountId, id, []),
        ),
      );
    } catch (err) {
      console.error("Bulk empty trash failed:", err);
    }
  };

  const searchThreadIds = useThreadStore((s) => s.searchThreadIds);
  const searchQuery = useThreadStore((s) => s.searchQuery);

  const filteredThreads = useMemo(() => {
    let filtered = threads;
    // Apply search filter
    if (searchThreadIds !== null) {
      filtered = filtered.filter((t) => searchThreadIds.has(t.id));
    }
    // Apply read filter
    if (readFilter === "unread") filtered = filtered.filter((t) => !t.isRead);
    else if (readFilter === "read") filtered = filtered.filter((t) => t.isRead);
    // Category filtering is now server-side (Phase 4) — no client-side filter needed
    return filtered;
  }, [threads, readFilter, searchThreadIds]);

  // Pre-compute bundled category Set for O(1) lookups in filter
  const bundledCategorySet = useMemo(
    () => new Set(bundleRules.map((r) => r.category)),
    [bundleRules],
  );

  // Memoize visible threads (excludes bundled/held threads in "All" inbox view)
  const visibleThreads = useMemo(() => {
    if (activeLabel !== "inbox" || activeCategory !== "All")
      return filteredThreads;
    return filteredThreads.filter((t) => {
      const cat = categoryMap.get(t.id);
      if (cat && bundledCategorySet.has(cat)) return false;
      if (heldThreadIds.has(t.id)) return false;
      return true;
    });
  }, [
    filteredThreads,
    activeLabel,
    activeCategory,
    categoryMap,
    bundledCategorySet,
    heldThreadIds,
  ]);

  const mapDbThreads = useCallback(
    async (
      dbThreads: Awaited<ReturnType<typeof getThreadsForAccount>>,
    ): Promise<Thread[]> => {
      const [decayStartRaw, decayFloorRaw, behaviorEnabledRaw, urgencyEnabledRaw] = await Promise.all([
        getSetting("ai_urgency_decay_start_days"),
        getSetting("ai_urgency_decay_floor_days"),
        getSetting("ai_behavior_enabled"),
        getSetting("ai_urgency_enabled"),
      ]);
      const decayStart = parseInt(decayStartRaw ?? "20", 10);
      const decayFloor = parseInt(decayFloorRaw ?? "30", 10);
      const urgencyActive = behaviorEnabledRaw !== "false" && urgencyEnabledRaw !== "false";

      return Promise.all(
        dbThreads.map(async (t) => {
          const labelIds = await getThreadLabelIds(t.account_id, t.id);
          const alwaysRead =
            labelIds.includes("DRAFT") || labelIds.includes("TRASH");
          const lastMessageAt = t.last_message_at ?? 0;
          const rawUrgency = t.urgency_score ?? 0;
          const decayedUrgency = !urgencyActive || t.is_heat_extinguished === 1
            ? 0
            : applyTemporalDecay(rawUrgency, lastMessageAt * 1000, decayStart, decayFloor);
          const urgencyScore = t.is_muted === 1 ? Math.min(decayedUrgency, 0.05) : decayedUrgency;
          return {
            id: t.id,
            accountId: t.account_id,
            subject: t.subject,
            snippet: t.snippet,
            lastMessageAt,
            messageCount: t.message_count,
            isRead: alwaysRead || t.is_read === 1,
            isStarred: t.is_starred === 1,
            isPinned: t.is_pinned === 1,
            isMuted: t.is_muted === 1,
            hasAttachments: t.has_attachments === 1,
            labelIds,
            fromName: t.from_name,
            fromAddress: t.from_address,
            urgencyScore,
            sentimentScore: t.sentiment_score ?? 0,
            isHeatExtinguished: t.is_heat_extinguished === 1,
          };
        }),
      );
    },
    [],
  );

  const clearSearch = useThreadStore((s) => s.clearSearch);

  const threadMap = useThreadStore((s) => s.threadMap);
  const addThreads = useThreadStore((s) => s.addThreads);

  const handleCitationClick = useCallback(async (threadId: string, messageId?: string) => {
    if (!activeAccountId) return;

    // Ensure thread is in store so it shows up in the list and can be highlighted
    if (!threadMap.has(threadId)) {
      try {
        const dbThread = await getThreadById(activeAccountId, threadId);
        if (dbThread) {
          const labelIds = await getThreadLabelIds(activeAccountId, threadId);
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
          addThreads([mapped]);
        }
      } catch (err) {
        console.error("Failed to fetch thread for citation click:", err);
      }
    }

    selectThread(threadId);
    clearMultiSelect();
    navigateToThread(threadId);
    if (messageId) {
      setSelectedMessageId(messageId);
    }
  }, [activeAccountId, threadMap, addThreads, selectThread, clearMultiSelect, setSelectedMessageId]);

  const loadThreads = useCallback(async (keepSearch = false) => {
    if (!activeAccountId) {
      setThreads([]);
      return;
    }

    if (!keepSearch) clearSearch();
    setLoading(true);
    setHasMore(true);
    try {
      // Smart folder query path
      if (isSmartFolder && activeSmartFolder) {
        const { sql, params } = getSmartFolderSearchQuery(
          activeSmartFolder.query,
          activeAccountId,
          PAGE_SIZE,
        );
        const db = await getDb();
        const rows = await db.select<SmartFolderRow[]>(sql, params);
        const mapped = await mapSmartFolderRows(rows);
        setThreads(mapped);
        setHasMore(false); // Smart folders load all at once
      } else {
        let dbThreads;
        // Server-side category filtering for inbox
        if (activeLabel === "inbox" && activeCategory !== "All") {
          dbThreads = await getThreadsForCategory(
            activeAccountId,
            activeCategory,
            PAGE_SIZE,
            0,
          );
        } else {
          const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
          dbThreads = await getThreadsForAccount(
            activeAccountId,
            gmailLabelId || undefined,
            PAGE_SIZE,
            0,
          );
        }

        const mapped = await mapDbThreads(dbThreads);
        setThreads(mapped);
        setHasMore(dbThreads.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error("Failed to load threads:", err);
    } finally {
      setLoading(false);
    }
  }, [
    activeAccountId,
    activeLabel,
    activeCategory,
    isSmartFolder,
    activeSmartFolder,
    setThreads,
    setLoading,
    mapDbThreads,
    clearSearch,
  ]);

  const loadMore = useCallback(async () => {
    if (!activeAccountId || loadingMore || !hasMore) return;
    if (threads.length >= MAX_THREAD_STORE_SIZE) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const offset = threads.length;
      let dbThreads;
      if (activeLabel === "inbox" && activeCategory !== "All") {
        dbThreads = await getThreadsForCategory(
          activeAccountId,
          activeCategory,
          PAGE_SIZE,
          offset,
        );
      } else {
        const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
        dbThreads = await getThreadsForAccount(
          activeAccountId,
          gmailLabelId || undefined,
          PAGE_SIZE,
          offset,
        );
      }

      const mapped = await mapDbThreads(dbThreads);
      if (mapped.length > 0) {
        // Deduplicate: prevent threads that shifted positions (due to a sync)
        // from appearing twice when loading more pages.
        const existingIds = new Set(threads.map((t) => t.id));
        const newThreads = mapped.filter((t) => !existingIds.has(t.id));
        if (newThreads.length > 0) {
          setThreads([...threads, ...newThreads]);
        }
      }
      setHasMore(dbThreads.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more threads:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeAccountId,
    activeLabel,
    activeCategory,
    threads,
    loadingMore,
    hasMore,
    setThreads,
    mapDbThreads,
  ]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Stable thread ID key — only changes when the actual set of thread IDs changes, not on every array reference
  const threadIdKey = useMemo(
    () => threads.map((t) => t.id).join(","),
    [threads],
  );

  // Load all thread metadata (categories, unread counts, follow-ups, bundles) in one coordinated effect
  useEffect(() => {
    let cancelled = false;

    if (!activeAccountId) {
      setCategoryMap(new Map());
      setCategoryUnreadCounts(new Map());
      setFollowUpThreadIds(new Set());
      setBundleRules([]);
      setHeldThreadIds(new Set());
      setBundleSummaries(new Map());
      return;
    }

    const threadIds = threadIdKey ? threadIdKey.split(",") : [];
    const isInbox = activeLabel === "inbox";
    const isAllCategory = activeCategory === "All";

    const loadMetadata = async () => {
      try {
        // Build all promises based on current view
        const promises: Promise<void>[] = [];

        // Categories (only for inbox "All" tab with threads)
        if (isInbox && isAllCategory && threadIds.length > 0) {
          promises.push(
            getCategoriesForThreads(activeAccountId, threadIds).then(
              (result) => {
                if (!cancelled) setCategoryMap(result);
              },
            ),
          );
        } else {
          setCategoryMap(new Map());
        }

        // Unread counts (only for inbox)
        if (isInbox) {
          promises.push(
            getCategoryUnreadCounts(activeAccountId).then((result) => {
              if (!cancelled) setCategoryUnreadCounts(result);
            }),
          );
        } else {
          setCategoryUnreadCounts(new Map());
        }

        // Follow-up indicators
        if (threadIds.length > 0) {
          promises.push(
            getActiveFollowUpThreadIds(activeAccountId, threadIds)
              .then((result) => {
                if (!cancelled) setFollowUpThreadIds(result);
              })
              .catch(() => {
                if (!cancelled) setFollowUpThreadIds(new Set());
              }),
          );
        } else {
          setFollowUpThreadIds(new Set());
        }

        // Bundle rules + held threads (only for inbox)
        if (isInbox) {
          promises.push(
            getBundleRules(activeAccountId)
              .then(async (rules) => {
                if (cancelled) return;
                const bundled = rules.filter((r) => r.is_bundled);
                setBundleRules(bundled);
                // Batch-fetch all summaries in 2 queries instead of 2N
                if (bundled.length > 0) {
                  const summaries = await getBundleSummaries(
                    activeAccountId,
                    bundled.map((r) => r.category),
                  ).catch(() => new Map());
                  if (!cancelled) setBundleSummaries(summaries);
                } else {
                  if (!cancelled) setBundleSummaries(new Map());
                }
              })
              .catch(() => {
                if (!cancelled) setBundleRules([]);
              }),
          );
          promises.push(
            getHeldThreadIds(activeAccountId)
              .then((result) => {
                if (!cancelled) setHeldThreadIds(result);
              })
              .catch(() => {
                if (!cancelled) setHeldThreadIds(new Set());
              }),
          );
        } else {
          setBundleRules([]);
          setHeldThreadIds(new Set());
          setBundleSummaries(new Map());
        }

        await Promise.all(promises);
      } catch (err) {
        console.error("Failed to load thread metadata:", err);
      }
    };

    loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [threadIdKey, activeLabel, activeCategory, activeAccountId]);

  // Auto-scroll selected thread into view (triggered by keyboard navigation)
  useEffect(() => {
    if (!selectedThreadId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(
      `[data-thread-id="${CSS.escape(selectedThreadId)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedThreadId]);

  // Listen for sync completion to reload (debounced to avoid waterfall from multiple emitters)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadThreads(true), 500);
    };
    window.addEventListener("velo-sync-done", handler);
    return () => {
      window.removeEventListener("velo-sync-done", handler);
      if (timer) clearTimeout(timer);
    };
  }, [loadThreads, activeAccountId, activeLabel]);

// Infinite scroll: load more when near bottom
 useEffect(() => {
   const container = scrollContainerRef.current;
   if (!container) return;

   let scrollTimer: ReturnType<typeof setTimeout>;
   
   const handleScroll = () => {
     scrollTracker.markScroll();
     setIsScrolling(true);
     clearTimeout(scrollTimer);
     scrollTimer = setTimeout(() => setIsScrolling(false), 1500);
     
     const { scrollTop, scrollHeight, clientHeight } = container;
     if (scrollHeight - scrollTop - clientHeight < 200) {
       loadMore();
     }
   };

   container.addEventListener("scroll", handleScroll, { passive: true });
   return () => {
     clearTimeout(scrollTimer);
     container.removeEventListener("scroll", handleScroll);
   };
 }, [loadMore]);

  return (
    <div
      ref={listRef}
      className={`flex flex-col bg-bg-secondary/50 glass-panel ${readingPanePosition === "right"
          ? "min-w-60 shrink-0"
          : readingPanePosition === "bottom"
            ? "w-full border-b border-border-primary h-[40%] min-h-50"
            : "w-full flex-1"
        }`}
      style={readingPanePosition === "right" && width ? { width } : undefined}
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-border-secondary">
        <SearchBar />
      </div>

      {/* AI Answer Panel — shown only when search query looks like a question */}
      <AnswerPanel
        query={searchQuery}
        accountId={activeAccountId}
        onCitationClick={handleCitationClick}
      />

      {/* Header */}
      <div data-tauri-drag-region className="px-4 py-2 border-b border-border-primary flex items-center justify-between">
        <div data-tauri-drag-region>
          <h2 className="text-sm font-semibold text-text-primary capitalize flex items-center gap-1.5">
            {isSmartFolder && (
              <FolderSearch size={14} className="text-accent shrink-0" />
            )}
            {isSmartFolder
              ? (activeSmartFolder?.name ?? "Smart Folder")
              : activeLabel === "inbox" &&
                inboxViewMode === "split" &&
                activeCategory !== "All"
                ? `Inbox — ${activeCategory}`
                : LABEL_MAP[activeLabel] !== undefined
                  ? activeLabel
                  : (userLabels.find((l: Label) => l.id === activeLabel)
                    ?.name ?? activeLabel)}
          </h2>
          <span className="text-xs text-text-tertiary">
            {filteredThreads.length} conversation
            {filteredThreads.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {" "}
          {/* New wrapper div for buttons and select */}
          {activeLabel === "spam" && (
            <>
              <button
                onClick={handleBulkMarkAllSpamRead}
                title="Mark all spam as read"
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
              >
                <MailOpen size={14} />
              </button>
              <button
                onClick={handleBulkMoveAllSpamToTrash}
                title="Move all spam to trash"
                className="p-1.5 text-text-secondary hover:text-error hover:bg-bg-hover rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          {activeLabel === "trash" && (
            <>
              <button
                onClick={handleBulkMarkAllTrashRead}
                title="Mark all trash as read"
                className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
              >
                <MailOpen size={14} />
              </button>
              <button
                onClick={handleBulkEmptyTrash}
                title="Empty trash"
                className="p-1.5 text-text-secondary hover:text-error hover:bg-bg-hover rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <select
            value={readFilter}
            onChange={(e) =>
              setReadFilter(e.target.value as "all" | "read" | "unread")
            }
            className="text-xs bg-bg-tertiary text-text-secondary px-2 py-1 rounded border border-border-primary"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>
      </div>

      {/* Category tabs (inbox + split mode only) */}
      {activeLabel === "inbox" && inboxViewMode === "split" && (
        <CategoryTabs
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          unreadCounts={Object.fromEntries(categoryUnreadCounts)}
        />
      )}

      {/* Multi-select action bar */}
      <CSSTransition
        nodeRef={multiSelectBarRef}
        in={multiSelectCount > 0}
        timeout={150}
        classNames="slide-down"
        unmountOnExit
      >
        <div
          ref={multiSelectBarRef}
          className="px-3 py-2 border-b border-border-primary bg-accent/5 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {multiSelectCount} selected
            </span>
            {multiSelectCount < filteredThreads.length && (
              <button
                onClick={selectAll}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                Select all
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleBulkArchive}
              title="Archive selected"
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Archive size={14} />
            </button>
            <button
              onClick={handleBulkDelete}
              title="Delete selected"
              className="p-1.5 text-text-secondary hover:text-error hover:bg-bg-hover rounded transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => handleBulkMarkRead(true)}
              title="Mark as read"
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <MailOpen size={14} />
            </button>
            <button
              onClick={() => handleBulkMarkRead(false)}
              title="Mark as unread"
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Mail size={14} />
            </button>
            <button
              onClick={handleBulkSpam}
              title={activeLabel === "spam" ? "Not spam" : "Report spam"}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Ban size={14} />
            </button>
            <button
              onClick={clearMultiSelect}
              title="Clear selection"
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </CSSTransition>

{/* Thread list */}
       <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto ${isScrolling ? 'scrollbar-visible' : 'scrollbar-hidden'}`}>
         {isLoading && threads.length === 0 ? (
          <EmailListSkeleton />
        ) : filteredThreads.length === 0 && bundleRules.length === 0 ? (
          <EmptyStateForContext
            searchQuery={searchQuery}
            activeAccountId={activeAccountId}
            activeLabel={activeLabel}
            readFilter={readFilter}
            activeCategory={activeCategory}
          />
        ) : (
          <>
            {/* Bundle rows for "All" inbox view */}
            {activeLabel === "inbox" &&
              activeCategory === "All" &&
              bundleRules.map((rule) => {
                const summary = bundleSummaries.get(rule.category);
                if (!summary || summary.count === 0) return null;
                const isExpanded = expandedBundles.has(rule.category);
                const bundledThreads = isExpanded
                  ? filteredThreads.filter(
                    (t) => categoryMap.get(t.id) === rule.category,
                  )
                  : [];
                return (
                  <div key={`bundle-${rule.category}`}>
                    <button
                      onClick={() => {
                        setExpandedBundles((prev) => {
                          const next = new Set(prev);
                          if (next.has(rule.category))
                            next.delete(rule.category);
                          else next.add(rule.category);
                          return next;
                        });
                      }}
                      className="w-full text-left px-4 py-3 border-b border-border-secondary hover:bg-bg-hover transition-colors flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                        <Package size={16} className="text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">
                            {rule.category}
                          </span>
                          <span className="text-xs bg-accent/15 text-accent px-1.5 rounded-full">
                            {summary.count}
                          </span>
                        </div>
                        <span className="text-xs text-text-tertiary truncate block mt-0.5">
                          {summary.latestSender && `${summary.latestSender}: `}
                          {summary.latestSubject ?? ""}
                        </span>
                      </div>
                      <ChevronRight
                        size={14}
                        className={`text-text-tertiary transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                      />
                    </button>
                    {isExpanded &&
                      bundledThreads.map((thread) => (
                        <div key={thread.id} className="pl-4">
                          <ThreadCard
                            thread={thread}
                            isSelected={thread.id === selectedThreadId}
                            onClick={handleThreadClick}
                            onContextMenu={handleThreadContextMenu}
                            category={rule.category}
                            hasFollowUp={followUpThreadIds.has(thread.id)}
                          />
                        </div>
                      ))}
                  </div>
                );
              })}
            {visibleThreads.map((thread, idx) => {
              const prevThread = idx > 0 ? filteredThreads[idx - 1] : undefined;
              const showDivider = prevThread?.isPinned && !thread.isPinned;
return (
                 <div
                   key={thread.id}
                   data-thread-id={thread.id}
                   className={idx < 15 ? "stagger-in" : undefined}
                   style={idx < 15 ? { animationDelay: `${idx * 30}ms` } : undefined}
                 >
                  {showDivider && (
                    <div className="px-4 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider bg-bg-tertiary/50 border-b border-border-secondary">
                      Other emails
                    </div>
                  )}
                  <SwipeableThreadCard
                    thread={thread}
                    isSelected={thread.id === selectedThreadId}
                    onClick={handleThreadClick}
                    onContextMenu={handleThreadContextMenu}
                    category={categoryMap.get(thread.id)}
                    showCategoryBadge={
                      activeLabel === "inbox" && activeCategory === "All"
                    }
                    hasFollowUp={followUpThreadIds.has(thread.id)}
                  />
                </div>
              );
            })}
            {loadingMore && (
              <div className="px-4 py-3 text-center text-xs text-text-tertiary">
                Loading more...
              </div>
            )}
            {!hasMore && threads.length > PAGE_SIZE && (
              <div className="px-4 py-3 text-center text-xs text-text-tertiary">
                {threads.length >= MAX_THREAD_STORE_SIZE
                  ? `Showing ${MAX_THREAD_STORE_SIZE} conversations. Use search to find older ones.`
                  : "All conversations loaded"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyStateForContext({
  searchQuery,
  activeAccountId,
  activeLabel,
  readFilter,
  activeCategory,
}: {
  searchQuery: string | null;
  activeAccountId: string | null;
  activeLabel: string;
  readFilter: string;
  activeCategory: string;
}) {
  if (searchQuery) {
    return (
      <EmptyState
        illustration={NoSearchResultsIllustration}
        title="No results found"
        subtitle="Try a different search term"
      />
    );
  }
  if (readFilter !== "all") {
    return (
      <EmptyState
        icon={Filter}
        title={`No ${readFilter} emails`}
        subtitle="Try changing the filter"
      />
    );
  }
  if (!activeAccountId) {
    return (
      <EmptyState
        illustration={NoAccountIllustration}
        title="No account connected"
        subtitle="Add a Gmail account to get started"
      />
    );
  }

  switch (activeLabel) {
    case "inbox":
      if (activeCategory !== "All") {
        const categoryMessages: Record<
          string,
          { title: string; subtitle: string }
        > = {
          Primary: {
            title: "Primary is clear",
            subtitle: "No important conversations",
          },
          Updates: {
            title: "No updates",
            subtitle: "Notifications and transactional emails appear here",
          },
          Promotions: {
            title: "No promotions",
            subtitle: "Marketing and promotional emails appear here",
          },
          Social: {
            title: "No social emails",
            subtitle: "Social network notifications appear here",
          },
          Newsletters: {
            title: "No newsletters",
            subtitle: "Newsletters and subscriptions appear here",
          },
        };
        const msg = categoryMessages[activeCategory];
        if (msg)
          return (
            <EmptyState
              illustration={InboxClearIllustration}
              title={msg.title}
              subtitle={msg.subtitle}
            />
          );
      }
      return (
        <EmptyState
          illustration={InboxClearIllustration}
          title="You're all caught up"
          subtitle="No new conversations"
        />
      );
    case "starred":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="No starred conversations"
          subtitle="Star emails to find them here"
        />
      );
    case "snoozed":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="No snoozed emails"
          subtitle="Snoozed emails will appear here"
        />
      );
    case "sent":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="No sent messages"
        />
      );
    case "drafts":
      return (
        <EmptyState illustration={GenericEmptyIllustration} title="No drafts" />
      );
    case "trash":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="Trash is empty"
        />
      );
    case "spam":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="No spam"
          subtitle="Looking good!"
        />
      );
    case "all":
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="No emails yet"
        />
      );
    default:
      if (activeLabel.startsWith("smart-folder:")) {
        return (
          <EmptyState
            icon={FolderSearch}
            title="No matching emails"
            subtitle="Try adjusting the smart folder query"
          />
        );
      }
      return (
        <EmptyState
          illustration={GenericEmptyIllustration}
          title="Nothing here"
          subtitle="No conversations with this label"
        />
      );
  }
}
