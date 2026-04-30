import { useState, useRef, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { SendAsAlias } from "@/services/db/sendAsAliases";
import { useClickOutside } from "@/hooks/useClickOutside";

interface FromSelectorProps {
  aliases: SendAsAlias[];
  selectedEmail: string;
  onChange: (alias: SendAsAlias) => void;
}

/**
 * Dropdown for selecting a send-as alias in the composer.
 * Only visible when more than one alias is available.
 */
export function FromSelector({ aliases, selectedEmail, onChange }: FromSelectorProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(dropdownRef, () => setOpen(false));

  if (aliases.length <= 1) return null;

  const handleSelect = useCallback(
    (email: string) => {
      const alias = aliases.find((a) => a.email === email);
      if (alias) {
        onChange(alias);
      }
      setOpen(false);
    },
    [aliases, onChange],
  );

  const currentAlias = aliases.find((a) => a.email === selectedEmail);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-text-secondary border border-border-primary rounded hover:bg-bg-hover hover:text-text-primary transition-colors"
      >
        <span className="truncate max-w-[120px]">
          {currentAlias?.displayName
            ? `${currentAlias.displayName} <${currentAlias.email}>`
            : currentAlias?.email ?? "Select account"}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 text-text-secondary transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 py-1 w-80 rounded-lg border border-border-primary bg-bg-primary shadow-lg z-50 glass-panel">
          <div className="px-3 py-1.5 text-[0.625rem] font-medium text-text-tertiary uppercase tracking-wider">
            Send as
          </div>
          <div className="border-t border-border-primary my-1" />
          {aliases.map((alias) => {
            const isActive = alias.email === selectedEmail;
            const displayText = alias.displayName
              ? `${alias.displayName} <${alias.email}>`
              : alias.email;
            return (
              <button
                key={alias.id}
                onClick={() => handleSelect(alias.email)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "bg-accent/8 text-accent"
                    : "text-text-primary hover:bg-bg-hover"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-tight">
                    {displayText}
                  </div>
                </div>
                {isActive && (
                  <Check size={12} className="shrink-0 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
