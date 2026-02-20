import { useState, useRef, useCallback } from "react";
import { useAccountStore, type Account } from "@/stores/accountStore";
import { ChevronDown, Check, Plus, UserPlus, Calendar } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";

interface AccountSwitcherProps {
  collapsed: boolean;
  onAddAccount: () => void;
}

export function AccountSwitcher({
  collapsed,
  onAddAccount,
}: AccountSwitcherProps) {
  const { accounts, activeAccountId, setActiveAccount } = useAccountStore();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(dropdownRef, () => setOpen(false));

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  const handleSwitch = useCallback(
    (id: string) => {
      setActiveAccount(id);
      setOpen(false);
    },
    [setActiveAccount],
  );

  const handleAdd = useCallback(() => {
    onAddAccount();
    setOpen(false);
  }, [onAddAccount]);

  // No accounts — prompt to add
  if (accounts.length === 0) {
    return (
      <div className="p-3">
        <button
          onClick={onAddAccount}
          className={`flex items-center w-full rounded-lg p-2 text-sm text-sidebar-text/70 hover:bg-sidebar-hover hover:text-sidebar-text transition-colors ${
            collapsed ? "justify-center" : "gap-3"
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <UserPlus size={16} className="text-accent" />
          </div>
          {!collapsed && <span className="font-medium">Add Account</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="relative p-2" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center w-full rounded-lg p-1.5 hover:bg-sidebar-hover transition-colors ${
          collapsed ? "justify-center" : "gap-2.5"
        } ${open ? "bg-sidebar-hover" : ""}`}
      >
        <ActiveAvatar account={activeAccount} />
        {!collapsed && activeAccount && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-sidebar-text truncate leading-tight">
                {activeAccount.displayName || activeAccount.email.split("@")[0]}
              </div>
              <div className="text-xs text-sidebar-text/50 truncate leading-tight">
                {activeAccount.email}
              </div>
            </div>
            <ChevronDown
              size={14}
              className={`shrink-0 text-sidebar-text/40 transition-transform duration-200 ${
                open ? "rotate-180" : ""
              }`}
            />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute z-50 mt-1 py-1 rounded-lg border border-border-primary bg-bg-primary shadow-lg glass-panel ${
            collapsed ? "left-full ml-1 top-0 w-64" : "left-2 right-2"
          }`}
        >
          {accounts.length > 1 && (
            <div className="px-3 py-1.5 text-[0.625rem] font-medium text-text-tertiary uppercase tracking-wider">
              Accounts
            </div>
          )}
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            return (
              <button
                key={account.id}
                onClick={() => handleSwitch(account.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-accent/8 text-accent"
                    : "text-text-primary hover:bg-bg-hover"
                }`}
              >
                <AccountAvatarSmall account={account} isActive={isActive} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate leading-tight flex items-center gap-1.5">
                    {account.displayName || account.email.split("@")[0]}
                    {account.provider === "caldav" && (
                      <Calendar size={12} className="shrink-0 text-text-tertiary" />
                    )}
                  </div>
                  <div className="text-xs text-text-secondary truncate leading-tight">
                    {account.email}
                  </div>
                </div>
                {isActive && (
                  <Check size={14} className="shrink-0 text-accent" />
                )}
              </button>
            );
          })}
          <div className="border-t border-border-primary my-1" />
          <button
            onClick={handleAdd}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0">
              <Plus size={14} />
            </div>
            <span>Add account</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The main avatar shown in the trigger — slightly larger */
function ActiveAvatar({ account }: { account: Account | undefined }) {
  const [imgError, setImgError] = useState(false);

  if (!account) return null;

  const initial = (
    account.displayName?.[0] ?? account.email[0] ?? "?"
  ).toUpperCase();
  const showImg = account.avatarUrl && !imgError;

  return (
    <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0 text-sm font-semibold overflow-hidden">
      {showImg ? (
        <img
          key={account.avatarUrl}
          src={account.avatarUrl!}
          alt={account.email}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}

/** Smaller avatar used inside the dropdown list */
function AccountAvatarSmall({
  account,
  isActive,
}: {
  account: Account;
  isActive: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  const initial = (
    account.displayName?.[0] ?? account.email[0] ?? "?"
  ).toUpperCase();
  const showImg = account.avatarUrl && !imgError;

  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold overflow-hidden ${
        isActive
          ? "bg-accent text-white"
          : "bg-accent/12 text-accent"
      }`}
    >
      {showImg ? (
        <img
          key={account.avatarUrl}
          src={account.avatarUrl!}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initial
      )}
    </div>
  );
}
