import { useState, useRef, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { Account } from "@/stores/accountStore";
import { useClickOutside } from "@/hooks/useClickOutside";

interface ComposerAccountSwitcherProps {
  accounts: Account[];
  currentAccountId: string | null;
  onSwitch: (accountId: string | null) => void;
}

/**
 * Compact account switcher for the composer header.
 * Shows the current account email and a dropdown to switch.
 */
export function ComposerAccountSwitcher({
  accounts,
  currentAccountId,
  onSwitch,
}: ComposerAccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(dropdownRef, () => setOpen(false));

  const currentAccount = accounts.find((a) => a.id === currentAccountId);

  const handleSwitch = useCallback(
    (id: string) => {
      onSwitch(id);
      setOpen(false);
    },
    [onSwitch],
  );

  if (accounts.length <= 1) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
      >
        <span className="truncate max-w-[150px]">
          {currentAccount?.email ?? "Select account"}
        </span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 py-1 w-64 rounded-lg border border-border-primary bg-bg-primary shadow-lg z-50 glass-panel">
          <div className="px-3 py-1.5 text-[0.625rem] font-medium text-text-tertiary uppercase tracking-wider">
            Send as
          </div>
          {accounts.map((account) => {
            const isActive = account.id === currentAccountId;
            return (
              <button
                key={account.id}
                onClick={() => handleSwitch(account.id)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
                  isActive
                    ? "bg-accent/8 text-accent"
                    : "text-text-primary hover:bg-bg-hover"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0 text-xs font-semibold">
                  {(account.displayName?.[0] ?? account.email[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate leading-tight">
                    {account.displayName || account.email.split("@")[0]}
                  </div>
                  <div className="text-[0.625rem] text-text-tertiary truncate leading-tight">
                    {account.email}
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
