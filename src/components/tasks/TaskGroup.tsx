import { useState, useCallback } from "react";
import { Mail, ExternalLink, CheckCircle2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import type { DbTask } from "@/services/db/tasks";
import { TaskItem } from "./TaskItem";
import { navigateToLabel } from "@/router/navigate";

interface TaskGroupProps {
  threadId: string | null;
  threadSubject: string | null;
  accountColor?: string;
  tasks: DbTask[];
  subtaskMap: Record<string, DbTask[]>;
  onToggleComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onDueDateChange: (id: string, dueDate: number | null) => void;
  onEdit?: (id: string, updates: { title?: string; direction?: import("@/services/db/tasks").TaskDirection; dueDate?: number | null }) => void;
  onCompleteAll?: (taskIds: string[]) => void;
  selectedTaskId?: string | null;
  onSelect?: (id: string) => void;
}

function hasOverdue(tasks: DbTask[]): boolean {
  const now = Math.floor(Date.now() / 1000);
  return tasks.some((t) => !t.is_completed && t.due_date !== null && t.due_date < now);
}

export function TaskGroup({
  threadId,
  threadSubject,
  accountColor,
  tasks,
  subtaskMap,
  onToggleComplete,
  onDelete,
  onDueDateChange,
  onEdit,
  onCompleteAll,
  selectedTaskId,
  onSelect,
}: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const isGeneral = threadId === null;
  const overdueAlert = !isGeneral && hasOverdue(tasks);
  const incompleteTasks = tasks.filter((t) => !t.is_completed);

  const handleOpenThread = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (threadId) navigateToLabel("all", { threadId });
  }, [threadId]);

  const handleCompleteAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCompleteAll?.(incompleteTasks.map((t) => t.id));
  }, [incompleteTasks, onCompleteAll]);

  const displaySubject = isGeneral
    ? "Attività Generali"
    : (threadSubject?.trim() || "Thread senza oggetto");

  return (
    <div className="rounded-lg border border-border-primary overflow-hidden">
      {/* Group header */}
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none transition-colors ${
          overdueAlert
            ? "bg-red-500/5 border-b border-red-500/20"
            : "bg-bg-secondary/60 border-b border-border-secondary"
        } hover:bg-bg-hover`}
        onClick={() => setCollapsed(!collapsed)}
      >
        {/* Collapse toggle */}
        <button className="shrink-0 text-text-tertiary">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* Account color dot */}
        {accountColor && !isGeneral && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: accountColor }}
          />
        )}

        {/* Icon */}
        {isGeneral ? (
          <CheckCircle2 size={13} className="text-text-tertiary shrink-0" />
        ) : (
          <Mail size={13} className={overdueAlert ? "text-red-400 shrink-0" : "text-text-tertiary shrink-0"} />
        )}

        {/* Subject */}
        <span
          className={`flex-1 min-w-0 text-xs font-medium truncate ${
            overdueAlert ? "text-red-400" : "text-text-primary"
          }`}
        >
          {displaySubject}
        </span>

        {/* Overdue badge */}
        {overdueAlert && (
          <span className="flex items-center gap-0.5 text-[0.6rem] text-red-400 shrink-0 font-semibold uppercase tracking-wide">
            <AlertTriangle size={10} />
            Overdue
          </span>
        )}

        {/* Task count */}
        <span className="text-[0.6875rem] text-text-tertiary shrink-0">
          {incompleteTasks.length}/{tasks.length}
        </span>

        {/* Actions — shown on hover */}
        <div className="flex items-center gap-1 shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
          {!isGeneral && incompleteTasks.length > 0 && onCompleteAll && (
            <button
              onClick={handleCompleteAll}
              title="Mark all tasks in this thread as complete"
              className="p-0.5 text-text-tertiary hover:text-success transition-colors"
            >
              <CheckCircle2 size={13} />
            </button>
          )}
          {!isGeneral && (
            <button
              onClick={handleOpenThread}
              title="Open email thread"
              className="p-0.5 text-text-tertiary hover:text-accent transition-colors"
            >
              <ExternalLink size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Task list */}
      {!collapsed && (
        <div className="bg-bg-primary/40 py-0.5">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              subtasks={subtaskMap[task.id]}
              onToggleComplete={onToggleComplete}
              onSelect={onSelect}
              onDelete={onDelete}
              onDueDateChange={onDueDateChange}
              onEdit={onEdit}
              isSelected={selectedTaskId === task.id}
              accountColor={accountColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}
