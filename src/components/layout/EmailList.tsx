import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { t } from "@/i18n";
import { SwipeableThreadCard } from "../email/SwipeableThreadCard";
import { CategoryTabs } from "../email/CategoryTabs";
import { SearchBar } from "../search/SearchBar";
import { AnswerPanel } from "../search/AnswerPanel";
import { EmailListSkeleton } from "../ui/Skeleton";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { useActiveLabel, useSelectedThreadId, useActiveCategory } from "@/hooks/useRouteNavigation";
import { navigateToThread, navigateToLabel } from "@/router/navigate";
import { getThreadsForAccount, getThreadsForCategory, getThreadLabelIds, deleteThread as deleteThreadFromDb, getUnifiedInboxThreads, getUnifiedFolderThreads, getThreadById, getThreadsByIdsBatch, getThreadLabelsByIdsBatch } from "@/services/db/threads";
import { getCategoriesForThreads, getCategoriesForThreadsGlobal, getCategoryUnreadCounts } from "@/services/db/threadCategories";
import { getActiveFollowUpThreadIds } from "@/services/db/followUpReminders";
import { getBundleRules, getHeldThreadIds, getBundleSummaries, type DbBundleRule } from "@/services/db/bundleRules";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { trashThread, permanentDeleteThread, archiveThread, spamThread } from "@/services/emailActions";
import { useLabelStore } from "@/stores/labelStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { DEFAULT_SMART_FOLDER_I18N_KEYS } from "@/services/db/smartFolders";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useComposerStore } from "@/stores/composerStore";
import { getMessagesForThread } from "@/services/db/messages";
import { getSmartFolderSearchQuery, mapSmartFolderRows, type SmartFolderRow } from "@/services/search/smartFolderQuery";
import { applyTemporalDecay } from "@/services/ai/reputationEngine";
import { getDecaySettings } from "@/services/ai/urgencyPipeline";
import { getDb } from "@/services/db/connection";
import { Archive, Trash2, X, Ban, Filter, ChevronRight, Package, FolderSearch, Clock } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { OutgoingQueueView } from "./OutgoingQueueView";
import { ScheduledEmailListView } from "./ScheduledEmailListView";
import {
  InboxClearIllustration,
  NoSearchResultsIllustration,
  NoAccountIllustration,
  GenericEmptyIllustration,
  ScheduledEmptyIllustration,
  SnoozedEmptyIllustration,
  DraftsEmptyIllustration,
  UnreadEmptyIllustration,
  StarredEmptyIllustration,
  StarredRecentIllustration,
} from "../ui/illustrations";

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
  scheduled: "SCHEDULED",
  all: "", // no filter
};

