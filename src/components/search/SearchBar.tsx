import { useState, useRef, useCallback, useEffect } from "react";
import { t } from "@/i18n";
import {
  searchMessages,
  searchSendersByLabel,
  searchSentRecipients,
  type SenderSuggestion,
  type RecipientSuggestion,
} from "@/services/db/search";
import {
  getThreadsByIdsBatch,
  getThreadLabelsByIdsBatch,
} from "@/services/db/threads";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore, type Thread } from "@/stores/threadStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { useComposerStore } from "@/stores/composerStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { InputDialog } from "@/components/ui/InputDialog";
import { Search, X, FolderPlus, Pencil, User } from "lucide-react";

const SEARCH_HIT_LIMIT = 100;

export function SearchBar() {
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const openComposer = useComposerStore((s) => s.openComposer);
  const activeLabel = useActiveLabel();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const senderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [senderSuggestions, setSenderSuggestions] = useState<SenderSuggestion[]>([]);
  const [recipientSuggestions, setRecipientSuggestions] = useState<RecipientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);

  // Which suggestion mode applies to the current folder
  const suggestionMode: "from" | "to" | null = (() => {
    if (activeLabel === "inbox" || activeLabel === "unified-inbox") return "from";
    if (activeLabel === "all") return "from";
    if (activeLabel === "sent") return "to";
    return null;
  })();

  const allSuggestions: Array<{ label: string; address: string; name: string | null; operator: "from" | "to" }> =
    suggestionMode === "from"
      ? senderSuggestions.map((s) => ({ label: s.from_address, address: s.from_address, name: s.from_name, operator: "from" as const }))
      : suggestionMode === "to"
        ? recipientSuggestions.map((s) => ({ label: s.address, address: s.address, name: s.name, operator: "to" as const }))
        : [];

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const handleSaveAsSmartFolder = useCallback(() => {
    if (useThreadStore.getState().searchQuery.trim().length < 2) return;
    setShowSaveModal(true);
  }, []);

  const hideSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setActiveSuggestionIdx(-1);
  }, []);

  const applySuggestion = useCallback(
    (suggestion: { address: string; operator: "from" | "to" }) => {
      const value = `${suggestion.operator}:${suggestion.address}`;
      hideSuggestions();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (senderDebounceRef.current) clearTimeout(senderDebounceRef.current);
      setSenderSuggestions([]);

      const store = useThreadStore.getState();
      store.setSearch(value, null);
      store.setSearchResults(null);
      store.setSearchLoading(true);

      if (textareaRef.current) {
        textareaRef.current.value = value;
        resizeTextarea(textareaRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        const isStale = () => useThreadStore.getState().searchQuery !== value;
        try {
          const hits = await searchMessages(value, activeAccountId ?? undefined, SEARCH_HIT_LIMIT);
          if (isStale()) return;
          await hydrateAndStore(hits, value, isStale);
        } catch (err) {
          console.error("Search failed:", err);
          if (!isStale()) {
            useThreadStore.getState().setSearchResults([]);
            useThreadStore.getState().setSearchLoading(false);
          }
        }
      }, 0);
    },
    [activeAccountId, hideSuggestions],
  );

  async function hydrateAndStore(
    hits: Awaited<ReturnType<typeof searchMessages>>,
    value: string,
    isStale: () => boolean,
  ) {
    if (hits.length === 0) {
      useThreadStore.getState().setSearchResults([]);
      useThreadStore.getState().setSearchLoading(false);
      useThreadStore.getState().setSearch(value, new Set());
      return;
    }

    const seen = new Set<string>();
    const uniquePairs: Array<{ accountId: string; threadId: string }> = [];
    const orderByThreadId = new Map<string, number>();
    for (const h of hits) {
      if (seen.has(h.thread_id)) continue;
      seen.add(h.thread_id);
      orderByThreadId.set(h.thread_id, uniquePairs.length);
      uniquePairs.push({ accountId: h.account_id, threadId: h.thread_id });
    }

    const [dbThreads, labelsByKey] = await Promise.all([
      getThreadsByIdsBatch(uniquePairs),
      getThreadLabelsByIdsBatch(uniquePairs),
    ]);
    if (isStale()) return;

    const mapped: Thread[] = dbThreads.map((t) => ({
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

    mapped.sort((a, b) => {
      const ai = orderByThreadId.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderByThreadId.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });

    if (isStale()) return;
    useThreadStore.getState().setSearch(value, new Set(mapped.map((t) => t.id)));
    useThreadStore.getState().setSearchResults(mapped);
    useThreadStore.getState().setSearchLoading(false);
  }

  const handleChange = useCallback(
    (value: string) => {
      const store = useThreadStore.getState();

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (senderDebounceRef.current) clearTimeout(senderDebounceRef.current);

      store.setSearch(value, null);
      store.setSearchResults(null);
      store.setSearchLoading(false);

      // Hide suggestions if the user already typed the relevant operator
      const hasFromOp = /(?:^|\s)from:/i.test(value);
      const hasToOp = /(?:^|\s)to:/i.test(value);
      const operatorAlreadyTyped = (suggestionMode === "from" && hasFromOp) || (suggestionMode === "to" && hasToOp);
      if (!value.trim() || operatorAlreadyTyped || !suggestionMode) {
        hideSuggestions();
        setSenderSuggestions([]);
        setRecipientSuggestions([]);
      }

      if (value.trim().length < 1) {
        return;
      }

      // Contact suggestions: fast debounce, only when mode is active and operator not yet typed
      if (suggestionMode && !operatorAlreadyTyped) {
        senderDebounceRef.current = setTimeout(async () => {
          if (useThreadStore.getState().searchQuery !== value) return;
          if (suggestionMode === "from") {
            const labelId = activeLabel === "all" ? null : "INBOX";
            const suggestions = await searchSendersByLabel(value.trim(), activeAccountId, labelId, 6);
            if (useThreadStore.getState().searchQuery !== value) return;
            setSenderSuggestions(suggestions);
            setRecipientSuggestions([]);
            setShowSuggestions(suggestions.length > 0);
          } else {
            const suggestions = await searchSentRecipients(value.trim(), activeAccountId, 6);
            if (useThreadStore.getState().searchQuery !== value) return;
            setRecipientSuggestions(suggestions);
            setSenderSuggestions([]);
            setShowSuggestions(suggestions.length > 0);
          }
          setActiveSuggestionIdx(-1);
        }, 100);
      }

      if (value.trim().length < 2) {
        return;
      }

      store.setSearchLoading(true);

      debounceRef.current = setTimeout(async () => {
        const isStale = () => useThreadStore.getState().searchQuery !== value;
        try {
          const hits = await searchMessages(value, activeAccountId ?? undefined, SEARCH_HIT_LIMIT);
          if (isStale()) return;
          await hydrateAndStore(hits, value, isStale);
        } catch (err) {
          console.error("Search failed:", err);
          if (!isStale()) {
            useThreadStore.getState().setSearchResults([]);
            useThreadStore.getState().setSearchLoading(false);
          }
        }
      }, 200);
    },
    [activeAccountId, activeLabel, suggestionMode, hideSuggestions],
  );

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (senderDebounceRef.current) clearTimeout(senderDebounceRef.current);
    hideSuggestions();
    setSenderSuggestions([]);
    setRecipientSuggestions([]);
    useThreadStore.getState().clearSearch();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    textareaRef.current?.focus();
  }, [hideSuggestions]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && allSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => Math.min(i + 1, allSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIdx((i) => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Enter" && activeSuggestionIdx >= 0) {
        e.preventDefault();
        applySuggestion(allSuggestions[activeSuggestionIdx]!);
        return;
      }
      if (e.key === "Escape") {
        hideSuggestions();
        return;
      }
    }

    if (e.key === "Escape") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (senderDebounceRef.current) clearTimeout(senderDebounceRef.current);
      hideSuggestions();
      setSenderSuggestions([]);
      useThreadStore.getState().clearSearch();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      textareaRef.current?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
    }
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        hideSuggestions();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [hideSuggestions]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1" ref={containerRef}>
        <Search
          size={14}
          className="absolute left-2.5 top-[0.625rem] text-text-tertiary pointer-events-none"
        />
        <textarea
          ref={textareaRef}
          rows={1}
          value={searchQuery}
          onChange={(e) => {
            resizeTextarea(e.target);
            handleChange(e.target.value);
          }}
          onFocus={() => {
            if (allSuggestions.length > 0) setShowSuggestions(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("search.placeholder")}
          className="w-full bg-bg-tertiary text-text-primary text-sm pl-8 pr-10 py-1.5 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary resize-none leading-5 overflow-hidden"
          style={{ minHeight: "2rem", maxHeight: "6rem" }}
        />
        {searchQuery && (
          <div className="absolute right-2 top-[0.375rem] flex items-center gap-1">
            {searchQuery.trim().length >= 2 && (
              <button
                onClick={handleSaveAsSmartFolder}
                className="text-text-tertiary hover:text-accent transition-colors"
                title={t("search.saveAsSmartFolder")}
              >
                <FolderPlus size={14} />
              </button>
            )}
            <button
              onClick={handleClear}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Contact suggestions dropdown */}
        {showSuggestions && allSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-secondary border border-border-primary rounded-md shadow-lg overflow-hidden">
            <div className="px-2.5 py-1.5 text-[10px] font-medium text-text-tertiary uppercase tracking-wider border-b border-border-primary">
              {suggestionMode === "to" ? t("search.recipients") : t("search.senders")}
            </div>
            {allSuggestions.map((s, i) => (
              <button
                key={s.address}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                onMouseEnter={() => setActiveSuggestionIdx(i)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left transition-colors ${
                  i === activeSuggestionIdx
                    ? "bg-accent/10 text-text-primary"
                    : "text-text-primary hover:bg-bg-tertiary"
                }`}
              >
                <User size={13} className="text-text-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  {s.name
                    ? <span className="text-sm font-medium truncate block">{s.name}</span>
                    : <span className="text-sm truncate block">{s.address}</span>
                  }
                  {s.name && (
                    <span className="text-xs text-text-secondary truncate block">{s.address}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => {
          const { selectedThreadId, threadMap } = useThreadStore.getState();
          const threadAccountId = selectedThreadId
            ? (threadMap.get(selectedThreadId)?.accountId ?? null)
            : null;
          const fallbackAccountId = threadAccountId
            ?? activeAccountId
            ?? accounts.find((a) => a.includeInGlobal)?.id
            ?? undefined;
          openComposer({ accountId: fallbackAccountId });
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shrink-0"
        title={t("search.composeNew")}
      >
        <Pencil size={14} />
      </button>
      <InputDialog
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSubmit={(values) => {
          useSmartFolderStore
            .getState()
            .createFolder(
              values.name!.trim(),
              useThreadStore.getState().searchQuery.trim(),
              activeAccountId ?? undefined,
            );
        }}
        title="Save as Smart Folder"
        fields={[
          { key: "name", label: "Name", defaultValue: searchQuery.trim() },
        ]}
        submitLabel="Save"
      />
    </div>
  );
}
