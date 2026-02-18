import { useState, useEffect, useCallback } from "react";
import { X, ExternalLink } from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";
import { useUIStore } from "@/stores/uiStore";
import {
  getTasksForThread,
  insertTask,
  completeTask,
  uncompleteTask,
  deleteTask as dbDeleteTask,
  getSubtasks,
} from "@/services/db/tasks";
import type { DbTask } from "@/services/db/tasks";
import { handleRecurringTaskCompletion } from "@/services/tasks/taskManager";
import { TaskItem } from "./TaskItem";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { navigateToLabel } from "@/router/navigate";

interface TaskSidebarProps {
  accountId: string;
  threadId: string;
}

export function TaskSidebar({ accountId, threadId }: TaskSidebarProps) {
  const threadTasks = useTaskStore((s) => s.threadTasks);
  const setThreadTasks = useTaskStore((s) => s.setThreadTasks);
  const toggleTaskSidebar = useUIStore((s) => s.toggleTaskSidebar);

  useEffect(() => {
    let cancelled = false;
    getTasksForThread(accountId, threadId).then((tasks) => {
      if (!cancelled) setThreadTasks(tasks);
    });
    return () => { cancelled = true; };
  }, [accountId, threadId, setThreadTasks]);

  const handleAddTask = useCallback(async (title: string) => {
    const id = await insertTask({
      accountId,
      title,
      threadId,
      threadAccountId: accountId,
    });
    // Refresh
    const tasks = await getTasksForThread(accountId, threadId);
    setThreadTasks(tasks);
    useTaskStore.getState().setIncompleteCount(
      useTaskStore.getState().incompleteCount + 1,
    );
    return id;
  }, [accountId, threadId, setThreadTasks]);

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
    const tasks = await getTasksForThread(accountId, threadId);
    setThreadTasks(tasks);
    // Update count
    const { getIncompleteTaskCount } = await import("@/services/db/tasks");
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, threadId, setThreadTasks, threadTasks]);

  const handleDelete = useCallback(async (id: string) => {
    await dbDeleteTask(id);
    const tasks = await getTasksForThread(accountId, threadId);
    setThreadTasks(tasks);
    const { getIncompleteTaskCount } = await import("@/services/db/tasks");
    const count = await getIncompleteTaskCount(accountId);
    useTaskStore.getState().setIncompleteCount(count);
  }, [accountId, threadId, setThreadTasks]);

  // Load subtasks for each task
  const [subtaskMap, setSubtaskMap] = useState<Record<string, DbTask[]>>({});

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

  return (
    <div className="w-72 border-l border-border-primary bg-bg-primary/50 flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-secondary">
        <h3 className="text-sm font-semibold text-text-primary">Tasks</h3>
        <div className="flex items-center gap-1">
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
