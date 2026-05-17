import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckSquare,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore, type TaskFilterStatus, type TaskDirectionFilter } from "@/stores/taskStore";
import {
  getTasksWithSubjects,
  getDeletedTasksWithSubjects,
  insertTask,
  completeTask,
  uncompleteTask,
  softDeleteTask,
  hardDeleteTask,
  restoreTask,
  getSubtasks,
  getIncompleteTaskCount,
  updateTask,
  type DbTask,
  type DbTaskWithSubject,
  type TaskPriority,
} from "@/services/db/tasks";
import { getSetting } from "@/services/db/settings";
import { handleRecurringTaskCompletion } from "@/services/tasks/taskManager";
import { TaskGroup } from "./TaskGroup";
import { TaskQuickAdd } from "./TaskQuickAdd";

// Deterministic account color from email string
const ACCOUNT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
];
function accountColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return ACCOUNT_COLORS[Math.abs(hash) % ACCOUNT_COLORS.length]!;
}

interface ThreadGroup {
  threadId: string | null;
  threadSubject: string | null;
  tasks: DbTaskWithSubject[];
  hasOverdue: boolean;
  nearestDue: number | null;
}

function buildGroups(tasks: DbTaskWithSubject[]): ThreadGroup[] {
  const map = new Map<string | null, DbTaskWithSubject[]>();

  for (const task of tasks) {
    const key = task.thread_id ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(task);
  }

  const now = Math.floor(Date.now() / 1000);
  const groups: ThreadGroup[] = [];

  for (const [threadId, groupTasks] of map.entries()) {
    const hasOverdue = groupTasks.some(
      (t) => !t.is_completed && t.due_date !== null && t.due_date < now,
    );
    const dueDates = groupTasks
      .filter((t) => !t.is_completed && t.due_date !== null)
      .map((t) => t.due_date!);
    const nearestDue = dueDates.length > 0 ? Math.min(...dueDates) : null;
    const subject = groupTasks[0]?.thread_subject ?? null;

    groups.push({ threadId, threadSubject: subject, tasks: groupTasks, hasOverdue, nearestDue });
  }

  // Two-level sort: overdue groups first, then by nearest due date (nulls last), general section last
  groups.sort((a, b) => {
    if (a.threadId === null && b.threadId !== null) return 1;
    if (a.threadId !== null && b.threadId === null) return -1;
    if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
    if (a.nearestDue !== null && b.nearestDue !== null) return a.nearestDue - b.nearestDue;
    if (a.nearestDue !== null) return -1;
    if (b.nearestDue !== null) return 1;
    return 0;
  });

  return groups;
}

