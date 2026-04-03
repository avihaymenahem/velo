import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CSSTransition } from "react-transition-group";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { getTemplatesForAccount, type DbTemplate } from "@/services/db/templates";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { navigateToLabel, navigateBack, getSelectedThreadId } from "@/router/navigate";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setTheme = useUIStore((s) => s.setTheme);
  const openComposer = useComposerStore((s) => s.openComposer);
  const activeLabel = useActiveLabel();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [templates, setTemplates] = useState<DbTemplate[]>([]);

  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    getTemplatesForAccount(activeAccountId).then(setTemplates);
  }, [isOpen, activeAccountId]);

  const commands: Command[] = useMemo(() => [
    // Navigation
    { id: "go-inbox", label: t("commandPalette.goToInbox"), shortcut: "g i", category: t("commandPalette.navigation"), action: () => { navigateToLabel("inbox"); onClose(); } },
    { id: "go-starred", label: t("commandPalette.goToStarred"), shortcut: "g s", category: t("commandPalette.navigation"), action: () => { navigateToLabel("starred"); onClose(); } },
    { id: "go-sent", label: t("commandPalette.goToSent"), shortcut: "g t", category: t("commandPalette.navigation"), action: () => { navigateToLabel("sent"); onClose(); } },
    { id: "go-drafts", label: t("commandPalette.goToDrafts"), shortcut: "g d", category: t("commandPalette.navigation"), action: () => { navigateToLabel("drafts"); onClose(); } },
    { id: "go-snoozed", label: t("commandPalette.goToSnoozed"), category: t("commandPalette.navigation"), action: () => { navigateToLabel("snoozed"); onClose(); } },
    { id: "go-trash", label: t("commandPalette.goToTrash"), category: t("commandPalette.navigation"), action: () => { navigateToLabel("trash"); onClose(); } },
    { id: "go-all", label: t("commandPalette.goToAllMail"), category: t("commandPalette.navigation"), action: () => { navigateToLabel("all"); onClose(); } },

    // Actions
    { id: "compose", label: t("commandPalette.composeNew"), shortcut: "c", category: t("commandPalette.actions"), action: () => { openComposer(); onClose(); } },
    { id: "deselect", label: t("commandPalette.closeThread"), shortcut: "Esc", category: t("commandPalette.actions"), action: () => { navigateBack(); onClose(); } },
    { id: "spam", label: activeLabel === "spam" ? t("commandPalette.notSpam") : t("commandPalette.reportSpam"), shortcut: "!", category: t("commandPalette.actions"), action: async () => {
      onClose();
      const selectedId = getSelectedThreadId();
      const accountId = useAccountStore.getState().activeAccountId;
      if (!selectedId || !accountId) return;
      try {
        const client = await getGmailClient(accountId);
        if (activeLabel === "spam") {
          await client.modifyThread(selectedId, ["INBOX"], ["SPAM"]);
        } else {
          await client.modifyThread(selectedId, ["SPAM"], ["INBOX"]);
        }
        useThreadStore.getState().removeThread(selectedId);
      } catch (err) {
        console.error("Spam action failed:", err);
      }
    } },

    // Tasks
    { id: "task-create", label: t("commandPalette.createTask"), category: t("commandPalette.tasks"), action: () => {
      onClose();
      useUIStore.getState().setTaskSidebarVisible(true);
    } },
    { id: "task-extract", label: t("commandPalette.createTaskAi"), shortcut: "t", category: t("commandPalette.tasks"), action: () => {
      onClose();
      const threadId = getSelectedThreadId();
      if (threadId) {
        window.dispatchEvent(new CustomEvent("velo-extract-task", { detail: { threadId } }));
      }
    } },
    { id: "task-view", label: t("commandPalette.viewTasks"), shortcut: "g k", category: t("commandPalette.tasks"), action: () => { navigateToLabel("tasks"); onClose(); } },
    { id: "task-toggle-panel", label: t("commandPalette.toggleTaskPanel"), category: t("commandPalette.tasks"), action: () => { useUIStore.getState().toggleTaskSidebar(); onClose(); } },

    // AI
    { id: "ask-ai", label: t("commandPalette.askAiInbox"), category: t("commandPalette.ai"), action: () => { onClose(); window.dispatchEvent(new Event("velo-toggle-ask-inbox")); } },

    // Settings
    { id: "toggle-sidebar", label: t("commandPalette.toggleSidebar"), shortcut: "Ctrl+Shift+E", category: t("commandPalette.settings"), action: () => { toggleSidebar(); onClose(); } },
    { id: "theme-light", label: t("commandPalette.lightTheme"), category: t("commandPalette.settings"), action: () => { setTheme("light"); onClose(); } },
    { id: "theme-dark", label: t("commandPalette.darkTheme"), category: t("commandPalette.settings"), action: () => { setTheme("dark"); onClose(); } },
    { id: "theme-system", label: t("commandPalette.systemTheme"), category: t("commandPalette.settings"), action: () => { setTheme("system"); onClose(); } },

    // Templates
    ...templates.map((tmpl) => ({
      id: `template-${tmpl.id}`,
      label: `${t("commandPalette.insert")}${tmpl.name}`,
      category: t("commandPalette.templates"),
      action: () => {
        openComposer({
          mode: "new" as const,
          to: [],
          subject: tmpl.subject ?? "",
          bodyHtml: tmpl.body_html,
        });
        onClose();
      },
    })),
  ], [onClose, openComposer, activeLabel, toggleSidebar, setTheme, templates, t]);

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((p) => Math.min(p + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((p) => Math.max(p - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        filtered[selectedIdx].action();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedIdx, onClose],
  );

  // Build index map and group by category
  const filteredIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((cmd, idx) => map.set(cmd.id, idx));
    return map;
  }, [filtered]);
  const categories = useMemo(() => [...new Set(filtered.map((c) => c.category))], [filtered]);

  return (
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="modal" unmountOnExit>
    <div ref={overlayRef} className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-lg overflow-hidden modal-panel">
        {/* Input */}
        <div className="px-4 py-3 border-b border-border-primary">
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("search.typeCommand")}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              {t("search.noCommandsFound")}
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat}>
                <div className="px-4 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary">
                  {cat}
                </div>
                {filtered
                  .filter((c) => c.category === cat)
                  .map((cmd) => {
                    const globalIdx = filteredIndexMap.get(cmd.id) ?? -1;
                    return (
                      <button
                        key={cmd.id}
                        onClick={cmd.action}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between hover:bg-bg-hover text-sm ${
                          globalIdx === selectedIdx ? "bg-bg-hover" : ""
                        }`}
                      >
                        <span className="text-text-primary">{cmd.label}</span>
                        {cmd.shortcut && (
                          <kbd className="text-[0.625rem] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
    </CSSTransition>
  );
}
