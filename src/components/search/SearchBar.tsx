import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { searchMessages } from "@/services/db/search";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { InputDialog } from "@/components/ui/InputDialog";
import { Search, X, FolderPlus } from "lucide-react";

export function SearchBar() {
  const { t } = useTranslation("search");
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleSaveAsSmartFolder = useCallback(() => {
    if (useThreadStore.getState().searchQuery.trim().length < 2) return;
    setShowSaveModal(true);
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      const { setSearch } = useThreadStore.getState();
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
          useThreadStore.getState().setSearch(value, threadIds);
        } catch {
          useThreadStore.getState().setSearch(value, null);
        }
      }, 200);
    },
    [activeAccountId],
  );

  const handleClear = useCallback(() => {
    useThreadStore.getState().clearSearch();
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      useThreadStore.getState().clearSearch();
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
        placeholder={t("searchPlaceholder")}
        className="w-full bg-bg-tertiary text-text-primary text-sm pl-8 pr-14 py-1.5 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary"
      />
      {searchQuery && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery.trim().length >= 2 && (
            <button
              onClick={handleSaveAsSmartFolder}
              className="text-text-tertiary hover:text-accent transition-colors"
              title={t("saveAsSmartFolder")}
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
      <InputDialog
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSubmit={(values) => {
          useSmartFolderStore.getState().createFolder(values.name!.trim(), useThreadStore.getState().searchQuery.trim(), activeAccountId ?? undefined);
        }}
        title={t("saveAsSmartFolder")}
        fields={[
          { key: "name", label: t("common:name"), defaultValue: searchQuery.trim() },
        ]}
        submitLabel={t("common:save")}
      />
    </div>
  );
}
