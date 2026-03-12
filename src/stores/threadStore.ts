import { create } from "zustand";

export interface Thread {
  id: string;
  accountId: string;
  subject: string | null;
  snippet: string | null;
  lastMessageAt: number;
  messageCount: number;
  isRead: boolean;
  isStarred: boolean;
  isPinned: boolean;
  isMuted: boolean;
  hasAttachments: boolean;
  labelIds: string[];
  fromName: string | null;
  fromAddress: string | null;
}

/** Composite key that uniquely identifies a thread across accounts */
export function threadKey(t: { accountId: string; id: string }): string {
  return `${t.accountId}:${t.id}`;
}

/** Parse a composite thread key back into accountId and threadId */
export function parseThreadKey(key: string): { accountId: string; threadId: string } {
  const idx = key.indexOf(":");
  return { accountId: key.slice(0, idx), threadId: key.slice(idx + 1) };
}

interface ThreadState {
  threads: Thread[];
  threadMap: Map<string, Thread>;
  selectedThreadId: string | null;
  selectedThreadIds: Set<string>;
  isLoading: boolean;
  searchQuery: string;
  searchThreadIds: Set<string> | null; // null = no active search
  setThreads: (threads: Thread[]) => void;
  selectThread: (key: string | null) => void;
  toggleThreadSelection: (key: string) => void;
  selectThreadRange: (key: string) => void;
  clearMultiSelect: () => void;
  selectAll: () => void;
  selectAllFromHere: () => void;
  setLoading: (loading: boolean) => void;
  updateThread: (key: string, updates: Partial<Thread>) => void;
  removeThread: (key: string) => void;
  removeThreads: (keys: string[]) => void;
  setSearch: (query: string, threadIds: Set<string> | null) => void;
  clearSearch: () => void;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  threads: [],
  threadMap: new Map(),
  selectedThreadId: null,
  selectedThreadIds: new Set(),
  isLoading: false,
  searchQuery: "",
  searchThreadIds: null,

  setThreads: (threads) => set({ threads, threadMap: new Map(threads.map((t) => [threadKey(t), t])) }),
  selectThread: (selectedThreadId) => set({ selectedThreadId, selectedThreadIds: new Set() }),
  toggleThreadSelection: (key) =>
    set((state) => {
      const next = new Set(state.selectedThreadIds);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { selectedThreadIds: next };
    }),
  selectThreadRange: (key) => {
    const state = get();
    const threads = state.threads;
    // Find the anchor: last selected thread or the currently viewed thread
    const anchor = state.selectedThreadId ?? [...state.selectedThreadIds].pop();
    if (!anchor) {
      set({ selectedThreadIds: new Set([key]) });
      return;
    }
    const anchorIdx = threads.findIndex((t) => threadKey(t) === anchor);
    const targetIdx = threads.findIndex((t) => threadKey(t) === key);
    if (anchorIdx === -1 || targetIdx === -1) return;
    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangeKeys = threads.slice(start, end + 1).map((t) => threadKey(t));
    set((s) => ({
      selectedThreadIds: new Set([...s.selectedThreadIds, ...rangeKeys]),
    }));
  },
  clearMultiSelect: () => set({ selectedThreadIds: new Set() }),
  selectAll: () => {
    const threads = get().threads;
    set({ selectedThreadIds: new Set(threads.map((t) => threadKey(t))) });
  },
  selectAllFromHere: () => {
    const { threads, selectedThreadId } = get();
    const idx = threads.findIndex((t) => threadKey(t) === selectedThreadId);
    const startIdx = idx === -1 ? 0 : idx;
    const keys = threads.slice(startIdx).map((t) => threadKey(t));
    set((s) => ({
      selectedThreadIds: new Set([...s.selectedThreadIds, ...keys]),
    }));
  },
  setLoading: (isLoading) => set({ isLoading }),
  updateThread: (key, updates) =>
    set((state) => {
      const threads = state.threads.map((t) =>
        threadKey(t) === key ? { ...t, ...updates } : t,
      );
      const threadMap = new Map(state.threadMap);
      const existing = threadMap.get(key);
      if (existing) threadMap.set(key, { ...existing, ...updates });
      return { threads, threadMap };
    }),
  removeThread: (key) =>
    set((state) => {
      const threadMap = new Map(state.threadMap);
      threadMap.delete(key);
      const next = new Set(state.selectedThreadIds);
      next.delete(key);
      return {
        threads: state.threads.filter((t) => threadKey(t) !== key),
        threadMap,
        selectedThreadId: state.selectedThreadId === key ? null : state.selectedThreadId,
        selectedThreadIds: next,
      };
    }),
  removeThreads: (keys) =>
    set((state) => {
      const keysSet = new Set(keys);
      const threadMap = new Map(state.threadMap);
      for (const key of keys) threadMap.delete(key);
      const next = new Set(state.selectedThreadIds);
      for (const key of keys) next.delete(key);
      return {
        threads: state.threads.filter((t) => !keysSet.has(threadKey(t))),
        threadMap,
        selectedThreadId: state.selectedThreadId && keysSet.has(state.selectedThreadId) ? null : state.selectedThreadId,
        selectedThreadIds: next,
      };
    }),
  setSearch: (query, threadIds) => set({ searchQuery: query, searchThreadIds: threadIds }),
  clearSearch: () => set({ searchQuery: "", searchThreadIds: null }),
}));
