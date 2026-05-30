import { useState } from "react";
import { t } from "@/i18n";
import { ChevronDown, ChevronRight, Inbox, Send, FileEdit, Trash2, Ban, Loader2, AlertCircle } from "lucide-react";
import type { Account } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { ACCOUNT_COLOR_PRESETS } from "@/constants/accountColors";

const ACCOUNT_FOLDERS: { id: string; label: string; labelId: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: t("sidebar.nav.inbox"), labelId: "INBOX", icon: Inbox },
  { id: "sent", label: t("sidebar.nav.sent"), labelId: "SENT", icon: Send },
  { id: "drafts", label: t("sidebar.nav.drafts"), labelId: "DRAFT", icon: FileEdit },
  { id: "trash", label: t("sidebar.nav.trash"), labelId: "TRASH", icon: Trash2 },
  { id: "spam", label: t("sidebar.nav.spam"), labelId: "SPAM", icon: Ban },
];

const DEFAULT_COLOR = ACCOUNT_COLOR_PRESETS[4]; // blue

interface AccountSectionProps {
  account: Account;
  sidebarCollapsed: boolean;
  unreadCounts: Record<string, number>;
  onFolderClick: (accountId: string, folder: string) => void;
  activeAccountId: string | null;
}

export function AccountSection({
  account,
  sidebarCollapsed,
  unreadCounts,
  onFolderClick,
  activeAccountId,
}: AccountSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const activeLabel = useActiveLabel();
  const color = account.color ?? DEFAULT_COLOR;
  const syncState = useUIStore((s) => s.accountSyncStatuses[account.id]);

  if (sidebarCollapsed) {
    const inboxUnread = unreadCounts["INBOX"] ?? 0;
    const isSyncing = syncState?.phase === "syncing";
    const isError = syncState?.phase === "error";
    return (
      <button
        onClick={() => onFolderClick(account.id, "inbox")}
        title={
          isError
            ? `Sync error: ${syncState?.error ?? "Unknown error"}`
            : (account.label ?? account.displayName ?? account.email)
        }
        className="relative flex items-center justify-center w-full py-2"
      >
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${isSyncing ? "opacity-70" : ""}`}
          style={{ backgroundColor: color }}
        >
          {(account.label ?? account.displayName ?? account.email)[0]?.toUpperCase()}
        </span>
        {isSyncing && (
          <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 size={20} className="animate-spin text-white/80" />
          </span>
        )}
        {isError && !isSyncing && (
          <span className="absolute bottom-1 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border border-sidebar-bg" />
        )}
        {inboxUnread > 0 && !isError && !isSyncing && (
          <span className="absolute top-1 right-2 text-[0.5rem] bg-accent text-white px-1 rounded-full leading-normal">
            {inboxUnread > 99 ? "99+" : inboxUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-sidebar-hover text-sidebar-text transition-colors"
      >
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="flex-1 truncate text-left text-[0.8125rem]">
          {account.label ?? account.displayName ?? account.email}
        </span>
        {!expanded && (unreadCounts["INBOX"] ?? 0) > 0 && (
          <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
            {unreadCounts["INBOX"]}
          </span>
        )}
        {syncState?.phase === "syncing" && (
          <Loader2 size={11} className="shrink-0 animate-spin text-sidebar-text/50" />
        )}
        {syncState?.phase === "error" && (
          <span title={syncState.error ?? "Sync error"} className="shrink-0 flex items-center">
            <AlertCircle size={12} className="text-red-400" />
          </span>
        )}
        {expanded ? (
          <ChevronDown size={13} className="shrink-0 text-sidebar-text/40" />
        ) : (
          <ChevronRight size={13} className="shrink-0 text-sidebar-text/40" />
        )}
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          {ACCOUNT_FOLDERS.map(({ id, label, labelId, icon: Icon }) => {
            const count = unreadCounts[labelId] ?? 0;
            const isActive =
              activeLabel === id &&
              (activeAccountId === null
                ? (account.includeInGlobal ?? false)
                : activeAccountId === account.id);
            return (
              <button
                key={id}
                onClick={() => onFolderClick(account.id, id)}
                className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-3 text-left text-[0.8125rem] transition-colors ${
                  isActive
                    ? "text-accent font-medium bg-accent/10"
                    : "text-sidebar-text/80 hover:text-sidebar-text hover:bg-sidebar-hover"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {count > 0 && id === "inbox" && (
                  <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
