import { useRef, useCallback } from "react";
import { searchMessages } from "@/services/db/search";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import { Search, X } from "lucide-react";

export function SearchBar() {
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const setSearch = useThreadStore((s) => s.setSearch);
  const clearSearch = useThreadStore((s) => s.clearSearch);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      setSearch(value, useThreadStore.getState().searchThreadIds);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 2) {
        setSearch(value, null);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const hits = await searchMessages(value, activeAccountId ?? undefined, 100);
          const threadIds = new Set(hits.map((h) => h.thread_id));
          setSearch(value, threadIds);
        } catch {
          setSearch(value, null);
        }
      }, 200);
    },
    [activeAccountId, setSearch],
  );

  const handleClear = useCallback(() => {
    clearSearch();
    inputRef.current?.focus();
  }, [clearSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      clearSearch();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search... (from: to: has:attachment)"
        className="w-full bg-bg-tertiary text-text-primary text-sm pl-8 pr-8 py-1.5 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary"
      />
      {searchQuery && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
