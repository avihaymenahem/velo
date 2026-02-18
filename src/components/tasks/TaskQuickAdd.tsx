import { useState, useCallback, useRef } from "react";
import { Plus } from "lucide-react";

interface TaskQuickAddProps {
  onAdd: (title: string) => void;
  placeholder?: string;
}

export function TaskQuickAdd({ onAdd, placeholder = "Add a task..." }: TaskQuickAddProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
    inputRef.current?.focus();
  }, [value, onAdd]);

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
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
      />
    </div>
  );
}
