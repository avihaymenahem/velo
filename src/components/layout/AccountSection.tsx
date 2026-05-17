import { useState } from "react";
import { ChevronDown, ChevronRight, Inbox, Send, FileEdit, Trash2, Ban } from "lucide-react";
import type { Account } from "@/stores/accountStore";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { ACCOUNT_COLOR_PRESETS } from "@/constants/accountColors";

const ACCOUNT_FOLDERS: { id: string; label: string; labelId: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", labelId: "INBOX", icon: Inbox },
  { id: "sent", label: "Sent", labelId: "SENT", icon: Send },
  { id: "drafts", label: "Drafts", labelId: "DRAFT", icon: FileEdit },
  { id: "trash", label: "Trash", labelId: "TRASH", icon: Trash2 },
  { id: "spam", label: "Spam", labelId: "SPAM", icon: Ban },
];

const DEFAULT_COLOR = ACCOUNT_COLOR_PRESETS[4]; // blue

interface AccountSectionProps {
  account: Account;
  sidebarCollapsed: boolean;
  unreadCounts: Record<string, number>;
  onFolderClick: (accountId: string, folder: string) => void;
}

export function AccountSection({
  account,
  sidebarCollapsed,
  unreadCounts,
  onFolderClick,
}: AccountSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const activeLabel = useActiveLabel();
  const color = account.color ?? DEFAULT_COLOR;

  if (sidebarCollapsed) {
    const inboxUnread = unreadCounts["INBOX"] ?? 0;
    return (
      <button
        onClick={() => onFolderClick(account.id, "inbox")}
        title={account.label ?? account.displayName ?? account.email}
        className="relative flex items-center justify-center w-full py-2"
      >
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
          style={{ backgroundColor: color }}
        >
          {(account.label ?? account.displayName ?? account.email)[0]?.toUpperCase()}
        </span>
        {inboxUnread > 0 && (
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
          <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
            {unreadCounts["INBOX"]}
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
            const isActive = activeLabel === id;
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
                  <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
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
