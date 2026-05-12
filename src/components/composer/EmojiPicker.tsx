import { useState, useRef, useEffect, useCallback } from "react";
import { emojiCategories, recentEmojis } from "./emojiData";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<string>("Frequently Used");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleSelect = useCallback((emoji: string) => {
    if (!recentEmojis.includes(emoji)) {
      recentEmojis.unshift(emoji);
      if (recentEmojis.length > 20) recentEmojis.length = 20;
    }
    onSelect(emoji);
    onClose();
  }, [onSelect, onClose]);

  const currentCategory = emojiCategories.find((c) => c.name === activeTab)
    ?? emojiCategories[0];

  const allEmojis = activeTab === "Frequently Used" && recentEmojis.length > 0
    ? recentEmojis
    : (currentCategory?.emojis ?? []);

  return (
    <div
      ref={pickerRef}
      className="absolute left-0 top-full mt-1 w-72 bg-bg-secondary border border-border-primary rounded-lg shadow-xl z-50"
    >
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-border-secondary overflow-x-auto">
        {emojiCategories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => setActiveTab(cat.name)}
            title={cat.name}
            className={`px-1.5 py-0.5 text-[0.625rem] rounded whitespace-nowrap transition-colors ${
              activeTab === cat.name
                ? "bg-accent/10 text-accent font-medium"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {cat.name === "Frequently Used" ? "🕐" : cat.emojis[0]}
          </button>
        ))}
      </div>

      <div className="p-2 max-h-48 overflow-y-auto">
        {allEmojis.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">
            No recent emojis yet
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {allEmojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                onClick={() => handleSelect(emoji)}
                className="w-7 h-7 flex items-center justify-center text-base hover:bg-bg-hover rounded transition-colors"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
