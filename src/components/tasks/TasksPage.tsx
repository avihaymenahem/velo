import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckSquare,
  Search,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useTaskStore, type TaskGroupBy, type TaskFilterStatus } from "@/stores/taskStore";
import {
  getTasksForAccount,
  insertTask,
  completeTask,
  uncompleteTask,
  deleteTask as dbDeleteTask,
  getSubtasks,
  getIncompleteTaskCount,
  type DbTask,
  type TaskPriority,
} from "@/services/db/tasks";
import { handleRecurringTaskCompletion } from "@/services/tasks/taskManager";
import { TaskItem } from "./TaskItem";
import { TaskQuickAdd } from "./TaskQuickAdd";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export function TasksPage() {
  const { t } = useTranslation();
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.isActive);
  const accountId = activeAccount?.id ?? null;

  const tasks = useTaskStore((s) => s.tasks);
  const setTasks = useTaskStore((s) => s.setTasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useTaskStore((s) => s.setSelectedTaskId);
  const groupBy = useTaskStore((s) => s.groupBy);
  const setGroupBy = useTaskStore((s) => s.setGroupBy);
  const filterStatus = useTaskStore((s) => s.filterStatus);
  const setFilterStatus = useTaskStore((s) => s.setFilterStatus);
  const filterPriority = useTaskStore((s) => s.filterPriority);
  const setFilterPriority = useTaskStore((s) => s.setFilterPriority);
  const searchQuery = useTaskStore((s) => s.searchQuery);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);

  const [subtaskMap, setSubtaskMap] = useState<Record<string, DbTask[]>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Load tasks
  const loadTasks = useCallback(async () => {
    if (!accountId) return;
    const includeCompleted = filterStatus !== "incomplete";
    const loaded = await getTasksForAccount(accountId, includeCompleted);
    setTasks(loaded);
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, filterStatus, setTasks]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Load subtasks
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const map: Record<string, DbTask[]> = {};
      for (const task of tasks) {
        const subs = await getSubtasks(task.id);
        if (subs.length > 0) map[task.id] = subs;
      }
      if (!cancelled) setSubtaskMap(map);
    }
    load();
    return () => { cancelled = true; };
  }, [tasks]);

  // Filter + search
  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filterStatus === "completed") {
      result = result.filter((t) => t.is_completed);
    } else if (filterStatus === "incomplete") {
      result = result.filter((t) => !t.is_completed);
    }

    if (filterPriority !== "all") {
      result = result.filter((t) => t.priority === filterPriority);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [tasks, filterStatus, filterPriority, searchQuery]);

  // Grouping
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return [{ label: "", tasks: filteredTasks }];

    const groups = new Map<string, DbTask[]>();

    for (const task of filteredTasks) {
      let key: string;
      switch (groupBy) {
        case "priority":
          key = task.priority;
          break;
        case "dueDate":
          if (!task.due_date) key = "noDueDate";
          else {
            const d = new Date(task.due_date * 1000);
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const diff = Math.floor((dueStart.getTime() - todayStart.getTime()) / 86400000);
            if (diff < 0) key = "overdue";
            else if (diff === 0) key = "today";
            else if (diff === 1) key = "tomorrow";
            else if (diff <= 7) key = "thisWeek";
            else key = "later";
          }
          break;
        case "tag": {
          const tags: string[] = (() => { try { return JSON.parse(task.tags_json); } catch { return []; } })();
          key = tags[0] ?? "__untagged";
          break;
        }
        default:
          key = "";
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }

    // Sort groups by priority order if grouping by priority
    const entries = [...groups.entries()];
    if (groupBy === "priority") {
      entries.sort((a, b) => {
        const aP = PRIORITY_ORDER[a[0] as TaskPriority] ?? 99;
        const bP = PRIORITY_ORDER[b[0] as TaskPriority] ?? 99;
        return aP - bP;
      });
    }

    const PRIORITY_LABEL_MAP: Record<string, string> = {
      urgent: t("tasks.urgent"),
      high: t("tasks.high"),
      medium: t("tasks.medium"),
      low: t("tasks.low"),
      none: t("common.none"),
    };

    const DUE_DATE_LABEL_MAP: Record<string, string> = {
      noDueDate: t("tasks.dueDate"),
      overdue: t("tasks.overdue"),
      today: t("common.today"),
      tomorrow: t("common.tomorrow"),
      thisWeek: t("tasks.thisWeek"),
      later: t("tasks.later"),
    };

    return entries.map(([key, tasks]) => {
      let label = key;
      if (groupBy === "priority") label = PRIORITY_LABEL_MAP[key] ?? key;
      else if (groupBy === "dueDate") label = DUE_DATE_LABEL_MAP[key] ?? key;
      else if (groupBy === "tag" && key === "__untagged") label = t("tasks.untagged");
      return { label, tasks };
    });
  }, [filteredTasks, groupBy]);

  const handleAddTask = useCallback(async (title: string) => {
    if (!accountId) return;
    await insertTask({ accountId, title });
    await loadTasks();
  }, [accountId, loadTasks]);

  const handleToggleComplete = useCallback(async (id: string, completed: boolean) => {
    if (completed) {
      const task = tasks.find((t) => t.id === id);
      if (task?.recurrence_rule) {
        await handleRecurringTaskCompletion(id);
      } else {
        await completeTask(id);
      }
    } else {
      await uncompleteTask(id);
    }
    await loadTasks();
  }, [tasks, loadTasks]);

  const handleDelete = useCallback(async (id: string) => {
    await dbDeleteTask(id);
    await loadTasks();
  }, [loadTasks]);

  const handleBulkComplete = useCallback(async () => {
    for (const id of selectedIds) {
      await completeTask(id);
    }
    setSelectedIds(new Set());
    await loadTasks();
  }, [selectedIds, loadTasks]);

  const handleBulkDelete = useCallback(async () => {
    for (const id of selectedIds) {
      await dbDeleteTask(id);
    }
    setSelectedIds(new Set());
    await loadTasks();
  }, [selectedIds, loadTasks]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-bg-primary/50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-primary shrink-0 bg-bg-primary/60 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <CheckSquare size={18} className="text-accent" />
          <h1 className="text-base font-semibold text-text-primary">{t("tasks.title")}</h1>
          {filteredTasks.length > 0 && (
            <span className="text-xs text-text-tertiary bg-bg-tertiary px-2 py-0.5 rounded-full">
              {filteredTasks.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("tasks.searchPlaceholder")}
              className="w-48 pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-lg text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>

          {/* Filters */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as TaskFilterStatus)}
            className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
          >
            <option value="incomplete">{t("tasks.active")}</option>
            <option value="all">{t("tasks.all")}</option>
            <option value="completed">{t("tasks.completed")}</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
            className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
          >
            <option value="all">{t("tasks.allPriorities")}</option>
            <option value="urgent">{t("tasks.urgent")}</option>
            <option value="high">{t("tasks.high")}</option>
            <option value="medium">{t("tasks.medium")}</option>
            <option value="low">{t("tasks.low")}</option>
            <option value="none">{t("common.none")}</option>
          </select>

          {/* Group by */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as TaskGroupBy)}
            className="bg-bg-tertiary text-text-primary text-xs px-2.5 py-1.5 rounded-lg border border-border-primary"
          >
            <option value="none">{t("tasks.noGrouping")}</option>
            <option value="priority">{t("tasks.groupByPriority")}</option>
            <option value="dueDate">{t("tasks.groupByDueDate")}</option>
            <option value="tag">{t("tasks.groupByTag")}</option>
          </select>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-2 bg-accent/5 border-b border-accent/20">
          <span className="text-xs text-text-secondary">{t("tasks.selected", { count: selectedIds.size })}</span>
          <button
            onClick={handleBulkComplete}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
          >
            <CheckCircle2 size={13} />
            {t("tasks.complete")}
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1 text-xs text-danger hover:opacity-80"
          >
            <Trash2 size={13} />
            {t("common.delete")}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-text-tertiary hover:text-text-primary ml-auto"
          >
            {t("emailList.clearSelection")}
          </button>
        </div>
      )}

      {/* Quick add */}
      <div className="border-b border-border-primary px-2">
        <TaskQuickAdd onAdd={handleAddTask} />
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto py-2 px-3">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckSquare size={48} className="text-text-tertiary/30 mb-4" />
            <p className="text-sm text-text-secondary mb-1">{t("tasks.noTasks")}</p>
            <p className="text-xs text-text-tertiary">
              {searchQuery ? t("tasks.tryDifferentSearch") : t("tasks.addTaskHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedTasks.map((group) => (
              <div key={group.label || "__ungrouped"}>
                {group.label && (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2 px-3">
                    {group.label}
                  </h3>
                )}
                <div className="space-y-0.5">
                  {group.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      subtasks={subtaskMap[task.id]}
                      onToggleComplete={handleToggleComplete}
                      onSelect={setSelectedTaskId}
                      onDelete={handleDelete}
                      isSelected={selectedTaskId === task.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
