import { useState, useRef, useCallback } from "react";
import { searchMessages } from "@/services/db/search";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { useComposerStore } from "@/stores/composerStore";
import { InputDialog } from "@/components/ui/InputDialog";
import { Search, X, FolderPlus, Pencil } from "lucide-react";

export function SearchBar() {
  const searchQuery = useThreadStore((s) => s.searchQuery);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const openComposer = useComposerStore((s) => s.openComposer);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

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
          const hits = await searchMessages(
            value,
            activeAccountId ?? undefined,
            100,
          );
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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      useThreadStore.getState().clearSearch();
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      textareaRef.current?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      // Prevent newline on plain Enter; search already debounced
      e.preventDefault();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
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
          onKeyDown={handleKeyDown}
          placeholder="Search... (from: to: has:attachment)"
          className="w-full bg-bg-tertiary text-text-primary text-sm pl-8 pr-10 py-1.5 rounded-md border border-border-primary focus:border-accent focus:outline-none placeholder:text-text-tertiary resize-none leading-5 overflow-hidden"
          style={{ minHeight: "2rem", maxHeight: "6rem" }}
        />
        {searchQuery && (
          <div className="absolute right-2 top-[0.375rem] flex items-center gap-1">
            {searchQuery.trim().length >= 2 && (
              <button
                onClick={handleSaveAsSmartFolder}
                className="text-text-tertiary hover:text-accent transition-colors"
                title="Save as Smart Folder"
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
      </div>
      <button
        onClick={() => openComposer()}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors shrink-0"
        title="Compose new email"
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
