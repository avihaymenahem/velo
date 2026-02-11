import { useState, useCallback, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { useLabelStore, type Label } from "@/stores/labelStore";

// Gmail's predefined label colors (background, text)
export const GMAIL_LABEL_COLORS: { bg: string; fg: string }[] = [
  { bg: "#000000", fg: "#ffffff" },
  { bg: "#434343", fg: "#ffffff" },
  { bg: "#666666", fg: "#ffffff" },
  { bg: "#999999", fg: "#ffffff" },
  { bg: "#cccccc", fg: "#000000" },
  { bg: "#efefef", fg: "#000000" },
  { bg: "#f691b2", fg: "#000000" },
  { bg: "#fb4c2f", fg: "#ffffff" },
  { bg: "#ffd6a2", fg: "#000000" },
  { bg: "#fce8b3", fg: "#000000" },
  { bg: "#fbe983", fg: "#000000" },
  { bg: "#b9e4d0", fg: "#000000" },
  { bg: "#68dfa9", fg: "#000000" },
  { bg: "#16a765", fg: "#ffffff" },
  { bg: "#43d692", fg: "#000000" },
  { bg: "#98d7e4", fg: "#000000" },
  { bg: "#a4c2f4", fg: "#000000" },
  { bg: "#4a86e8", fg: "#ffffff" },
  { bg: "#6d9eeb", fg: "#000000" },
  { bg: "#b694e8", fg: "#000000" },
  { bg: "#cd74e6", fg: "#ffffff" },
  { bg: "#a479e2", fg: "#ffffff" },
  { bg: "#f7a7c0", fg: "#000000" },
  { bg: "#cc3a21", fg: "#ffffff" },
];

interface LabelFormProps {
  accountId: string;
  label?: Label | null;
  onDone: () => void;
  variant?: "settings" | "sidebar";
}

export function LabelForm({ accountId, label, onDone, variant = "settings" }: LabelFormProps) {
  const { createLabel, updateLabel } = useLabelStore();
  const [name, setName] = useState(label?.name ?? "");
  const [selectedColor, setSelectedColor] = useState<{ bg: string; fg: string } | null>(
    label?.colorBg ? { bg: label.colorBg, fg: label.colorFg ?? "#000000" } : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const color = selectedColor
        ? { textColor: selectedColor.fg, backgroundColor: selectedColor.bg }
        : undefined;

      if (label) {
        await updateLabel(accountId, label.id, {
          name: name.trim(),
          color: color ?? null,
        });
      } else {
        await createLabel(accountId, name.trim(), color);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save label");
    } finally {
      setIsSaving(false);
    }
  }, [accountId, name, selectedColor, label, isSaving, updateLabel, createLabel, onDone]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim() && !isSaving) {
      handleSave();
    } else if (e.key === "Escape") {
      onDone();
    }
  }, [handleSave, onDone, name, isSaving]);

  const isSidebar = variant === "sidebar";

  return (
    <div
      className={
        isSidebar
          ? "px-2 py-2 space-y-2"
          : "border border-border-primary rounded-md p-3 space-y-3"
      }
      onKeyDown={handleKeyDown}
    >
      {error && (
        <div className="flex items-center gap-2 px-2 py-1 bg-danger/10 text-danger text-xs rounded">
          <span className="flex-1 truncate">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0">
            <X size={10} />
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Label name"
        className={
          isSidebar
            ? "w-full px-2 py-1 bg-sidebar-hover border border-sidebar-text/20 rounded text-xs text-sidebar-text outline-none focus:border-accent"
            : "w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
        }
      />

      {/* Color picker */}
      <div>
        <div className={`flex flex-wrap gap-1 ${isSidebar ? "gap-1" : "gap-1.5"}`}>
          <button
            onClick={() => setSelectedColor(null)}
            className={`${isSidebar ? "w-4 h-4" : "w-5 h-5"} rounded-full border-2 transition-colors ${
              selectedColor === null
                ? "border-accent ring-1 ring-accent"
                : "border-border-primary hover:border-text-tertiary"
            }`}
            title="No color"
          >
            <X size={isSidebar ? 8 : 10} className="mx-auto text-text-tertiary" />
          </button>
          {GMAIL_LABEL_COLORS.map((color) => (
            <button
              key={color.bg}
              onClick={() => setSelectedColor(color)}
              className={`${isSidebar ? "w-4 h-4" : "w-5 h-5"} rounded-full border-2 transition-colors ${
                selectedColor?.bg === color.bg
                  ? "border-accent ring-1 ring-accent"
                  : "border-transparent hover:border-text-tertiary"
              }`}
              style={{ backgroundColor: color.bg }}
              title={color.bg}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!name.trim() || isSaving}
          className={`${
            isSidebar ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
          } font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isSaving ? "Saving..." : label ? "Update" : "Save"}
        </button>
        <button
          onClick={onDone}
          className={`${
            isSidebar ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
          } text-text-secondary hover:text-text-primary rounded-md transition-colors`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
