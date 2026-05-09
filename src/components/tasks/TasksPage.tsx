import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckSquare,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore, type TaskFilterStatus, type TaskDirectionFilter } from "@/stores/taskStore";
import {
  getTasksWithSubjects,
  insertTask,
  completeTask,
  uncompleteTask,
  softDeleteTask,
  getSubtasks,
  getIncompleteTaskCount,
  updateTask,
  type DbTask,
  type DbTaskWithSubject,
  type TaskPriority,
} from "@/services/db/tasks";
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
    // General tasks (null thread_id) always at the end
    if (a.threadId === null && b.threadId !== null) return 1;
    if (a.threadId !== null && b.threadId === null) return -1;

    // Overdue threads before non-overdue
    if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;

    // Nearest due date ascending (null last)
    if (a.nearestDue !== null && b.nearestDue !== null) return a.nearestDue - b.nearestDue;
    if (a.nearestDue !== null) return -1;
    if (b.nearestDue !== null) return 1;
    return 0;
  });

  return groups;
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
  const [subtaskMap, setSubtaskMap] = useState<Record<string, DbTask[]>>({});

  const colorMap = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, accountColor(a.email)])),
    [accounts],
  );

  const loadTasks = useCallback(async () => {
    if (!accountId) return;
    const includeCompleted = filterStatus !== "incomplete";
    const loaded = await getTasksWithSubjects(accountId, includeCompleted);
    setAllTasks(loaded);
    setTasks(loaded);
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, filterStatus, setTasks]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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

  // Client-side filtering
  const filteredTasks = useMemo(() => {
    let result = allTasks;

    if (filterStatus === "completed") result = result.filter((t) => t.is_completed);
    else if (filterStatus === "incomplete") result = result.filter((t) => !t.is_completed);

    if (filterPriority !== "all") result = result.filter((t) => t.priority === filterPriority);
    if (filterDirection !== "all") result = result.filter((t) => t.direction === filterDirection);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allTasks, filterStatus, filterPriority, filterDirection, searchQuery]);

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

  const handleCompleteAll = useCallback(async (taskIds: string[]) => {
    for (const id of taskIds) await completeTask(id);
    await loadTasks();
  }, [loadTasks]);

  const isEmpty = filteredTasks.length === 0;
  const overdueCount = filteredTasks.filter(
    (t) => !t.is_completed && t.due_date !== null && t.due_date < Math.floor(Date.now() / 1000),
  ).length;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} className="text-accent" />
          <h1 className="text-base font-semibold text-text-primary">Tasks</h1>
          {filteredTasks.length > 0 && (
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">
              {filteredTasks.length}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full font-medium">
              {overdueCount} overdue
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
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

          {/* Direction filter */}
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

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskFilterStatus)}
            className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
          >
            <option value="incomplete">Active</option>
            <option value="all">All</option>
            <option value="completed">Completed</option>
          </select>

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
        </div>
      </div>

      {/* Quick add */}
      <div className="border-b border-border-primary px-2">
        <TaskQuickAdd onAdd={handleAddTask} />
      </div>

      {/* Task list — grouped by thread */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckSquare size={48} className="text-text-tertiary/30 mb-4" />
            <p className="text-sm text-text-secondary mb-1">No tasks</p>
            <p className="text-xs text-text-tertiary">
              {searchQuery ? "Try a different search term" : "Add a task above or press 't' on any email thread"}
            </p>
          </div>
        ) : (
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