function formatDeletedAt(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TasksPage() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;

  const setTasks = useTaskStore((s) => s.setTasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId);
  const filterStatus = useTaskStore((s) => s.filterStatus);
  const setFilterStatus = useTaskStore((s) => s.setFilterStatus);
  const filterPriority = useTaskStore((s) => s.filterPriority);
  const setFilterPriority = useTaskStore((s) => s.setFilterPriority);
  const filterDirection = useTaskStore((s) => s.filterDirection);
  const setFilterDirection = useTaskStore((s) => s.setFilterDirection);
  const searchQuery = useTaskStore((s) => s.searchQuery);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);

  const [allTasks, setAllTasks] = useState<DbTaskWithSubject[]>([]);
  const [deletedTasks, setDeletedTasks] = useState<DbTaskWithSubject[]>([]);
  const [subtaskMap, setSubtaskMap] = useState<Record<string, DbTask[]>>({});
  // auto_archive_completed_hours (0 = show all completed)
  const [archiveHours, setArchiveHours] = useState<number>(0);

  const colorMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, accountColor(a.email)])),
    [accounts],
  );

  const loadTasks = useCallback(async () => {
    if (!accountId) return;
    // Always fetch all non-deleted tasks (including completed) — filter client-side
    const loaded = await getTasksWithSubjects(accountId, true);
    setAllTasks(loaded);
    setTasks(loaded);
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, setTasks]);

  const loadDeletedTasks = useCallback(async () => {
    if (!accountId) return;
    const loaded = await getDeletedTasksWithSubjects(accountId);
    setDeletedTasks(loaded);
  }, [accountId]);

  // Load archive setting once on mount
  useEffect(() => {
    getSetting("task_auto_archive_completed_hours").then((raw) => {
      if (raw) {
        const h = parseInt(raw, 10);
        if (!isNaN(h) && h > 0) setArchiveHours(h);
      }
    });
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (filterStatus === "deleted") loadDeletedTasks();
  }, [filterStatus, loadDeletedTasks]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const map: Record<string, DbTask[]> = {};
      for (const task of allTasks) {
        const subs = await getSubtasks(task.id);
        if (subs.length > 0) map[task.id] = subs;
      }
      if (!cancelled) setSubtaskMap(map);
    }
    load();
    return () => { cancelled = true; };
  }, [allTasks]);

  // Client-side filtering for active tasks
  const filteredTasks = useMemo(() => {
    if (filterStatus === "deleted") return [];

    const now = Math.floor(Date.now() / 1000);
    let result = allTasks;

    if (filterStatus === "completed") {
      result = result.filter((t) => t.is_completed);
    } else if (filterStatus === "incomplete") {
      result = result.filter((t) => {
        if (!t.is_completed) return true;
        // Show recently-completed tasks within the archive window
        if (archiveHours > 0 && t.completed_at !== null) {
          return t.completed_at > now - archiveHours * 3600;
        }
        return false; // hide completed when archiveHours=0 (default: hide all completed)
      });
    }
    // filterStatus === "all": include everything non-deleted

    if (filterPriority !== "all") result = result.filter((t) => t.priority === filterPriority);
    if (filterDirection !== "all") result = result.filter((t) => t.direction === filterDirection);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allTasks, filterStatus, filterPriority, filterDirection, searchQuery, archiveHours]);

  // Filtered deleted tasks (search only)
  const filteredDeletedTasks = useMemo(() => {
    if (filterStatus !== "deleted") return [];
    if (!searchQuery.trim()) return deletedTasks;
    const q = searchQuery.toLowerCase();
    return deletedTasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
    );
  }, [deletedTasks, filterStatus, searchQuery]);

  const groups = useMemo(() => buildGroups(filteredTasks), [filteredTasks]);

  const handleAddTask = useCallback(async (title: string) => {
    if (!accountId) return;
    await insertTask({ accountId, title });
    await loadTasks();
  }, [accountId, loadTasks]);

  const handleToggleComplete = useCallback(async (id: string, completed: boolean) => {
    if (completed) {
      const task = allTasks.find((t) => t.id === id);
      if (task?.recurrence_rule) {
        await handleRecurringTaskCompletion(id);
      } else {
        await completeTask(id);
      }
    } else {
      await uncompleteTask(id);
    }
    await loadTasks();
  }, [allTasks, loadTasks]);

  const handleDelete = useCallback(async (id: string) => {
    await softDeleteTask(id);
    await loadTasks();
  }, [loadTasks]);

  const handleDueDateChange = useCallback(async (id: string, dueDate: number | null) => {
    await updateTask(id, { dueDate });
    await loadTasks();
  }, [loadTasks]);

  const handleEdit = useCallback(async (
    id: string,
    updates: { title?: string; direction?: import("@/services/db/tasks").TaskDirection; dueDate?: number | null },
  ) => {
    await updateTask(id, updates);
    await loadTasks();
  }, [loadTasks]);

  const handleCompleteAll = useCallback(async (taskIds: string[]) => {
    for (const id of taskIds) await completeTask(id);
    await loadTasks();
  }, [loadTasks]);

  const handleRestoreDeleted = useCallback(async (id: string) => {
    await restoreTask(id);
    await loadDeletedTasks();
    await loadTasks();
  }, [loadDeletedTasks, loadTasks]);

  const handleHardDeleteTask = useCallback(async (id: string) => {
    await hardDeleteTask(id);
    await loadDeletedTasks();
  }, [loadDeletedTasks]);

  const handleRestoreAll = useCallback(async () => {
    for (const t of filteredDeletedTasks) await restoreTask(t.id);
    await loadDeletedTasks();
    await loadTasks();
  }, [filteredDeletedTasks, loadDeletedTasks, loadTasks]);

  const isTrash = filterStatus === "deleted";
  const isEmpty = isTrash ? filteredDeletedTasks.length === 0 : filteredTasks.length === 0;

  const overdueCount = useMemo(() => filteredTasks.filter(
    (t) => !t.is_completed && t.due_date !== null && t.due_date < Math.floor(Date.now() / 1000),
  ).length, [filteredTasks]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} className="text-accent" />
          <h1 className="text-base font-semibold text-text-primary">Tasks</h1>
          {!isTrash && filteredTasks.length > 0 && (
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">
              {filteredTasks.length}
            </span>
          )}
          {isTrash && filteredDeletedTasks.length > 0 && (
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">
              {filteredDeletedTasks.length}
            </span>
          )}
          {overdueCount > 0 && !isTrash && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full font-medium">
              {overdueCount} overdue
            </span>
          )}
          {isTrash && (
            <span className="text-xs text-text-tertiary bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
              Trash
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Restore all — trash mode only */}
          {isTrash && filteredDeletedTasks.length > 0 && (
            <button
              onClick={handleRestoreAll}
              className="flex items-center gap-1 text-xs text-accent hover:opacity-80 font-medium px-2 py-1 rounded bg-accent/10"
            >
              <RotateCcw size={12} />
              Restore all
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-44 pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-lg text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>

          {/* Direction filter — hidden in trash */}
          {!isTrash && (
            <div className="flex items-center gap-0.5 bg-bg-tertiary border border-border-primary rounded-lg p-0.5">
              {(["all", "outgoing", "incoming"] as TaskDirectionFilter[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setFilterDirection(d)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                    filterDirection === d ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {d === "outgoing" && <ArrowUpRight size={11} />}
                  {d === "incoming" && <ArrowDownLeft size={11} />}
                  {d === "all" ? "All" : d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskFilterStatus)}
            className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
          >
            <option value="incomplete">Active</option>
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="deleted">Trash</option>
          </select>

          {!isTrash && (
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
              className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          )}
        </div>
      </div>

      {/* Quick add — hidden in trash */}
      {!isTrash && (
        <div className="border-b border-border-primary px-2">
          <TaskQuickAdd onAdd={handleAddTask} />
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {isTrash ? (
              <>
                <Trash2 size={48} className="text-text-tertiary/30 mb-4" />
                <p className="text-sm text-text-secondary mb-1">Trash is empty</p>
                <p className="text-xs text-text-tertiary">I task eliminati appariranno qui</p>
              </>
            ) : (
              <>
                <CheckSquare size={48} className="text-text-tertiary/30 mb-4" />
                <p className="text-sm text-text-secondary mb-1">No tasks</p>
                <p className="text-xs text-text-tertiary">
                  {searchQuery ? "Try a different search term" : "Add a task above or press 't' on any email thread"}
                </p>
              </>
            )}
          </div>
        ) : isTrash ? (
          /* Trash view — simple flat list */
          <div className="space-y-1">
            {filteredDeletedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border-primary bg-bg-primary/40 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-secondary line-through truncate">{task.title}</p>
                  {task.thread_subject && (
                    <p className="text-xs text-text-tertiary truncate mt-0.5">{task.thread_subject}</p>
                  )}
                </div>
                <span className="text-xs text-text-tertiary shrink-0">
                  {task.deleted_at ? formatDeletedAt(task.deleted_at) : ""}
                </span>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRestoreDeleted(task.id)}
                    title="Restore task"
                    className="p-1 text-text-tertiary hover:text-accent transition-colors"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => handleHardDeleteTask(task.id)}
                    title="Elimina definitivamente"
                    className="p-1 text-text-tertiary hover:text-danger transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Active task groups */
          groups.map((group) => (
            <TaskGroup
              key={group.threadId ?? "__general"}
              threadId={group.threadId}
              threadSubject={group.threadSubject}
              accountColor={
                group.tasks[0]?.account_id ? colorMap[group.tasks[0].account_id] : undefined
              }
              tasks={group.tasks}
              subtaskMap={subtaskMap}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDelete}
              onDueDateChange={handleDueDateChange}
              onEdit={handleEdit}
              onCompleteAll={handleCompleteAll}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
            />
          ))
        )}
      </div>
    </div>
  );
}
