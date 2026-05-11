import { X } from "lucide-react";

interface TagPillProps {
  name: string;
  color: string | null;
  onRemove?: () => void;
  size?: "sm" | "md";
}

export function TagPill({ name, color, onRemove, size = "sm" }: TagPillProps) {
  const pillColor = color ?? "var(--color-accent, #6366f1)";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${
        size === "sm"
          ? "px-2 py-0.5 text-[0.625rem]"
          : "px-2.5 py-1 text-xs"
      }`}
      style={{
        backgroundColor: `${pillColor}20`,
        color: pillColor,
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
        >
          <X size={size === "sm" ? 10 : 12} />
        </button>
      )}
    </span>
  );
}
