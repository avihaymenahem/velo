import { useState, useCallback } from "react";
import {
  Circle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Trash2,
  Calendar,
  RepeatIcon,
  Link2,
} from "lucide-react";
import type { DbTask, TaskPriority } from "@/services/db/tasks";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  none: "text-text-tertiary",
  low: "text-blue-400",
  medium: "text-amber-400",
  high: "text-orange-500",
  urgent: "text-red-500",
};

const PRIORITY_DOT_COLORS: Record<TaskPriority, string> = {
  none: "bg-text-tertiary/30",
  low: "bg-blue-400",
  medium: "bg-amber-400",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

function formatDueDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDueDateColor(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = timestamp - now;
  if (diff < 0) return "text-red-500 bg-red-500/10";
  if (diff < 86400) return "text-amber-500 bg-amber-500/10";
  return "text-text-tertiary bg-bg-tertiary";
}

interface TaskItemProps {
  task: DbTask;
  subtasks?: DbTask[];
  onToggleComplete: (id: string, completed: boolean) => void;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  isSelected?: boolean;
  compact?: boolean;
}

export function TaskItem({
  task,
  subtasks,
  onToggleComplete,
  onSelect,
  onDelete,
  isSelected,
  compact,
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const tags: string[] = (() => {
    try {
      return JSON.parse(task.tags_json) as string[];
    } catch {
      return [];
    }
  })();

  const hasSubtasks = subtasks && subtasks.length > 0;
  const completedSubtasks = subtasks?.filter((s) => s.is_completed).length ?? 0;
  const hasRecurrence = !!task.recurrence_rule;

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleComplete(task.id, !task.is_completed);
  }, [task.id, task.is_completed, onToggleComplete]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(task.id);
  }, [task.id, onDelete]);

  return (
    <div>
      <div
        onClick={() => onSelect?.(task.id)}
        className={`group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected ? "bg-accent/10 border border-accent/20" : "hover:bg-bg-hover border border-transparent"
        } ${task.is_completed ? "opacity-60" : ""}`}
      >
        {/* Checkbox */}
        <button onClick={handleToggle} className="mt-0.5 shrink-0">
          {task.is_completed ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <Circle size={16} className={PRIORITY_COLORS[task.priority]} />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.priority !== "none" && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT_COLORS[task.priority]}`} />
            )}
            <span
              className={`text-sm truncate ${
                task.is_completed ? "line-through text-text-tertiary" : "text-text-primary"
              }`}
            >
              {task.title}
            </span>
          </div>

          {!compact && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {task.due_date && (
                <span className={`inline-flex items-center gap-1 text-[0.6875rem] px-1.5 py-0.5 rounded ${getDueDateColor(task.due_date)}`}>
                  <Calendar size={10} />
                  {formatDueDate(task.due_date)}
                </span>
              )}
              {hasRecurrence && (
                <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-text-tertiary">
                  <RepeatIcon size={10} />
                </span>
              )}
              {task.thread_id && (
                <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-accent/70">
                  <Link2 size={10} />
                </span>
              )}
              {hasSubtasks && (
                <span className="text-[0.6875rem] text-text-tertiary">
                  {completedSubtasks}/{subtasks.length}
                </span>
              )}
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasSubtasks && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
              className="p-0.5 text-text-tertiary hover:text-text-primary"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-0.5 text-text-tertiary hover:text-danger transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Subtasks */}
      {expanded && hasSubtasks && (
        <div className="ml-7 mt-0.5 space-y-0.5">
          {subtasks.map((sub) => (
            <TaskItem
              key={sub.id}
              task={sub}
              onToggleComplete={onToggleComplete}
              onSelect={onSelect}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
