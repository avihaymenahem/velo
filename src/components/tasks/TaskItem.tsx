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
import { t } from "@/i18n";
import type { DbTask, TaskPriority, TaskDirection } from "@/services/db/tasks";

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  none: "text-text-tertiary",
  low: "text-blue-400",
  medium: "text-amber-400",
  high: "text-orange-500",
  urgent: "text-red-500",
};


function formatDueDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return t("tasks.item.daysAgo", { n: Math.abs(diffDays) });
  if (diffDays === 0) return t("tasks.item.today");
  if (diffDays === 1) return t("tasks.item.tomorrow");
  if (diffDays <= 7) return t("tasks.item.inDays", { n: diffDays });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  priority: TaskPriority;
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
  isHighlighted?: boolean;
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
  isHighlighted,
  compact,
  accountColor,
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDirection, setEditDirection] = useState<TaskDirection>(task.direction);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
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

  useEffect(() => {
    if (!isEditing) {
      setEditTitle(task.title);
      setEditDirection(task.direction);
      setEditPriority(task.priority);
      setEditDueDate(task.due_date ? tsToDateInput(task.due_date) : "");
    }
  }, [task.title, task.direction, task.priority, task.due_date, isEditing]);

  useEffect(() => {
    if (isEditing) setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [isEditing]);

  const handleOpenEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onEdit) return;
    setEditTitle(task.title);
    setEditDirection(task.direction);
    setEditPriority(task.priority);
    setEditDueDate(task.due_date ? tsToDateInput(task.due_date) : "");
    setIsEditing(true);
  }, [onEdit, task.title, task.direction, task.priority, task.due_date]);

  const handleSaveEdit = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    const dueDate = editDueDate
      ? Math.floor(new Date(editDueDate).getTime() / 1000)
      : null;
    onEdit?.(task.id, { title: trimmed, direction: editDirection, priority: editPriority, dueDate });
    setIsEditing(false);
  }, [task.id, editTitle, editDirection, editPriority, editDueDate, onEdit]);

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

  if (isEditing) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="px-3 py-2 rounded-lg border border-accent/40 bg-accent/5 space-y-2"
      >
        <input
          ref={titleInputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={handleEditKeyDown}
          className="w-full bg-bg-tertiary border border-border-primary rounded px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />

        <div className="flex items-center gap-2 flex-wrap">
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
              {t("tasks.sidebar.incoming")}
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
              {t("tasks.page.outbox")}
            </button>
          </div>

          <select
            value={editPriority}
            onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
            onClick={(e) => e.stopPropagation()}
            aria-label={t("tasks.item.priorityLabel")}
            className="bg-bg-tertiary border border-border-primary rounded px-2 py-0.5 text-[0.6875rem] text-text-primary outline-none focus:border-accent"
          >
            <option value="none">{t("tasks.priorityNone")}</option>
            <option value="low">{t("tasks.priorityLow")}</option>
            <option value="medium">{t("tasks.priorityMedium")}</option>
            <option value="high">{t("tasks.priorityHigh")}</option>
            <option value="urgent">{t("tasks.priorityUrgent")}</option>
          </select>

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
                title={t("tasks.item.clearDueDate")}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={handleSaveEdit}
            disabled={!editTitle.trim()}
            className="flex items-center gap-1 text-xs text-accent hover:opacity-80 font-medium disabled:opacity-40"
          >
            <Check size={12} />
            {t("common.save")}
          </button>
          <button
            onClick={handleCancelEdit}
            className="text-xs text-text-tertiary hover:text-text-primary"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-task-id={task.id}>
      <div
        onClick={() => onSelect?.(task.id)}
        className={`group flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
          isHighlighted
            ? "bg-accent/10 ring-2 ring-accent/50 border border-accent/30"
            : isSelected
              ? "bg-accent/10 border border-accent/20"
              : "hover:bg-bg-hover border border-transparent"
        } ${task.is_completed ? "opacity-60" : ""}`}
      >
        {accountColor && (
          <span
            className="w-0.5 self-stretch rounded-full shrink-0 mt-0.5"
            style={{ backgroundColor: accountColor }}
          />
        )}

        <button onClick={handleToggle} className="mt-0.5 shrink-0">
          {task.is_completed ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <Circle size={16} className={PRIORITY_COLORS[task.priority]} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.priority === "urgent" && !task.is_completed && (
              <span className="text-red-500 text-xs font-bold shrink-0 leading-none">!!!</span>
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
              <span
                className={`inline-flex items-center gap-0.5 text-[0.6875rem] px-1.5 py-0.5 rounded ${
                  isIncoming ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {isIncoming ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                {isIncoming ? t("tasks.sidebar.incoming") : t("tasks.page.outbox")}
              </span>

              {task.due_date !== null && !editingDate && (
                <button
                  onClick={handleDateClick}
                  className={`inline-flex items-center gap-1 text-[0.6875rem] px-1.5 py-0.5 rounded transition-opacity hover:opacity-80 ${dueDateClass}`}
                  title={onDueDateChange ? t("tasks.item.editTask") : undefined}
                >
                  {overdue && <AlertTriangle size={10} className="text-red-500" />}
                  <Calendar size={10} />
                  {formatDueDate(task.due_date)}
                </button>
              )}

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
              title={t("tasks.item.editTask")}
              className="p-0.5 text-text-tertiary hover:text-accent transition-colors"
            >
              <Pencil size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              title={t("tasks.item.deleteTask")}
              className="p-0.5 text-text-tertiary hover:text-danger transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

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
