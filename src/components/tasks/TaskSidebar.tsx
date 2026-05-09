import { useState, useEffect, useCallback } from "react";
import { X, ExternalLink, Sparkles, Loader2, Check, Trash2, ArrowDownLeft, ArrowUpRight, AlertTriangle } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";
import { useUIStore } from "@/stores/uiStore";
import {
  getTasksForThread,
  insertTask,
  completeTask,
  uncompleteTask,
  softDeleteTask,
  softDeleteTasksByThread,
  getSubtasks,
  getIncompleteTaskCount,
} from "@/services/db/tasks";
import type { DbTask, TaskDirection } from "@/services/db/tasks";
import type { ExtractedTask } from "@/services/ai/taskExtraction";
import { handleRecurringTaskCompletion } from "@/services/tasks/taskManager";
import { extractTasks } from "@/services/ai/taskExtraction";
import { TaskItem } from "./TaskItem";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { navigateToLabel } from "@/router/navigate";
import type { DbMessage } from "@/services/db/messages";

interface TaskSidebarProps {
  accountId: string;
  threadId: string;
  messages?: DbMessage[];
}

const DIRECTION_LABELS: Record<TaskDirection, { label: string; icon: React.ReactNode; color: string }> = {
  incoming: { label: "Incoming", icon: <ArrowDownLeft size={11} />, color: "text-blue-400 bg-blue-500/10" },
  outgoing: { label: "Outgoing", icon: <ArrowUpRight size={11} />, color: "text-emerald-400 bg-emerald-500/10" },
};