export function EmailList({ width, listRef }: { width?: number; listRef?: React.Ref<HTMLDivElement> }) {
  const threads = useThreadStore((s) => s.threads);
  const selectedThreadId = useSelectedThreadId();
  const selectedThreadIdRef = useRef(selectedThreadId);
  useEffect(() => { selectedThreadIdRef.current = selectedThreadId; }, [selectedThreadId]);
  const selectedThreadIds = useThreadStore((s) => s.selectedThreadIds);
  const isLoading = useThreadStore((s) => s.isLoading);
  const setThreads = useThreadStore((s) => s.setThreads);
  const setLoading = useThreadStore((s) => s.setLoading);
  const clearMultiSelect = useThreadStore((s) => s.clearMultiSelect);
  const selectAll = useThreadStore((s) => s.selectAll);
  const selectThread = useThreadStore((s) => s.selectThread);
  const threadMap = useThreadStore((s) => s.threadMap);
  const addThreads = useThreadStore((s) => s.addThreads);
  const setSelectedMessageId = useThreadStore((s) => s.setSelectedMessageId);
  const mergeSemanticResults = useThreadStore((s) => s.mergeSemanticResults);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setViewingAccountId = useAccountStore((s) => s.setViewingAccountId);
  useEffect(() => {
    if (!selectedThreadId) setViewingAccountId(null);
  }, [selectedThreadId, setViewingAccountId]);
  const accounts = useAccountStore((s) => s.accounts);

  const globalAccountIds = useMemo(
    () => accounts.filter((a) => a.includeInGlobal).map((a) => a.id),
    [accounts],
  );
  const activeLabel = useActiveLabel();
  const readFilter = useUIStore((s) => s.readFilter);
  const setReadFilter = useUIStore((s) => s.setReadFilter);
  const readingPanePosition = useUIStore((s) => s.readingPanePosition);
  const userLabels = useLabelStore((s) => s.labels);
  const scheduledCounts = useLabelStore((s) => s.scheduledCounts);
  const smartFolders = useSmartFolderStore((s) => s.folders);

  // Detect smart folder mode
  const isSmartFolder = activeLabel.startsWith("smart-folder:");
  const smartFolderId = isSmartFolder ? activeLabel.replace("smart-folder:", "") : null;
  const activeSmartFolder = smartFolderId ? smartFolders.find((f) => f.id === smartFolderId) ?? null : null;

  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const routerCategory = useActiveCategory();

  // In split mode, use the router's category; in unified mode, always use "All"
  const activeCategory = inboxViewMode === "split" ? routerCategory : "All";
  const setActiveCategory = inboxViewMode === "split"
    ? (cat: string) => navigateToLabel("inbox", { category: cat })
    : () => {};

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // Track the label that was last loaded to detect navigation vs. in-place refresh
  const loadedLabelRef = useRef<string>("");
  const [categoryMap, setCategoryMap] = useState<Map<string, string>>(() => new Map());
  const [categoryUnreadCounts, setCategoryUnreadCounts] = useState<Map<string, number>>(() => new Map());
  const [followUpThreadIds, setFollowUpThreadIds] = useState<Set<string>>(() => new Set());
  const [bundleRules, setBundleRules] = useState<DbBundleRule[]>([]);
  const [heldThreadIds, setHeldThreadIds] = useState<Set<string>>(() => new Set());
  const [expandedBundles, setExpandedBundles] = useState<Set<string>>(() => new Set());
  const [bundleSummaries, setBundleSummaries] = useState<Map<string, { count: number; latestSubject: string | null; latestSender: string | null }>>(() => new Map());

  const openMenu = useContextMenuStore((s) => s.openMenu);
  const multiSelectCount = selectedThreadIds.size;

  const openComposer = useComposerStore((s) => s.openComposer);
  const multiSelectBarRef = useRef<HTMLDivElement>(null);

  const handleThreadContextMenu = useCallback((e: React.MouseEvent, threadId: string) => {
    e.preventDefault();
    openMenu("thread", { x: e.clientX, y: e.clientY }, { threadId });
  }, [openMenu]);

  const handleDraftClick = useCallback(async (thread: Thread) => {
    const draftAccountId = activeAccountId ?? thread.accountId;
    if (!draftAccountId) return;
    try {
      const messages = await getMessagesForThread(draftAccountId, thread.id);
      // Get the last message (the draft)
      const draftMsg = messages[messages.length - 1];
      if (!draftMsg) return;

      // Look up the Gmail draft ID so auto-save can update the existing draft
      let draftId: string | null = null;
      try {
        const client = await getGmailClient(draftAccountId);
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

  const handleThreadClick = useCallback((thread: Thread) => {
    if (activeLabel === "drafts") {
      handleDraftClick(thread);
    } else {
      if (!activeAccountId) setViewingAccountId(thread.accountId);
      navigateToThread(thread.id);
    }
  }, [activeLabel, activeAccountId, setViewingAccountId, handleDraftClick]);

  const handleBulkDelete = async () => {
    if (multiSelectCount === 0) return;
    const isTrashView = activeLabel === "trash";
    const ids = [...selectedThreadIds];
    clearMultiSelect();
    await Promise.all(ids.map(async (id) => {
      const accountId = threadMap.get(id)?.accountId ?? activeAccountId;
      if (!accountId) return;
      if (isTrashView) {
        await permanentDeleteThread(accountId, id, []);
        await deleteThreadFromDb(accountId, id);
      } else {
        await trashThread(accountId, id, []);
      }
    }));
  };

  const handleBulkArchive = async () => {
    if (multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    clearMultiSelect();
    await Promise.all(ids.map(async (id) => {
      const accountId = threadMap.get(id)?.accountId ?? activeAccountId;
      if (!accountId) return;
      await archiveThread(accountId, id, []);
    }));
  };

  const handleBulkSpam = async () => {
    if (multiSelectCount === 0) return;
    const ids = [...selectedThreadIds];
    const isSpamView = activeLabel === "spam";
    clearMultiSelect();
    await Promise.all(ids.map(async (id) => {
      const accountId = threadMap.get(id)?.accountId ?? activeAccountId;
      if (!accountId) return;
      await spamThread(accountId, id, [], !isSpamView);
    }));
  };

  const searchResults = useThreadStore((s) => s.searchResults);
  const searchLoading = useThreadStore((s) => s.searchLoading);
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const isSearchActive = searchResults !== null;

  const filteredThreads = useMemo(() => {
    // When search is active, use searchResults directly — they may contain threads
    // from any folder/account, not just the current folder cache.
    let filtered: Thread[] = isSearchActive ? searchResults! : threads;
    // Apply read filter
    if (readFilter === "unread") filtered = filtered.filter((t) => !t.isRead);
    else if (readFilter === "read") filtered = filtered.filter((t) => t.isRead);
    return filtered;
  }, [threads, readFilter, searchResults, isSearchActive]);

  // Pre-compute bundled category Set for O(1) lookups in filter
  const bundledCategorySet = useMemo(
    () => new Set(bundleRules.map((r) => r.category)),
    [bundleRules],
  );

  // Memoize visible threads (excludes bundled/held threads in "All" inbox view).
  // When search is active bypass bundle/held filtering so every match is visible.
  const visibleThreads = useMemo(() => {
    if (activeLabel !== "inbox" || activeCategory !== "All" || isSearchActive) return filteredThreads;
    return filteredThreads.filter((t) => {
      const cat = categoryMap.get(t.id);
      if (cat && bundledCategorySet.has(cat)) return false;
      if (heldThreadIds.has(t.id)) return false;
      return true;
    });
  }, [filteredThreads, activeLabel, activeCategory, isSearchActive, categoryMap, bundledCategorySet, heldThreadIds]);

  const mapDbThreads = useCallback(async (dbThreads: Awaited<ReturnType<typeof getThreadsForAccount>>): Promise<Thread[]> => {
    const decay = await getDecaySettings();
    return Promise.all(
      dbThreads.map(async (t) => {
        const labelIds = await getThreadLabelIds(t.account_id, t.id);
        const lastMessageAt = t.last_message_at ?? 0;
        const rawUrgency = t.urgency_score ?? 0;
        const urgencyScore = applyTemporalDecay(rawUrgency, lastMessageAt, decay.decayStartDays, decay.decayFloorDays);
        return {
          id: t.id,
          accountId: t.account_id,
          subject: t.subject,
          snippet: t.snippet,
          lastMessageAt,
          messageCount: t.message_count,
          unreadCount: t.unread_count,
          isRead: t.is_read === 1,
          isStarred: t.is_starred === 1,
          isPinned: t.is_pinned === 1,
          isMuted: t.is_muted === 1,
          hasAttachments: t.has_attachments === 1,
          labelIds,
          fromName: t.from_name,
          fromAddress: t.from_address,
          allSenders: t.all_senders ?? null,
          allRecipients: t.all_recipients ?? null,
          urgencyScore,
          sentimentScore: t.sentiment_score ?? undefined,
          isHeatExtinguished: t.is_heat_extinguished === 1,
        };
      }),
    );
  }, []);

  const clearSearch = useThreadStore((s) => s.clearSearch);

  const handleCitationClick = useCallback(async (threadId: string, messageId?: string) => {
    const existingThread = threadMap.get(threadId);
    const accountIdForThread = activeAccountId ?? existingThread?.accountId;
    if (!accountIdForThread) return;
    if (!existingThread) {
      try {
        const dbThread = await getThreadById(accountIdForThread, threadId);
        if (dbThread) {
          const labelIds = await getThreadLabelIds(accountIdForThread, threadId);
          const lastMessageAt = dbThread.last_message_at ?? 0;
          const decay = await getDecaySettings();
          const urgencyScore = applyTemporalDecay(dbThread.urgency_score ?? 0, lastMessageAt, decay.decayStartDays, decay.decayFloorDays);
          const mapped: Thread = {
            id: dbThread.id,
            accountId: dbThread.account_id,
            subject: dbThread.subject,
            snippet: dbThread.snippet,
            lastMessageAt,
            messageCount: dbThread.message_count,
            unreadCount: dbThread.unread_count,
            isRead: dbThread.is_read === 1,
            isStarred: dbThread.is_starred === 1,
            isPinned: dbThread.is_pinned === 1,
            isMuted: dbThread.is_muted === 1,
            hasAttachments: dbThread.has_attachments === 1,
            labelIds,
            fromName: dbThread.from_name,
            fromAddress: dbThread.from_address,
            allSenders: dbThread.all_senders ?? null,
            allRecipients: dbThread.all_recipients ?? null,
            urgencyScore,
            sentimentScore: dbThread.sentiment_score ?? undefined,
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

  const handleSemanticResult = useCallback(async (result: { citations: Array<{ threadId: string; messageId?: string }>; hits: Array<{ account_id: string; thread_id: string }> }) => {
    const citedThreadIds = new Set(result.citations.map((c) => c.threadId));
    if (citedThreadIds.size === 0) return;
    const accountById = new Map(result.hits.map((h) => [h.thread_id, h.account_id]));
    const seen = new Set<string>();
    const pairs: Array<{ accountId: string; threadId: string }> = [];
    for (const threadId of citedThreadIds) {
      if (seen.has(threadId)) continue;
      seen.add(threadId);
      const accountId = accountById.get(threadId);
      if (accountId) pairs.push({ accountId, threadId });
    }
    try {
      const [dbThreads, labelsByKey] = await Promise.all([
        getThreadsByIdsBatch(pairs),
        getThreadLabelsByIdsBatch(pairs),
      ]);
      const threads: Thread[] = dbThreads.map((t) => ({
        id: t.id,
        accountId: t.account_id,
        subject: t.subject,
        snippet: t.snippet,
        lastMessageAt: t.last_message_at ?? 0,
        messageCount: t.message_count,
        unreadCount: t.unread_count,
        isRead: t.is_read === 1,
        isStarred: t.is_starred === 1,
        isPinned: t.is_pinned === 1,
        isMuted: t.is_muted === 1,
        hasAttachments: t.has_attachments === 1,
        labelIds: labelsByKey.get(`${t.account_id}:${t.id}`) ?? [],
        fromName: t.from_name,
        fromAddress: t.from_address,
        allSenders: t.all_senders,
        allRecipients: t.all_recipients ?? null,
        urgencyScore: t.urgency_score ?? undefined,
        sentimentScore: t.sentiment_score ?? undefined,
        isHeatExtinguished: t.is_heat_extinguished === 1,
      }));
      mergeSemanticResults(threads);
    } catch (err) {
      console.error("Failed to merge semantic search results:", err);
    }
  }, [mergeSemanticResults]);

  const loadThreads = useCallback(async () => {
    clearSearch();
    setLoading(true);
    setHasMore(true);

    // Detect navigation (label changed) vs. in-place refresh (sync/badge refresh).
    // On navigation: clear stale threads immediately so skeleton shows, and skip
    // preserving the previously-selected thread (which belongs to the old folder).
    const currentLabel = `${activeLabel}::${activeAccountId ?? ""}::${activeCategory}`;
    const isNavigation = loadedLabelRef.current !== currentLabel;
    if (isNavigation) {
      loadedLabelRef.current = currentLabel;
      setThreads([]);
    }

    // Guard against stale async loads: if the user navigated away while this
    // load was in flight, discard results rather than overwriting newer data.
    const isStale = () => loadedLabelRef.current !== currentLabel;

    // Smart folder: always handled first, regardless of account mode.
    // In global view pass all included account IDs; in single-account view pass the active ID.
    // If isSmartFolder but activeSmartFolder is null the store hasn't loaded yet — stay in
    // loading state and return. loadThreads will re-fire once the store is populated
    // (activeSmartFolder is a useCallback dep so its ref changes when folders arrive).
    if (isSmartFolder && !activeSmartFolder) {
      return; // setLoading(true) already called above; spinner stays until store is ready
    }
    if (isSmartFolder && activeSmartFolder) {
      const accountArg: string | string[] = activeAccountId ?? globalAccountIds;
      if (!activeAccountId && globalAccountIds.length === 0) {
        if (!isStale()) { setThreads([]); setLoading(false); }
        return;
      }
      try {
        const { sql, params } = getSmartFolderSearchQuery(
          activeSmartFolder.query,
          accountArg,
          PAGE_SIZE,
        );
        const db = await getDb();
        const rows = await db.select<SmartFolderRow[]>(sql, params);
        let mapped = await mapSmartFolderRows(rows);

        if (isStale()) return;

        // Only preserve the selected thread on in-place refreshes within the same folder.
        // On navigation the selected thread belongs to the previous folder and must not bleed in.
        if (!isNavigation) {
          const selId = selectedThreadIdRef.current;
          if (selId) {
            const prevThreads = useThreadStore.getState().threads;
            const currentThread = prevThreads.find((t) => t.id === selId);
            if (currentThread && !mapped.some((t) => t.id === selId)) {
              const originalIndex = prevThreads.findIndex((t) => t.id === selId);
              if (originalIndex !== -1) {
                mapped = [
                  ...mapped.slice(0, originalIndex),
                  currentThread,
                  ...mapped.slice(originalIndex),
                ];
              } else {
                mapped.push(currentThread);
              }
            }
          }
        }

        setThreads(mapped);
        setHasMore(false);
      } catch (err) {
        console.error("Failed to load smart folder threads:", err);
      } finally {
        if (!isStale()) setLoading(false);
      }
      return;
    }

    if (!activeAccountId) {
      // Global / unified view: load from all included accounts
      if (globalAccountIds.length === 0) {
        if (!isStale()) { setThreads([]); setLoading(false); }
        return;
      }
      try {
        let dbThreads: Awaited<ReturnType<typeof getUnifiedInboxThreads>>;
        if (activeLabel === "unified-inbox" || activeLabel === "inbox") {
          dbThreads = await getUnifiedInboxThreads(globalAccountIds, PAGE_SIZE, 0);
        } else {
          const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
          dbThreads = await getUnifiedFolderThreads(globalAccountIds, gmailLabelId || "", PAGE_SIZE, 0);
        }
        let mapped = await mapDbThreads(dbThreads);

        if (isStale()) return;

        if (!isNavigation) {
          const selId = selectedThreadIdRef.current;
          if (selId) {
            const prevThreads = useThreadStore.getState().threads;
            const currentThread = prevThreads.find((t) => t.id === selId);
            if (currentThread && !mapped.some((t) => t.id === selId)) {
              const originalIndex = prevThreads.findIndex((t) => t.id === selId);
              if (originalIndex !== -1) {
                mapped = [
                  ...mapped.slice(0, originalIndex),
                  currentThread,
                  ...mapped.slice(originalIndex),
                ];
              } else {
                mapped.push(currentThread);
              }
            }
          }
        }

        setThreads(mapped);
        setHasMore(dbThreads.length === PAGE_SIZE);
      } catch (err) {
        console.error("Failed to load unified threads:", err);
      } finally {
        if (!isStale()) setLoading(false);
      }
      return;
    }

    try {
      let dbThreads;
      if (activeLabel === "inbox" && activeCategory !== "All") {
        dbThreads = await getThreadsForCategory(activeAccountId, activeCategory, PAGE_SIZE, 0);
      } else {
        const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
        dbThreads = await getThreadsForAccount(
          activeAccountId,
          gmailLabelId || undefined,
          PAGE_SIZE,
          0,
        );
      }

      let mapped = await mapDbThreads(dbThreads);

      if (isStale()) return;

      if (!isNavigation) {
        const selId = selectedThreadIdRef.current;
        if (selId) {
          const prevThreads = useThreadStore.getState().threads;
          const currentThread = prevThreads.find((t) => t.id === selId);
          if (currentThread && !mapped.some((t) => t.id === selId)) {
            const originalIndex = prevThreads.findIndex((t) => t.id === selId);
            if (originalIndex !== -1) {
              mapped = [
                ...mapped.slice(0, originalIndex),
                currentThread,
                ...mapped.slice(originalIndex),
              ];
            } else {
              mapped.push(currentThread);
            }
          }
        }
      }

      setThreads(mapped);
      setHasMore(dbThreads.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load threads:", err);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [activeAccountId, globalAccountIds, activeLabel, activeCategory, isSmartFolder, activeSmartFolder, setThreads, setLoading, mapDbThreads, clearSearch]);

  const loadMore = useCallback(async () => {
    if ((!activeAccountId && globalAccountIds.length === 0) || loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const offset = threads.length;
      let dbThreads: Awaited<ReturnType<typeof getThreadsForAccount>>;
      if (!activeAccountId) {
        // Global view pagination
        if (activeLabel === "unified-inbox" || activeLabel === "inbox") {
          dbThreads = await getUnifiedInboxThreads(globalAccountIds, PAGE_SIZE, offset);
        } else {
          const gmailLabelId = LABEL_MAP[activeLabel] ?? activeLabel;
          dbThreads = await getUnifiedFolderThreads(globalAccountIds, gmailLabelId || "", PAGE_SIZE, offset);
        }
      } else if (activeLabel === "inbox" && activeCategory !== "All") {
        dbThreads = await getThreadsForCategory(activeAccountId, activeCategory, PAGE_SIZE, offset);
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
        setThreads([...threads, ...mapped]);
      }
      setHasMore(dbThreads.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load more threads:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [activeAccountId, globalAccountIds, activeLabel, activeCategory, threads, loadingMore, hasMore, setThreads, mapDbThreads]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Stable thread ID key — only changes when the actual set of thread IDs changes, not on every array reference
  const threadIdKey = useMemo(() => threads.map((t) => t.id).join(","), [threads]);

  // Load all thread metadata (categories, unread counts, follow-ups, bundles) in one coordinated effect
  useEffect(() => {
    let cancelled = false;

    const threadIds = threadIdKey ? threadIdKey.split(",") : [];
    const isInbox = activeLabel === "inbox";
    const isAllCategory = activeCategory === "All";

    if (!activeAccountId) {
      // Unified view: fetch categories for visible threads across all accounts
      if (threadIds.length > 0) {
        getCategoriesForThreadsGlobal(threadIds).then((result) => {
          if (!cancelled) setCategoryMap(result);
        }).catch(() => {
          if (!cancelled) setCategoryMap(new Map());
        });
      } else {
        setCategoryMap(new Map());
      }
      setCategoryUnreadCounts(new Map());
      setFollowUpThreadIds(new Set());
      setBundleRules([]);
      setHeldThreadIds(new Set());
      setBundleSummaries(new Map());
      return;
    }

    const loadMetadata = async () => {
      try {
        // Build all promises based on current view
        const promises: Promise<void>[] = [];

        // Categories: always fetch when there are threads, except inbox filtered to a specific category tab
        if ((!isInbox || isAllCategory) && threadIds.length > 0) {
          promises.push(
            getCategoriesForThreads(activeAccountId, threadIds).then((result) => {
              if (!cancelled) setCategoryMap(result);
            }),
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
            getActiveFollowUpThreadIds(activeAccountId, threadIds).then((result) => {
              if (!cancelled) setFollowUpThreadIds(result);
            }).catch(() => {
              if (!cancelled) setFollowUpThreadIds(new Set());
            }),
          );
        } else {
          setFollowUpThreadIds(new Set());
        }

        // Bundle rules + held threads (only for inbox)
        if (isInbox) {
          promises.push(
            getBundleRules(activeAccountId).then(async (rules) => {
              if (cancelled) return;
              const bundled = rules.filter((r) => r.is_bundled);
              setBundleRules(bundled);
              // Batch-fetch all summaries in 2 queries instead of 2N
              if (bundled.length > 0) {
                const summaries = await getBundleSummaries(activeAccountId, bundled.map((r) => r.category)).catch(() => new Map());
                if (!cancelled) setBundleSummaries(summaries);
              } else {
                if (!cancelled) setBundleSummaries(new Map());
              }
            }).catch(() => {
              if (!cancelled) setBundleRules([]);
            }),
          );
          promises.push(
            getHeldThreadIds(activeAccountId).then((result) => {
              if (!cancelled) setHeldThreadIds(result);
            }).catch(() => {
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
    return () => { cancelled = true; };
  }, [threadIdKey, activeLabel, activeCategory, activeAccountId]);

  // Auto-scroll selected thread into view (triggered by keyboard navigation)
  useEffect(() => {
    if (!selectedThreadId || !scrollContainerRef.current) return;
    const el = scrollContainerRef.current.querySelector(`[data-thread-id="${CSS.escape(selectedThreadId)}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedThreadId]);

  // Listen for sync completion to reload (debounced to avoid waterfall from multiple emitters)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => loadThreads(), 500);
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

      {/* AI Answer Panel — shown only when search query looks like a question */}
      <AnswerPanel
        query={searchQuery}
        accountId={activeAccountId}
        onCitationClick={handleCitationClick}
        onResult={handleSemanticResult}
      />

      {/* Header */}
      <div className="px-4 py-2 border-b border-border-primary flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary capitalize flex items-center gap-1.5">
            {isSmartFolder && <FolderSearch size={14} className="text-accent shrink-0" />}
            {activeLabel === "scheduled" && <Clock size={14} className="text-accent shrink-0" />}
            {isSmartFolder
              ? (() => {
                  if (!activeSmartFolder) return t("layout.emailList.smartFolder");
                  const key = DEFAULT_SMART_FOLDER_I18N_KEYS[activeSmartFolder.id];
                  return key ? t(key) : activeSmartFolder.name;
                })()
              : activeLabel === "inbox" && inboxViewMode === "split" && activeCategory !== "All"
                ? `${t("sidebar.nav.inbox")} — ${activeCategory}`
                : LABEL_MAP[activeLabel] !== undefined
                  ? t(`sidebar.nav.${activeLabel === "all" ? "allMail" : activeLabel}`)
                  : userLabels.find((l) => l.id === activeLabel)?.name ?? activeLabel}
          </h2>
          {activeLabel === "scheduled"
            ? (() => {
                const total = Object.values(scheduledCounts).reduce((s, n) => s + n, 0);
                return (
                  <span className="text-xs text-text-tertiary">
                    {total !== 1
                      ? t("layout.emailList.scheduledMailPlural", { count: total })
                      : t("layout.emailList.scheduledMail", { count: total })}
                  </span>
                );
              })()
            : (
              <span className="text-xs text-text-tertiary">
                {filteredThreads.length !== 1
                  ? t("layout.emailList.conversationsPlural", { count: filteredThreads.length })
                  : t("layout.emailList.conversations", { count: filteredThreads.length })}
              </span>
            )}
        </div>
        <select
          value={readFilter}
          onChange={(e) => setReadFilter(e.target.value as "all" | "read" | "unread")}
          className="text-xs bg-bg-tertiary text-text-secondary px-2 py-1 rounded border border-border-primary"
        >
          <option value="all">{t("layout.emailList.allEmails")}</option>
          <option value="unread">{t("layout.emailList.unreadOnly")}</option>
          <option value="read">{t("layout.emailList.readOnly")}</option>
        </select>
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
      <CSSTransition nodeRef={multiSelectBarRef} in={multiSelectCount > 0} timeout={150} classNames="slide-down" unmountOnExit>
        <div ref={multiSelectBarRef} className="px-3 py-2 border-b border-border-primary bg-accent/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text-primary">
              {t("layout.emailList.multiSelectBar", { count: multiSelectCount })}
            </span>
            {multiSelectCount < filteredThreads.length && (
              <button
                onClick={selectAll}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                {t("layout.emailList.selectAll")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleBulkArchive}
              title={t("layout.emailList.archive")}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Archive size={14} />
            </button>
            <button
              onClick={handleBulkDelete}
              title={t("layout.emailList.trash")}
              className="p-1.5 text-text-secondary hover:text-error hover:bg-bg-hover rounded transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={handleBulkSpam}
              title={activeLabel === "spam" ? t("search.commandPalette.notSpam") : t("search.commandPalette.reportSpam")}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <Ban size={14} />
            </button>
            <button
              onClick={clearMultiSelect}
              title={t("layout.emailList.clearSelection")}
              className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </CSSTransition>

      {/* Outgoing queue — replaces thread list for the "outgoing" label */}
      {activeLabel === "outgoing" && (
        <OutgoingQueueView accountId={activeAccountId} />
      )}

      {/* Scheduled emails — replaces thread list for the "scheduled" label */}
      {activeLabel === "scheduled" && (
        <ScheduledEmailListView accountId={activeAccountId} />
      )}

      {/* Thread list */}
      <div ref={scrollContainerRef} className={`flex-1 overflow-y-auto ${activeLabel === "outgoing" || activeLabel === "scheduled" ? "hidden" : ""}`}>
        {(isLoading && threads.length === 0) || (searchLoading && !isSearchActive) ? (
          <EmailListSkeleton />
        ) : filteredThreads.length === 0 && (isSearchActive || bundleRules.length === 0) ? (
          <EmptyStateForContext
            searchQuery={searchQuery}
            activeAccountId={activeAccountId}
            activeLabel={activeLabel}
            readFilter={readFilter}
            activeCategory={activeCategory}
            hasGlobalAccounts={globalAccountIds.length > 0}
          />
        ) : (
          <>
            {/* Bundle rows for "All" inbox view */}
            {activeLabel === "inbox" && activeCategory === "All" && bundleRules.map((rule) => {
              const summary = bundleSummaries.get(rule.category);
              if (!summary || summary.count === 0) return null;
              const isExpanded = expandedBundles.has(rule.category);
              const bundledThreads = isExpanded
                ? filteredThreads.filter((t) => categoryMap.get(t.id) === rule.category)
                : [];
              return (
                <div key={`bundle-${rule.category}`}>
                  <button
                    onClick={() => {
                      setExpandedBundles((prev) => {
                        const next = new Set(prev);
                        if (next.has(rule.category)) next.delete(rule.category);
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
                        {summary.latestSender && `${summary.latestSender}: `}{summary.latestSubject ?? ""}
                      </span>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`text-text-tertiary transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>
                  {isExpanded && bundledThreads.map((thread) => (
                    <div key={thread.id} className="pl-4">
                      <SwipeableThreadCard
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
                      {t("layout.emailList.otherEmails")}
                    </div>
                  )}
                  <SwipeableThreadCard
                    thread={thread}
                    isSelected={thread.id === selectedThreadId}
                    onClick={handleThreadClick}
                    onContextMenu={handleThreadContextMenu}
                    category={categoryMap.get(thread.id)}
                    showCategoryBadge={activeLabel !== "inbox" || activeCategory === "All"}
                    hasFollowUp={followUpThreadIds.has(thread.id)}
                  />
                </div>
              );
            })}
            {loadingMore && (
              <div className="px-4 py-3 text-center text-xs text-text-tertiary">
                {t("layout.emailList.loadingMore")}
              </div>
            )}
            {!hasMore && threads.length > PAGE_SIZE && (
              <div className="px-4 py-3 text-center text-xs text-text-tertiary">
                {t("layout.emailList.allLoaded")}
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
  hasGlobalAccounts,
}: {
  searchQuery: string | null;
  activeAccountId: string | null;
  activeLabel: string;
  readFilter: string;
  activeCategory: string;
  hasGlobalAccounts: boolean;
}) {
  if (searchQuery) {
    return <EmptyState illustration={NoSearchResultsIllustration} title={t("layout.emailList.emptySearch.title")} subtitle={t("layout.emailList.emptySearch.subtitle")} />;
  }
  if (readFilter !== "all") {
    return <EmptyState icon={Filter} title={t("layout.emailList.emptyFilter.title", { filter: readFilter })} subtitle={t("layout.emailList.emptyFilter.subtitle")} />;
  }
  if (!activeAccountId && !hasGlobalAccounts) {
    return <EmptyState illustration={NoAccountIllustration} title={t("layout.emailList.emptyNoAccount.title")} subtitle={t("layout.emailList.emptyNoAccount.subtitle")} />;
  }

  switch (activeLabel) {
    case "unified-inbox":
    case "inbox":
      if (activeCategory !== "All") {
        const categoryMessages: Record<string, { title: string; subtitle: string }> = {
          Primary: { title: t("layout.emailList.emptyPrimary.title"), subtitle: t("layout.emailList.emptyPrimary.subtitle") },
          Updates: { title: t("layout.emailList.emptyUpdates.title"), subtitle: t("layout.emailList.emptyUpdates.subtitle") },
          Promotions: { title: t("layout.emailList.emptyPromotions.title"), subtitle: t("layout.emailList.emptyPromotions.subtitle") },
          Social: { title: t("layout.emailList.emptySocial.title"), subtitle: t("layout.emailList.emptySocial.subtitle") },
          Newsletters: { title: t("layout.emailList.emptyNewsletters.title"), subtitle: t("layout.emailList.emptyNewsletters.subtitle") },
        };
        const msg = categoryMessages[activeCategory];
        if (msg) return <EmptyState illustration={InboxClearIllustration} title={msg.title} subtitle={msg.subtitle} />;
      }
      return <EmptyState illustration={InboxClearIllustration} title={t("layout.emailList.emptyInbox.title")} subtitle={t("layout.emailList.emptyInbox.subtitle")} />;
    case "starred":
      return <EmptyState illustration={StarredEmptyIllustration} title={t("layout.emailList.emptyStarred.title")} subtitle={t("layout.emailList.emptyStarred.subtitle")} />;
    case "snoozed":
      return <EmptyState illustration={SnoozedEmptyIllustration} title={t("layout.emailList.emptySnoozed.title")} subtitle={t("layout.emailList.emptySnoozed.subtitle")} />;
    case "scheduled":
      return <EmptyState illustration={ScheduledEmptyIllustration} title={t("layout.emailList.emptyScheduled.title")} subtitle={t("layout.emailList.emptyScheduled.subtitle")} />;
    case "sent":
      return <EmptyState illustration={GenericEmptyIllustration} title={t("layout.emailList.emptySent.title")} />;
    case "drafts":
      return <EmptyState illustration={DraftsEmptyIllustration} title={t("layout.emailList.emptyDrafts.title")} />;
    case "trash":
      return <EmptyState illustration={GenericEmptyIllustration} title={t("layout.emailList.emptyTrash.title")} />;
    case "spam":
      return <EmptyState illustration={GenericEmptyIllustration} title={t("layout.emailList.emptySpam.title")} subtitle={t("layout.emailList.emptySpam.subtitle")} />;
    case "all":
      return <EmptyState illustration={GenericEmptyIllustration} title={t("layout.emailList.emptyAll.title")} />;
    default:
      if (activeLabel === "smart-folder:sf-unread") {
        return <EmptyState illustration={UnreadEmptyIllustration} title={t("layout.emailList.emptyUnread.title")} subtitle={t("layout.emailList.emptyUnread.subtitle")} />;
      }
      if (activeLabel === "smart-folder:sf-starred-recent") {
        return <EmptyState illustration={StarredRecentIllustration} title={t("layout.emailList.emptyStarredRecent.title")} subtitle={t("layout.emailList.emptyStarredRecent.subtitle")} />;
      }
      if (activeLabel.startsWith("smart-folder:")) {
        return <EmptyState icon={FolderSearch} title={t("layout.emailList.emptySmartFolder.title")} subtitle={t("layout.emailList.emptySmartFolder.subtitle")} />;
      }
      return <EmptyState illustration={GenericEmptyIllustration} title={t("layout.emailList.emptyLabel.title")} subtitle={t("layout.emailList.emptyLabel.subtitle")} />;
  }
}
