import { useState, useCallback, useRef, useEffect } from "react";
import {
  Circle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Trash2,
  Calendar,
  RepeatIcon,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { DbTask, TaskPriority, TaskDirection } from "@/services/db/tasks";

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

function isOverdue(timestamp: number): boolean {
  return timestamp < Math.floor(Date.now() / 1000);
}

function tsToDateInput(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0]!;
}

interface TaskEditData {
  title: string;
  direction: TaskDirection;
  dueDate: number | null;
}

interface TaskItemProps {
  task: DbTask;
  subtasks?: DbTask[];
  onToggleComplete: (id: string, completed: boolean) => void;
  onSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDueDateChange?: (id: string, dueDate: number | null) => void;
  onEdit?: (id: string, updates: Partial<TaskEditData>) => void;
  isSelected?: boolean;
  compact?: boolean;
  accountColor?: string;
}

export function TaskItem({
  task,
  subtasks,
  onToggleComplete,
  onSelect,
  onDelete,
  onDueDateChange,
  onEdit,
  isSelected,
  compact,
  accountColor,
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDirection, setEditDirection] = useState<TaskDirection>(task.direction);
  const [editDueDate, setEditDueDate] = useState<string>(task.due_date ? tsToDateInput(task.due_date) : "");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const tags: string[] = (() => {
    try { return JSON.parse(task.tags_json) as string[]; } catch { return []; }
  })();

  const hasSubtasks = subtasks && subtasks.length > 0;
  const completedSubtasks = subtasks?.filter((s) => s.is_completed).length ?? 0;
  const hasRecurrence = !!task.recurrence_rule;
  const isIncoming = task.direction === "incoming";
  const overdue = !task.is_completed && task.due_date !== null && isOverdue(task.due_date);

  // Keep edit state in sync when task prop changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(task.title);
      setEditDirection(task.direction);
      setEditDueDate(task.due_date ? tsToDateInput(task.due_date) : "");
    }
  }, [task.title, task.direction, task.due_date, isEditing]);

  // Auto-focus title on edit open
  useEffect(() => {
    if (isEditing) setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [isEditing]);

  const handleOpenEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onEdit) return;
    setEditTitle(task.title);
    setEditDirection(task.direction);
    setEditDueDate(task.due_date ? tsToDateInput(task.due_date) : "");
    setIsEditing(true);
  }, [onEdit, task.title, task.direction, task.due_date]);

  const handleSaveEdit = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    const dueDate = editDueDate
      ? Math.floor(new Date(editDueDate).getTime() / 1000)
      : null;
    onEdit?.(task.id, { title: trimmed, direction: editDirection, dueDate });
    setIsEditing(false);
  }, [task.id, editTitle, editDirection, editDueDate, onEdit]);

  const handleCancelEdit = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(false);
  }, []);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); handleSaveEdit(); }
    if (e.key === "Escape") handleCancelEdit();
  }, [handleSaveEdit, handleCancelEdit]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleComplete(task.id, !task.is_completed);
  }, [task.id, task.is_completed, onToggleComplete]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(task.id);
  }, [task.id, onDelete]);

  const handleDateClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDueDateChange) return;
    setEditingDate(true);
    // Focus the hidden input after render
    setTimeout(() => dateInputRef.current?.focus(), 0);
  }, [onDueDateChange]);

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const ts = val ? Math.floor(new Date(val).getTime() / 1000) : null;
    onDueDateChange?.(task.id, ts);
    setEditingDate(false);
  }, [task.id, onDueDateChange]);

  const handleDateBlur = useCallback(() => {
    setEditingDate(false);
  }, []);

  const dueDateClass = overdue
    ? "text-red-500 bg-red-500/10 font-medium"
    : task.due_date && (task.due_date - Math.floor(Date.now() / 1000)) < 86400
    ? "text-amber-500 bg-amber-500/10"
    : "text-text-tertiary bg-bg-tertiary";

  // ── Inline edit mode ─────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-3 py-2 rounded-lg border border-accent/40 bg-accent/5 space-y-2"
      >
        {/* Title */}
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="w-full bg-bg-tertiary border border-border-primary rounded px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />

        <div className="flex items-center gap-2 flex-wrap">
          {/* Direction toggle */}
          <div className="flex items-center rounded overflow-hidden border border-border-primary text-[0.6875rem]">
            <button
              onClick={() => setEditDirection("incoming")}
              className={`flex items-center gap-0.5 px-2 py-1 transition-colors ${
                editDirection === "incoming"
                  ? "bg-blue-500/20 text-blue-400"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <ArrowDownLeft size={10} />
              Incoming
            </button>
            <button
              onClick={() => setEditDirection("outgoing")}
              className={`flex items-center gap-0.5 px-2 py-1 transition-colors ${
                editDirection === "outgoing"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <ArrowUpRight size={10} />
              Outgoing
            </button>
          </div>

          {/* Due date */}
          <div className="flex items-center gap-1">
            <Calendar size={11} className="text-text-tertiary" />
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="bg-bg-tertiary border border-border-primary rounded px-2 py-0.5 text-[0.6875rem] text-text-primary outline-none focus:border-accent"
            />
            {editDueDate && (
              <button
                onClick={() => setEditDueDate("")}
                className="text-text-tertiary hover:text-danger transition-colors"
                title="Clear due date"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        {/* Save / Cancel */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={handleSaveEdit}
            disabled={!editTitle.trim()}
            className="flex items-center gap-1 text-xs text-accent hover:opacity-80 font-medium disabled:opacity-40"
          >
            <Check size={12} />
            Save
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-xs text-text-tertiary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div>
      <div
        onClick={() => onSelect?.(task.id)}
        className={`group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected ? "bg-accent/10 border border-accent/20" : "hover:bg-bg-hover border border-transparent"
        } ${task.is_completed ? "opacity-60" : ""}`}
      >
        {/* Account color stripe */}
        {accountColor && (
          <span
            className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: accountColor }}
          />
        )}

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
              {/* Direction badge */}
              <span
                className={`inline-flex items-center gap-0.5 text-[0.6875rem] px-1.5 py-0.5 rounded ${
                  isIncoming ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {isIncoming ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                {isIncoming ? "Incoming" : "Outgoing"}
              </span>

              {/* Due date — clickable for inline edit */}
              {task.due_date !== null && !editingDate && (
                <button
                  onClick={handleDateClick}
                  className={`inline-flex items-center gap-1 text-[0.6875rem] px-1.5 py-0.5 rounded transition-opacity hover:opacity-80 ${dueDateClass}`}
                  title={onDueDateChange ? "Click to edit due date" : undefined}
                >
                  {overdue && <AlertTriangle size={10} className="text-red-500" />}
                  <Calendar size={10} />
                  {formatDueDate(task.due_date)}
                </button>
              )}

              {/* Inline date input (quick-edit via date badge click) */}
              {editingDate && (
                <input
                  ref={dateInputRef}
                  type="date"
                  defaultValue={task.due_date ? tsToDateInput(task.due_date) : ""}
                  onChange={handleDateChange}
                  onBlur={handleDateBlur}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-bg-tertiary border border-accent text-text-primary outline-none"
                />
              )}

              {hasRecurrence && (
                <span className="inline-flex items-center gap-0.5 text-[0.6875rem] text-text-tertiary">
                  <RepeatIcon size={10} />
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
          {onEdit && (
            <button
              onClick={handleOpenEdit}
              title="Edit task"
              className="p-0.5 text-text-tertiary hover:text-accent transition-colors"
            >
              <Pencil size={13} />
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
