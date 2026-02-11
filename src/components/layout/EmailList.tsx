import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { ThreadCard } from "../email/ThreadCard";
import { SearchBar } from "../search/SearchBar";
import { EmailListSkeleton } from "../ui/Skeleton";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { getThreadsForAccount, getThreadLabelIds, deleteThread as deleteThreadFromDb } from "@/services/db/threads";
import { getCategoriesForThreads, ALL_CATEGORIES } from "@/services/db/threadCategories";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { useLabelStore } from "@/stores/labelStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useComposerStore } from "@/stores/composerStore";
import { getMessagesForThread } from "@/services/db/messages";
import { Archive, Trash2, X, Ban, Search, UserPlus, CheckCircle2, Star, Clock, Send, FileEdit, ShieldCheck, Mail, Tag, Filter } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";

const PAGE_SIZE = 50;

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

export function EmailList({ width, listRef }: { width?: number; listRef?: React.Ref<HTMLDivElement> }) {
  const { threads, selectedThreadId, selectedThreadIds, isLoading, setThreads, selectThread, setLoading, removeThreads, clearMultiSelect, selectAll } =
    useThreadStore();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeLabel = useUIStore((s) => s.activeLabel);
  const readFilter = useUIStore((s) => s.readFilter);
  const setReadFilter = useUIStore((s) => s.setReadFilter);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const userLabels = useLabelStore((s) => s.labels);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(new Map());

  const openMenu = useContextMenuStore((s) => s.openMenu);
  const multiSelectCount = selectedThreadIds.size;

  const openComposer = useComposerStore((s) => s.openComposer);
  const multiSelectBarRef = useRef<HTMLDivElement>(null);

  const handleThreadContextMenu = useCallback((e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    openMenu("thread", { x: e.clientX, y: e.clientY }, { threadId });
  }, [openMenu]);

  const handleDraftClick = useCallback(async (thread: Thread) => {
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
        const match = drafts.find((d) => d.message.id === draftMsg.id);
        if (match) draftId = match.id;
      } catch {
        // If we can't get draft ID, composer will create a new draft on save
      }

      const to = draftMsg.to_addresses
        ? draftMsg.to_addresses.split(",").map((a) => a.trim()).filter(Boolean)
        : [];
      const cc = draftMsg.cc_addresses
        ? draftMsg.cc_addresses.split(",").map((a) => a.trim()).filter(Boolean)
        : [];
      const bcc = draftMsg.bcc_addresses
        ? draftMsg.bcc_addresses.split(",").map((a) => a.trim()).filter(Boolean)
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
  }, [activeAccountId, openComposer]);

  const handleBulkDelete = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const isTrashView = activeLabel === "trash";
    const ids = [...selectedThreadIds];
    // Optimistic: remove from UI immediately
    removeThreads(ids);
    try {
      const client = await getGmailClient(activeAccountId);
      for (const id of ids) {
        if (isTrashView) {
          await client.deleteThread(id);
          await deleteThreadFromDb(activeAccountId, id);
        } else {
          await client.modifyThread(id, ["TRASH"], ["INBOX"]);
        }
      }
    } catch (err) {
      console.error("Bulk delete failed:", err);
    }
  };

  const handleBulkArchive = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    // Optimistic: remove from UI immediately
    removeThreads(ids);
    try {
      const client = await getGmailClient(activeAccountId);
      for (const id of ids) {
        await client.modifyThread(id, undefined, ["INBOX"]);
      }
    } catch (err) {
      console.error("Bulk archive failed:", err);
    }
  };

  const handleBulkSpam = async () => {
    if (!activeAccountId || multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    const isSpamView = activeLabel === "spam";
    removeThreads(ids);
    try {
      const client = await getGmailClient(activeAccountId);
      for (const id of ids) {
        if (isSpamView) {
          await client.modifyThread(id, ["INBOX"], ["SPAM"]);
        } else {
          await client.modifyThread(id, ["SPAM"], ["INBOX"]);
        }
      }
    } catch (err) {
      console.error("Bulk spam failed:", err);
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
    // Apply category filter (inbox only)
    if (activeLabel === "inbox" && activeCategory !== "All") {
      filtered = filtered.filter((t) => {
        const cat = categoryMap.get(t.id);
        // Uncategorized threads show in Primary
        if (activeCategory === "Primary") return !cat || cat === "Primary";
        return cat === activeCategory;
      });
    }
    return filtered;
  }, [threads, readFilter, searchThreadIds, activeLabel, activeCategory, categoryMap]);

  const mapDbThreads = useCallback(async (dbThreads: Awaited<ReturnType<typeof getThreadsForAccount>>): Promise<Thread[]> => {
    return Promise.all(
      dbThreads.map(async (t) => {
        const labelIds = await getThreadLabelIds(t.account_id, t.id);
        return {
          id: t.id,
          accountId: t.account_id,
          subject: t.subject,
          snippet: t.snippet,
          lastMessageAt: t.last_message_at ?? 0,
          messageCount: t.message_count,
          isRead: t.is_read === 1,
          isStarred: t.is_starred === 1,
          isPinned: t.is_pinned === 1,
          hasAttachments: t.has_attachments === 1,
          labelIds,
          fromName: t.from_name,
          fromAddress: t.from_address,
        };
      }),
    );
  }, []);

  const clearSearch = useThreadStore((s) => s.clearSearch);

  const loadThreads = useCallback(async () => {
    if (!activeAccountId) {
      setThreads([]);
      return;
    }

    clearSearch();
    setLoading(true);
    setHasMore(true);
    try {
      const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
      const dbThreads = await getThreadsForAccount(
        activeAccountId,
        gmailLabelId || undefined,
        PAGE_SIZE,
        0,
      );

      const mapped = await mapDbThreads(dbThreads);
      setThreads(mapped);
      setHasMore(dbThreads.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load threads:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, activeLabel, setThreads, setLoading, mapDbThreads, clearSearch]);

  const loadMore = useCallback(async () => {
    if (!activeAccountId || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
      const offset = threads.length;
      const dbThreads = await getThreadsForAccount(
        activeAccountId,
        gmailLabelId || undefined,
        PAGE_SIZE,
        offset,
      );

      const mapped = await mapDbThreads(dbThreads);
      if (mapped.length > 0) {
        setThreads([...threads, ...mapped]);
      }
      setHasMore(dbThreads.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more threads:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [activeAccountId, activeLabel, threads, loadingMore, hasMore, setThreads, mapDbThreads]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Load categories when threads change (inbox only)
  useEffect(() => {
    if (activeLabel !== "inbox" || threads.length === 0 || !activeAccountId) {
      setCategoryMap(new Map());
      return;
    }
    getCategoriesForThreads(activeAccountId, threads.map((t) => t.id))
      .then(setCategoryMap)
      .catch(console.error);
  }, [threads, activeLabel, activeAccountId]);

  // Reset category tab when leaving inbox
  useEffect(() => {
    if (activeLabel !== "inbox") setActiveCategory("All");
  }, [activeLabel]);

  // Listen for sync completion to reload
  useEffect(() => {
    const handler = () => { loadThreads(); };
    window.addEventListener("velo-sync-done", handler);
    return () => window.removeEventListener("velo-sync-done", handler);
  }, [loadThreads]);

  // Infinite scroll: load more when near bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [loadMore]);

  return (
    <div
      ref={listRef}
      className={`flex flex-col bg-bg-secondary/50 glass-panel ${
        readingPanePosition === "right"
          ? "min-w-[240px] shrink-0"
          : readingPanePosition === "bottom"
            ? "w-full border-b border-border-primary h-[40%] min-h-[200px]"
            : "w-full flex-1"
      }`}
      style={readingPanePosition === "right" && width ? { width } : undefined}
    >
      {/* Search */}
      <div className="px-3 py-2 border-b border-border-secondary">
        <SearchBar />
      </div>

      {/* Header */}
      <div className="px-4 py-2 border-b border-border-primary flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary capitalize">
            {LABEL_MAP[activeLabel] !== undefined
              ? activeLabel
              : userLabels.find((l) => l.id === activeLabel)?.name ?? activeLabel}
          </h2>
          <span className="text-xs text-text-tertiary">
            {filteredThreads.length} conversation{filteredThreads.length !== 1 ? "s" : ""}
          </span>
        </div>
        <select
          value={readFilter}
          onChange={(e) => setReadFilter(e.target.value as "all" | "read" | "unread")}
          className="text-xs bg-bg-tertiary text-text-secondary px-2 py-1 rounded border border-border-primary"
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      {/* Category tabs (inbox only) */}
      {activeLabel === "inbox" && (
        <CategoryTabs activeCategory={activeCategory} onSelect={setActiveCategory} />
      )}

      {/* Multi-select action bar */}
      <CSSTransition nodeRef={multiSelectBarRef} in={multiSelectCount > 0} timeout={150} classNames="slide-down" unmountOnExit>
        <div ref={multiSelectBarRef} className="px-3 py-2 border-b border-border-primary bg-accent/5 flex items-center justify-between">
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {isLoading && threads.length === 0 ? (
          <EmailListSkeleton />
        ) : filteredThreads.length === 0 ? (
          <EmptyStateForContext
            searchQuery={searchQuery}
            activeAccountId={activeAccountId}
            activeLabel={activeLabel}
            readFilter={readFilter}
          />
        ) : (
          <>
            {filteredThreads.map((thread, idx) => {
              const prevThread = idx > 0 ? filteredThreads[idx - 1] : undefined;
              const showDivider = prevThread?.isPinned && !thread.isPinned;
              return (
                <div
                  key={thread.id}
                  className={idx < 15 ? "stagger-in" : undefined}
                  style={idx < 15 ? { animationDelay: `${idx * 30}ms` } : undefined}
                >
                  {showDivider && (
                    <div className="px-4 py-1.5 text-xs font-medium text-text-tertiary uppercase tracking-wider bg-bg-tertiary/50 border-b border-border-secondary">
                      Other emails
                    </div>
                  )}
                  <ThreadCard
                    thread={thread}
                    isSelected={thread.id === selectedThreadId}
                    onClick={() => {
                      if (activeLabel === "drafts") {
                        handleDraftClick(thread);
                      } else {
                        selectThread(thread.id);
                      }
                    }}
                    onContextMenu={(e) => handleThreadContextMenu(e, thread.id)}
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
                All conversations loaded
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CategoryTabs({ activeCategory, onSelect }: { activeCategory: string; onSelect: (cat: string) => void }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkOverflow();
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    el.addEventListener("scroll", checkOverflow, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", checkOverflow);
    };
  }, [checkOverflow]);

  // Update sliding indicator position when active category changes
  useEffect(() => {
    const el = tabRefs.current.get(activeCategory);
    if (el) {
      setIndicatorStyle({ left: el.offsetLeft, width: el.offsetWidth });
    }
  }, [activeCategory]);

  return (
    <div className="relative border-b border-border-secondary shrink-0">
      {/* Left fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-bg-secondary to-transparent z-10 pointer-events-none" />
      )}
      {/* Right fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-bg-secondary to-transparent z-10 pointer-events-none" />
      )}
      <div
        ref={scrollRef}
        className="flex px-2 overflow-x-auto hide-scrollbar relative"
      >
        {["All", ...ALL_CATEGORIES].map((cat) => (
          <button
            key={cat}
            ref={(el) => { if (el) tabRefs.current.set(cat, el); else tabRefs.current.delete(cat); }}
            onClick={(e) => {
              onSelect(cat);
              e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
            }}
            className={`px-2.5 py-1.5 text-xs font-medium transition-colors relative whitespace-nowrap ${
              activeCategory === cat
                ? "text-accent"
                : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            {cat}
          </button>
        ))}
        {/* Sliding indicator */}
        {indicatorStyle && (
          <span
            className="absolute bottom-0 h-0.5 bg-accent rounded-full transition-all duration-200 ease-out pointer-events-none"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          />
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
}: {
  searchQuery: string | null;
  activeAccountId: string | null;
  activeLabel: string;
  readFilter: string;
}) {
  if (searchQuery) {
    return <EmptyState icon={Search} title="No results found" subtitle="Try a different search term" />;
  }
  if (readFilter !== "all") {
    return <EmptyState icon={Filter} title={`No ${readFilter} emails`} subtitle="Try changing the filter" />;
  }
  if (!activeAccountId) {
    return <EmptyState icon={UserPlus} title="No account connected" subtitle="Add a Gmail account to get started" />;
  }

  switch (activeLabel) {
    case "inbox":
      return <EmptyState icon={CheckCircle2} title="You're all caught up" subtitle="No new conversations" />;
    case "starred":
      return <EmptyState icon={Star} title="No starred conversations" subtitle="Star emails to find them here" />;
    case "snoozed":
      return <EmptyState icon={Clock} title="No snoozed emails" subtitle="Snoozed emails will appear here" />;
    case "sent":
      return <EmptyState icon={Send} title="No sent messages" />;
    case "drafts":
      return <EmptyState icon={FileEdit} title="No drafts" />;
    case "trash":
      return <EmptyState icon={Trash2} title="Trash is empty" />;
    case "spam":
      return <EmptyState icon={ShieldCheck} title="No spam" subtitle="Looking good!" />;
    case "all":
      return <EmptyState icon={Mail} title="No emails yet" />;
    default:
      return <EmptyState icon={Tag} title="Nothing here" subtitle="No conversations with this label" />;
  }
}
