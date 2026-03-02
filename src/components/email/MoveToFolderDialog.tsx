import { useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CSSTransition } from "react-transition-group";
import { useLabelStore } from "@/stores/labelStore";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import {
  archiveThread,
  trashThread,
  spamThread,
  addThreadLabel,
  removeThreadLabel,
  moveThread,
} from "@/services/emailActions";
import {
  Inbox,
  Archive,
  Trash2,
  Ban,
  Search,
  Tag,
  Folder,
} from "lucide-react";

interface MoveToFolderDialogProps {
  isOpen: boolean;
  threadIds: string[];
  onClose: () => void;
}

interface Destination {
  id: string;
  label: string;
  icon: typeof Inbox;
  type: "system" | "label";
  /** For IMAP: the folder path to move to */
  folderPath?: string;
}

type SystemLabelKey = "inbox" | "archive" | "common:trash" | "common:spam";

const SYSTEM_DESTINATIONS: (Omit<Destination, "label"> & { labelKey: SystemLabelKey })[] = [
  { id: "INBOX", labelKey: "inbox", icon: Inbox, type: "system" },
  { id: "__archive__", labelKey: "archive", icon: Archive, type: "system" },
  { id: "TRASH", labelKey: "common:trash", icon: Trash2, type: "system" },
  { id: "SPAM", labelKey: "common:spam", icon: Ban, type: "system" },
];

export function MoveToFolderDialog({
  isOpen,
  threadIds,
  onClose,
}: MoveToFolderDialogProps) {
  const { t } = useTranslation("email");
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const labels = useLabelStore((s) => s.labels);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);

  const account = useMemo(
    () => accounts.find((a) => a.id === activeAccountId),
    [accounts, activeAccountId],
  );
  const isImap = account?.provider === "imap";

  // Build the full destination list: system destinations + user labels
  const destinations = useMemo(() => {
    const systemDests: Destination[] = SYSTEM_DESTINATIONS.map((d) => ({
      ...d,
      label: t(d.labelKey),
    }));
    const userLabels: Destination[] = labels.map((l) => ({
      id: l.id,
      label: l.name,
      icon: Tag,
      type: "label" as const,
    }));
    return [...systemDests, ...userLabels];
  }, [labels, t]);

  // Filter destinations by search query
  const filtered = useMemo(() => {
    if (!query.trim()) return destinations;
    const q = query.toLowerCase();
    return destinations.filter((d) => d.label.toLowerCase().includes(q));
  }, [destinations, query]);

  const handleSelect = useCallback(
    async (dest: Destination) => {
      if (!activeAccountId || threadIds.length === 0) return;
      onClose();

      for (const threadId of threadIds) {
        if (dest.id === "__archive__") {
          await archiveThread(activeAccountId, threadId, []);
        } else if (dest.id === "TRASH") {
          await trashThread(activeAccountId, threadId, []);
        } else if (dest.id === "SPAM") {
          await spamThread(activeAccountId, threadId, [], true);
        } else if (dest.id === "INBOX") {
          if (isImap) {
            await moveThread(activeAccountId, threadId, [], "INBOX");
          } else {
            // Gmail: add INBOX label (un-archive)
            await addThreadLabel(activeAccountId, threadId, "INBOX");
          }
        } else if (dest.type === "label") {
          if (isImap) {
            // IMAP: move to folder. The label's id is the folder path for IMAP accounts.
            await moveThread(activeAccountId, threadId, [], dest.id);
          } else {
            // Gmail: add destination label + remove from current location (archive)
            await addThreadLabel(activeAccountId, threadId, dest.id);
            // Remove INBOX to complete the "move" semantics
            const thread = useThreadStore
              .getState()
              .threads.find((t) => t.id === threadId);
            if (thread?.labelIds.includes("INBOX")) {
              await removeThreadLabel(activeAccountId, threadId, "INBOX");
            }
          }
        }
      }

      // Refresh thread list
      window.dispatchEvent(new Event("velo-sync-done"));
    },
    [activeAccountId, threadIds, isImap, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = Math.min(prev + 1, filtered.length - 1);
          scrollToIndex(next);
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => {
          const next = Math.max(prev - 1, 0);
          scrollToIndex(next);
          return next;
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const dest = filtered[selectedIdx];
        if (dest) {
          handleSelect(dest);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIdx, handleSelect, onClose],
  );

  const scrollToIndex = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[index] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: "nearest" });
  };

  // Reset state when dialog opens/closes
  const handleEntered = () => {
    setQuery("");
    setSelectedIdx(0);
    inputRef.current?.focus();
  };

  return (
    <CSSTransition
      in={isOpen}
      timeout={150}
      classNames="modal"
      unmountOnExit
      nodeRef={overlayRef}
      onEntered={handleEntered}
    >
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="glass-backdrop absolute inset-0" />
        <div
          className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-md overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-secondary">
            <Search size={16} className="text-text-tertiary shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIdx(0);
              }}
              placeholder={t("moveToSearch")}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
              autoFocus
            />
          </div>

          {/* Destination list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                {t("noMatchingFolders")}
              </div>
            )}
            {filtered.map((dest, idx) => {
              const Icon = dest.type === "system" ? dest.icon : Folder;
              const isSelected = idx === selectedIdx;
              return (
                <button
                  key={dest.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-bg-selected text-text-primary"
                      : "text-text-secondary hover:bg-bg-hover"
                  }`}
                  onClick={() => handleSelect(dest)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <Icon
                    size={15}
                    className={
                      dest.type === "system"
                        ? "text-text-tertiary"
                        : "text-accent"
                    }
                  />
                  <span className="truncate">{dest.label}</span>
                  {dest.type === "system" && (
                    <span className="ml-auto text-[10px] text-text-tertiary uppercase tracking-wider">
                      {t("system")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border-secondary text-[10px] text-text-tertiary">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                ↑↓
              </kbd>{" "}
              {t("common:navigate")}
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                ↵
              </kbd>{" "}
              {t("common:select")}
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                esc
              </kbd>{" "}
              {t("common:close")}
            </span>
          </div>
        </div>
      </div>
    </CSSTransition>
  );
}
