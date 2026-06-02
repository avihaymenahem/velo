import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { CSSTransition } from "react-transition-group";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useThreadStore } from "@/stores/threadStore";
import { useAccountStore } from "@/stores/accountStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { getTemplatesForAccount, type DbTemplate } from "@/services/db/templates";
import { setThreadPrimaryState } from "@/services/db/threadWorkStates";
import type { ThreadPrimaryState } from "@/services/agentic/types";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { navigateToLabel, navigateBack, getSelectedThreadId } from "@/router/navigate";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  keywords?: string[];
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const WORK_STATE_COMMANDS: { state: ThreadPrimaryState; englishLabel: string }[] = [
  { state: "needs_reply", englishLabel: "Mark as Needs Reply" },
  { state: "waiting", englishLabel: "Mark as Waiting" },
  { state: "committed", englishLabel: "Mark as Committed" },
  { state: "decision_needed", englishLabel: "Mark as Decision Needed" },
  { state: "can_archive", englishLabel: "Mark as Can Archive" },
  { state: "done", englishLabel: "Mark as Done" },
];

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation(["search", "agentic"]);
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

  const markSelectedThreadState = useCallback(async (state: ThreadPrimaryState) => {
    onClose();
    const threadId = getSelectedThreadId();
    const accountId = useAccountStore.getState().activeAccountId;
    if (!threadId || !accountId) return;
    try {
      await setThreadPrimaryState(accountId, threadId, state);
      useThreadStore.getState().updateThread(threadId, { workState: state });
    } catch (err) {
      console.error("Failed to set thread work state:", err);
    }
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    getTemplatesForAccount(activeAccountId).then(setTemplates);
  }, [isOpen, activeAccountId]);

  const commands: Command[] = useMemo(() => [
    // Navigation
    { id: "go-inbox", label: t("commandPalette.commands.goInbox"), shortcut: "g i", category: t("commandPalette.categories.navigation"), keywords: ["Go to Inbox"], action: () => { navigateToLabel("inbox"); onClose(); } },
    { id: "go-starred", label: t("commandPalette.commands.goStarred"), shortcut: "g s", category: t("commandPalette.categories.navigation"), keywords: ["Go to Starred"], action: () => { navigateToLabel("starred"); onClose(); } },
    { id: "go-sent", label: t("commandPalette.commands.goSent"), shortcut: "g t", category: t("commandPalette.categories.navigation"), keywords: ["Go to Sent"], action: () => { navigateToLabel("sent"); onClose(); } },
    { id: "go-drafts", label: t("commandPalette.commands.goDrafts"), shortcut: "g d", category: t("commandPalette.categories.navigation"), keywords: ["Go to Drafts"], action: () => { navigateToLabel("drafts"); onClose(); } },
    { id: "go-snoozed", label: t("commandPalette.commands.goSnoozed"), category: t("commandPalette.categories.navigation"), keywords: ["Go to Snoozed"], action: () => { navigateToLabel("snoozed"); onClose(); } },
    { id: "go-trash", label: t("commandPalette.commands.goTrash"), category: t("commandPalette.categories.navigation"), keywords: ["Go to Trash"], action: () => { navigateToLabel("trash"); onClose(); } },
    { id: "go-all", label: t("commandPalette.commands.goAll"), category: t("commandPalette.categories.navigation"), keywords: ["Go to All Mail"], action: () => { navigateToLabel("all"); onClose(); } },

    // Actions
    { id: "compose", label: t("commandPalette.commands.compose"), shortcut: "c", category: t("commandPalette.categories.actions"), keywords: ["Compose New Email"], action: () => { openComposer(); onClose(); } },
    { id: "deselect", label: t("commandPalette.commands.closeThread"), shortcut: "Esc", category: t("commandPalette.categories.actions"), keywords: ["Close Thread"], action: () => { navigateBack(); onClose(); } },
    { id: "spam", label: activeLabel === "spam" ? t("commandPalette.commands.notSpam") : t("commandPalette.commands.reportSpam"), shortcut: "!", category: t("commandPalette.categories.actions"), keywords: ["Not Spam", "Report Spam"], action: async () => {
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
    { id: "task-create", label: t("commandPalette.commands.createTask"), category: t("commandPalette.categories.tasks"), keywords: ["Create Task"], action: () => {
      onClose();
      useUIStore.getState().setTaskSidebarVisible(true);
    } },
    { id: "task-extract", label: t("commandPalette.commands.createTaskFromEmail"), shortcut: "t", category: t("commandPalette.categories.tasks"), keywords: ["Create Task from Email (AI)"], action: () => {
      onClose();
      const threadId = getSelectedThreadId();
      if (threadId) {
        window.dispatchEvent(new CustomEvent("velo-extract-task", { detail: { threadId } }));
      }
    } },
    { id: "task-view", label: t("commandPalette.commands.viewTasks"), shortcut: "g k", category: t("commandPalette.categories.tasks"), keywords: ["View Tasks"], action: () => { navigateToLabel("tasks"); onClose(); } },
    { id: "task-toggle-panel", label: t("commandPalette.commands.toggleTaskPanel"), category: t("commandPalette.categories.tasks"), keywords: ["Toggle Task Panel"], action: () => { useUIStore.getState().toggleTaskSidebar(); onClose(); } },

    // AI
    { id: "ask-ai", label: t("commandPalette.commands.askAi"), category: t("commandPalette.categories.ai"), keywords: ["Ask AI about your inbox"], action: () => { onClose(); window.dispatchEvent(new Event("velo-toggle-ask-inbox")); } },

    // Agentic Inbox
    ...WORK_STATE_COMMANDS.map((cmd) => ({
      id: `work-state-${cmd.state}`,
      label: t(`commands.${cmd.state}`, { ns: "agentic" }),
      category: t("categories.agenticInbox", { ns: "agentic" }),
      keywords: [cmd.englishLabel],
      action: () => { void markSelectedThreadState(cmd.state); },
    })),

    // Settings
    { id: "toggle-sidebar", label: t("commandPalette.commands.toggleSidebar"), shortcut: "Ctrl+Shift+E", category: t("commandPalette.categories.settings"), keywords: ["Toggle Sidebar"], action: () => { toggleSidebar(); onClose(); } },
    { id: "theme-light", label: t("commandPalette.commands.lightTheme"), category: t("commandPalette.categories.settings"), keywords: ["Switch to Light Theme"], action: () => { setTheme("light"); onClose(); } },
    { id: "theme-dark", label: t("commandPalette.commands.darkTheme"), category: t("commandPalette.categories.settings"), keywords: ["Switch to Dark Theme"], action: () => { setTheme("dark"); onClose(); } },
    { id: "theme-system", label: t("commandPalette.commands.systemTheme"), category: t("commandPalette.categories.settings"), keywords: ["Use System Theme"], action: () => { setTheme("system"); onClose(); } },

    // Templates
    ...templates.map((tmpl) => ({
      id: `template-${tmpl.id}`,
      label: t("commandPalette.commands.insertTemplate", { name: tmpl.name }),
      category: t("commandPalette.categories.templates"),
      keywords: [`Insert: ${tmpl.name}`],
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
  ], [onClose, openComposer, activeLabel, t, toggleSidebar, setTheme, templates, markSelectedThreadState]);

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()) ||
          c.keywords?.some((keyword) => keyword.toLowerCase().includes(query.toLowerCase())),
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
            placeholder={t("commandPalette.placeholder")}
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-tertiary">
              {t("commandPalette.empty")}
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
