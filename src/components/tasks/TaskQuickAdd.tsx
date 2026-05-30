import { useState, useCallback, useRef } from "react";
import { Plus, Flag } from "lucide-react";
import { t } from "@/i18n";
import type { TaskPriority } from "@/services/db/tasks";

const PRIORITY_FLAG_COLORS: Record<TaskPriority, string> = {
  none: "text-text-tertiary",
  low: "text-blue-400",
  medium: "text-amber-400",
  high: "text-orange-500",
  urgent: "text-red-500",
};

interface TaskQuickAddProps {
  onAdd: (title: string, priority: TaskPriority) => void;
  placeholder?: string;
}

export function TaskQuickAdd({ onAdd, placeholder }: TaskQuickAddProps) {
  const resolvedPlaceholder = placeholder ?? t("tasks.quickAddPlaceholder");
  const [value, setValue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("none");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed, priority);
    setValue("");
    setPriority("none");
    inputRef.current?.focus();
  }, [value, priority, onAdd]);

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Plus size={14} className="text-text-tertiary shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={resolvedPlaceholder}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
      />
      <div className="relative shrink-0 flex items-center">
        <Flag size={13} className={PRIORITY_FLAG_COLORS[priority]} />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          aria-label={t("tasks.item.priorityLabel")}
          className="absolute inset-0 opacity-0 cursor-pointer w-full"
        >
          <option value="none">{t("tasks.priorityNone")}</option>
          <option value="low">{t("tasks.priorityLow")}</option>
          <option value="medium">{t("tasks.priorityMedium")}</option>
          <option value="high">{t("tasks.priorityHigh")}</option>
          <option value="urgent">{t("tasks.priorityUrgent")}</option>
        </select>
      </div>
    </div>
  );
}