export function TaskSidebar({ accountId, threadId, messages = [] }: TaskSidebarProps) {
  const threadTasks = useTaskStore((s) => s.threadTasks);
  const setThreadTasks = useTaskStore((s) => s.setThreadTasks);
  const toggleTaskSidebar = useUIStore((s) => s.toggleTaskSidebar);
  const isMonitored = useTaskStore((s) => s.aiMonitoredThreads.has(threadId));
  const toggleAiMonitor = useTaskStore((s) => s.toggleAiMonitor);
  const draftTasks = useTaskStore((s) => s.draftTasks);
  const draftThreadId = useTaskStore((s) => s.draftThreadId);
  const isDraftLoading = useTaskStore((s) => s.isDraftLoading);
  const setDraftTasks = useTaskStore((s) => s.setDraftTasks);
  const clearDraftTasks = useTaskStore((s) => s.clearDraftTasks);
  const setDraftLoading = useTaskStore((s) => s.setDraftLoading);

  const [subtaskMap, setSubtaskMap] = useState<Record<string, DbTask[]>>({});
  // Local draft edits before confirm
  const [pendingDrafts, setPendingDrafts] = useState<ExtractedTask[]>([]);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    const tasks = await getTasksForThread(accountId, threadId);
    setThreadTasks(tasks);
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, threadId, setThreadTasks]);

  useEffect(() => {
    let cancelled = false;
    getTasksForThread(accountId, threadId).then((tasks) => {
      if (!cancelled) setThreadTasks(tasks);
    });
    return () => { cancelled = true; };
  }, [accountId, threadId, setThreadTasks]);

  // Sync pending drafts when store drafts change for this thread
  useEffect(() => {
    if (draftThreadId === threadId && draftTasks.length > 0) {
      setPendingDrafts(draftTasks);
    }
  }, [draftTasks, draftThreadId, threadId]);

  const handleAddTask = useCallback(async (title: string) => {
    const id = await insertTask({
      accountId,
      title,
      threadId,
      threadAccountId: accountId,
    });
    await refreshTasks();
    return id;
  }, [accountId, threadId, refreshTasks]);

  const handleToggleComplete = useCallback(async (id: string, completed: boolean) => {
    if (completed) {
      const task = threadTasks.find((t) => t.id === id);
      if (task?.recurrence_rule) {
        await handleRecurringTaskCompletion(id);
      } else {
        await completeTask(id);
      }
    } else {
      await uncompleteTask(id);
    }
    await refreshTasks();
  }, [accountId, threadId, threadTasks, refreshTasks]);

  const handleDelete = useCallback(async (id: string) => {
    await softDeleteTask(id);
    await refreshTasks();
  }, [refreshTasks]);

  const handleDeleteGroup = useCallback(async () => {
    await softDeleteTasksByThread(accountId, threadId);
    await refreshTasks();
  }, [accountId, threadId, refreshTasks]);

  // Load subtasks
  useEffect(() => {
    let cancelled = false;
    async function loadSubtasks() {
      const map: Record<string, DbTask[]> = {};
      for (const task of threadTasks) {
        const subs = await getSubtasks(task.id);
        if (subs.length > 0) map[task.id] = subs;
      }
      if (!cancelled) setSubtaskMap(map);
    }
    loadSubtasks();
    return () => { cancelled = true; };
  }, [threadTasks]);

  // AI Monitor toggle: when turned ON, run extraction immediately
  const handleToggleMonitor = useCallback(async () => {
    const turningOn = !isMonitored;
    toggleAiMonitor(threadId);

    if (turningOn && messages.length > 0) {
      setDraftLoading(true);
      try {
        const extracted = await extractTasks(threadId, accountId, messages);

        // Reconciliation: fuzzy title dedup — normalize + word-set Jaccard similarity
        const normalize = (s: string) =>
          s.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
        const words = (s: string) => new Set(normalize(s).split(" ").filter(Boolean));
        const jaccard = (a: Set<string>, b: Set<string>) => {
          const inter = [...a].filter((w) => b.has(w)).length;
          const union = new Set([...a, ...b]).size;
          return union === 0 ? 0 : inter / union;
        };
        const existingWordSets = threadTasks.map((t) => words(t.title));
        const novel = extracted.filter(
          (e) => !existingWordSets.some((ex) => jaccard(ex, words(e.title)) >= 0.6),
        );

        if (novel.length > 0) {
          setDraftTasks(novel, threadId);
        } else {
          clearDraftTasks();
        }
      } catch (err) {
        console.warn("AI task extraction failed:", err);
        clearDraftTasks();
      }
    } else {
      clearDraftTasks();
    }
  }, [isMonitored, toggleAiMonitor, threadId, accountId, messages, threadTasks, setDraftTasks, clearDraftTasks, setDraftLoading]);

  const handleConfirmDraft = useCallback(async (draft: ExtractedTask) => {
    setConfirmError(null);
    try {
      await insertTask({
        accountId,
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        direction: draft.direction,
        dueDate: draft.dueDate,
        threadId,
        threadAccountId: accountId,
      });
      setPendingDrafts((prev) => prev.filter((d) => d !== draft));
      if (pendingDrafts.length <= 1) clearDraftTasks();
      await refreshTasks();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to save task");
    }
  }, [accountId, threadId, pendingDrafts, clearDraftTasks, refreshTasks]);

  const handleConfirmAllDrafts = useCallback(async () => {
    setConfirmError(null);
    try {
      for (const draft of pendingDrafts) {
        await insertTask({
          accountId,
          title: draft.title,
          description: draft.description,
          priority: draft.priority,
          direction: draft.direction,
          dueDate: draft.dueDate,
          threadId,
          threadAccountId: accountId,
        });
      }
      setPendingDrafts([]);
      clearDraftTasks();
      await refreshTasks();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Failed to save tasks");
    }
  }, [accountId, threadId, pendingDrafts, clearDraftTasks, refreshTasks]);

  const handleDiscardDraft = useCallback((draft: ExtractedTask) => {
    setPendingDrafts((prev) => prev.filter((d) => d !== draft));
    if (pendingDrafts.length <= 1) clearDraftTasks();
  }, [pendingDrafts, clearDraftTasks]);

  const showDrafts = draftThreadId === threadId && pendingDrafts.length > 0;

  return (
    <div className="w-72 border-l border-border-primary bg-bg-primary/50 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex flex-col border-b border-border-secondary">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Tasks</h3>
          <div className="flex items-center gap-1">
            {/* AI Monitor toggle */}
            <button
              onClick={handleToggleMonitor}
              title={isMonitored ? "AI monitoring active — click to disable" : "Enable AI task extraction"}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                isMonitored
                  ? "bg-accent/15 text-accent"
                  : "text-text-tertiary hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              {isDraftLoading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              <span className="hidden sm:inline">{isMonitored ? "AI On" : "AI"}</span>
            </button>

            {/* Delete group */}
            {threadTasks.length > 0 && (
              <button
                onClick={handleDeleteGroup}
                title="Delete all tasks for this thread"
                className="p-1 text-text-tertiary hover:text-danger transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}

            <button
              onClick={() => navigateToLabel("tasks")}
              title="Open tasks page"
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            >
              <ExternalLink size={13} />
            </button>
            <button
              onClick={toggleTaskSidebar}
              className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Monitoring active badge — turns red when overdue tasks exist */}
        {isMonitored && !isDraftLoading && (() => {
          const now = Math.floor(Date.now() / 1000);
          const hasOverdue = threadTasks.some(
            (t) => !t.is_completed && t.due_date !== null && t.due_date < now,
          );
          return (
            <div className={`flex items-center gap-1.5 px-4 pb-2 ${hasOverdue ? "text-red-400" : "text-accent"}`}>
              {hasOverdue ? (
                <AlertTriangle size={11} className="shrink-0 animate-pulse" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              )}
              <span className="text-[0.625rem] font-medium">
                {hasOverdue ? "Overdue tasks — monitoring active" : "Monitoring active"}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Draft review panel */}
      {(showDrafts || isDraftLoading) && (
        <div className="border-b border-accent/20 bg-accent/5 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-accent flex items-center gap-1">
              <Sparkles size={11} />
              AI Suggestions
            </span>
            {showDrafts && pendingDrafts.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmAllDrafts}
                  className="text-xs text-accent hover:opacity-80 font-medium"
                >
                  Accept all
                </button>
                <button
                  onClick={() => { setPendingDrafts([]); clearDraftTasks(); }}
                  className="text-xs text-text-tertiary hover:text-text-primary"
                >
                  Discard all
                </button>
              </div>
            )}
          </div>

          {isDraftLoading && (
            <div className="flex items-center gap-2 text-xs text-text-secondary py-1">
              <Loader2 size={12} className="animate-spin text-accent" />
              Analyzing thread...
            </div>
          )}

          {confirmError && (
            <p className="text-xs text-danger">{confirmError}</p>
          )}

          {showDrafts && pendingDrafts.map((draft, i) => {
            const dir = DIRECTION_LABELS[draft.direction];
            return (
              <div key={i} className="rounded-lg border border-border-primary bg-bg-primary/60 px-3 py-2 space-y-1.5">
                <p className="text-xs text-text-primary font-medium leading-snug">{draft.title}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-0.5 text-[0.625rem] px-1.5 py-0.5 rounded ${dir.color}`}>
                    {dir.icon}{dir.label}
                  </span>
                  {draft.priority !== "none" && (
                    <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary capitalize">
                      {draft.priority}
                    </span>
                  )}
                  {draft.dueDate && (
                    <span className="text-[0.625rem] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary">
                      {new Date(draft.dueDate * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
                {draft.description && (
                  <p className="text-[0.6875rem] text-text-tertiary line-clamp-2">{draft.description}</p>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={() => handleConfirmDraft(draft)}
                    className="flex items-center gap-1 text-[0.6875rem] text-accent hover:opacity-80 font-medium"
                  >
                    <Check size={11} />
                    Accept
                  </button>
                  <button
                    onClick={() => handleDiscardDraft(draft)}
                    className="text-[0.6875rem] text-text-tertiary hover:text-text-primary"
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-1">
        {threadTasks.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-6">
            No tasks linked to this thread
          </p>
        ) : (
          <div className="space-y-0.5">
            {threadTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                subtasks={subtaskMap[task.id]}
                onToggleComplete={handleToggleComplete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick add */}
      <div className="border-t border-border-secondary">
        <TaskQuickAdd onAdd={handleAddTask} placeholder="Add task to this thread..." />
      </div>
    </div>
  );
}
