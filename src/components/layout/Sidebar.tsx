import { useEffect, useRef, useState, useCallback, useMemo, Fragment } from "react";
import { t } from "@/i18n";
import { useDroppable } from "@dnd-kit/core";
import { AccountSwitcher } from "../accounts/AccountSwitcher";
import { LabelForm } from "../labels/LabelForm";
import { InputDialog } from "../ui/InputDialog";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLabelStore, type Label } from "@/stores/labelStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { DEFAULT_SMART_FOLDER_I18N_KEYS } from "@/services/db/smartFolders";
import { useActiveLabel, useActiveCategory } from "@/hooks/useRouteNavigation";
import { navigateToLabel } from "@/router/navigate";
import { AccountSection } from "./AccountSection";
import {
  Inbox,
  Star,
  Clock,
  ClockArrowUp,
  Send,
  FileEdit,
  Trash2,
  Ban,
  Mail,
  CheckSquare,
  Calendar,
  CalendarDays,
  CalendarSearch,
  Settings,
  Plus,
  Tag,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Columns2,
  Bell,
  Users,
  Newspaper,
  Search,
  MailOpen,
  Paperclip,
  FolderSearch,
  Loader2,
  Rocket,
  type LucideIcon,
} from "lucide-react";

const isMac = navigator.userAgent.includes("Macintosh");

function smartFolderName(id: string, fallback: string): string {
  const key = DEFAULT_SMART_FOLDER_I18N_KEYS[id];
  return key ? t(key) : fallback;
}
import { useTaskStore } from "@/stores/taskStore";
import { useOutgoingStore } from "@/stores/outgoingStore";
import { getOutgoingDbCountByAccount } from "@/services/db/outgoing";

interface SidebarProps {
  collapsed: boolean;
  onAddAccount: () => void;
}

export const ALL_NAV_ITEMS: { id: string; label: string; icon: LucideIcon }[] =
  [
    { id: "inbox", label: t("sidebar.nav.inbox"), icon: Inbox },
    { id: "starred", label: t("sidebar.nav.starred"), icon: Star },
    { id: "snoozed", label: t("sidebar.nav.snoozed"), icon: Clock },
    { id: "sent", label: t("sidebar.nav.sent"), icon: Send },
    { id: "scheduled", label: t("sidebar.nav.scheduled"), icon: ClockArrowUp },
    { id: "drafts", label: t("sidebar.nav.drafts"), icon: FileEdit },
    { id: "trash", label: t("sidebar.nav.trash"), icon: Trash2 },
    { id: "spam", label: t("sidebar.nav.spam"), icon: Ban },
    { id: "all", label: t("sidebar.nav.allMail"), icon: Mail },
    { id: "tasks", label: t("sidebar.nav.tasks"), icon: CheckSquare },
    { id: "calendar", label: t("sidebar.nav.calendar"), icon: Calendar },
    { id: "attachments", label: t("sidebar.nav.attachments"), icon: Paperclip },
    { id: "smart-folders", label: t("sidebar.smartFolders"), icon: FolderSearch },
    { id: "labels", label: t("sidebar.labels"), icon: Tag },
  ];

const CATEGORY_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "Primary", label: t("sidebar.categories.primary"), icon: Inbox },
  { id: "Updates", label: t("sidebar.categories.updates"), icon: Bell },
  { id: "Promotions", label: t("sidebar.categories.promotions"), icon: Tag },
  { id: "Social", label: t("sidebar.categories.social"), icon: Users },
  { id: "Newsletters", label: t("sidebar.categories.newsletters"), icon: Newspaper },
];

function DroppableNavItem({
  id,
  isActive,
  collapsed,
  onClick,
  onContextMenu,
  title,
  children,
}: {
  id: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title?: string;
  children: (isOver: boolean) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className={`flex items-center w-full py-2 text-sm transition-colors press-scale ${collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
        } ${isOver
          ? "bg-accent/20 ring-1 ring-accent"
          : isActive
            ? "bg-accent/10 text-accent font-medium"
            : "hover:bg-sidebar-hover text-sidebar-text"
        }`}
    >
      {children(isOver)}
    </button>
  );
}

function ExpandableNavItem({
  id,
  label,
  isActive,
  collapsed,
  expanded,
  onNavigate,
  onToggleExpand,
  leftBorderColor,
  children,
}: {
  id: string;
  label?: string;
  isActive: boolean;
  collapsed: boolean;
  expanded: boolean;
  onNavigate: () => void;
  onToggleExpand: () => void;
  leftBorderColor?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        onClick={onNavigate}
        title={label}
        className={`flex items-center justify-center w-full py-2 text-sm transition-colors press-scale ${
          isOver
            ? "bg-accent/20 ring-1 ring-accent"
            : isActive
              ? "bg-accent/10 text-accent font-medium"
              : "hover:bg-sidebar-hover text-sidebar-text"
        }`}
      >
        {children}
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={leftBorderColor ? { borderLeft: `3px solid ${leftBorderColor}` } : undefined}
      className={`flex items-center w-full text-sm transition-colors ${
        isOver
          ? "bg-accent/20 ring-1 ring-accent"
          : isActive
            ? "bg-accent/10 text-accent font-medium"
            : "hover:bg-sidebar-hover text-sidebar-text"
      }`}
    >
      <button
        onClick={onNavigate}
        className="flex items-center gap-3 flex-1 py-2 pl-3 pr-1 text-left text-sm transition-colors press-scale min-w-0"
        style={leftBorderColor ? { paddingLeft: "0.625rem" } : undefined}
      >
        {children}
      </button>
      <button
        onClick={onToggleExpand}
        className="py-2 pr-3 pl-1 text-sidebar-text/40 hover:text-sidebar-text transition-colors shrink-0"
        title={expanded ? t("sidebar.collapseAccounts") : t("sidebar.expandAccounts")}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
    </div>
  );
}

function DroppableLabelItem({
  label,
  isActive,
  collapsed,
  onClick,
  onContextMenu,
  onEditClick,
  unreadCount,
}: {
  label: Label;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEditClick: () => void;
  unreadCount?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: label.id });
  const initial = (label.name[0] ?? "?").toUpperCase();

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={collapsed ? label.name : undefined}
      className={`group flex items-center w-full py-2 text-sm transition-colors ${collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
        } ${isOver
          ? "bg-accent/20 ring-1 ring-accent"
          : isActive
            ? "bg-accent/10 text-accent font-medium"
            : "hover:bg-sidebar-hover text-sidebar-text"
        }`}
    >
      {collapsed ? (
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
          style={
            label.colorBg
              ? {
                backgroundColor: label.colorBg,
                color: label.colorFg ?? "#ffffff",
              }
              : undefined
          }
        >
          {label.colorBg ? initial : <Tag size={14} />}
        </span>
      ) : (
        <>
          {label.colorBg ? (
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: label.colorBg }}
            />
          ) : (
            <Tag size={14} className="shrink-0" />
          )}
          <span className="flex-1 truncate">{label.name}</span>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
              {unreadCount}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onEditClick();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onEditClick();
              }
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-opacity shrink-0"
            title={t("sidebar.editLabel")}
          >
            <Pencil size={12} />
          </span>
        </>
      )}
    </button>
  );
}

const SMART_FOLDER_ICON_MAP: Record<string, LucideIcon> = {
  Search,
  MailOpen,
  Paperclip,
  Star,
  FolderSearch,
  Inbox,
  Clock,
  Tag,
  CalendarDays,
  CalendarSearch,
};

function kebabToPascal(s: string): string {
  return s.replace(/(^|-)([a-z])/g, (_, _sep, ch) => ch.toUpperCase());
}

function getSmartFolderIcon(iconName: string): LucideIcon {
  return SMART_FOLDER_ICON_MAP[iconName] ?? SMART_FOLDER_ICON_MAP[kebabToPascal(iconName)] ?? Search;
}

const LABELS_COLLAPSED_COUNT = 3;

const FOLDER_UNREAD_KEY: Record<string, string> = {
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
  spam: "SPAM",
};

const GLOBAL_FOLDER_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "starred",     label: t("sidebar.nav.starred"),     icon: Star },
  { id: "snoozed",     label: t("sidebar.nav.snoozed"),     icon: Clock },
  { id: "sent",        label: t("sidebar.nav.sent"),        icon: Send },
  { id: "scheduled",   label: t("sidebar.nav.scheduled"),   icon: ClockArrowUp },
  { id: "drafts",      label: t("sidebar.nav.drafts"),      icon: FileEdit },
  { id: "trash",       label: t("sidebar.nav.trash"),       icon: Trash2 },
  { id: "spam",        label: t("sidebar.nav.spam"),        icon: Ban },
  { id: "all",         label: t("sidebar.nav.allMail"),     icon: Mail },
  { id: "tasks",       label: t("sidebar.nav.tasks"),       icon: CheckSquare },
  { id: "calendar",    label: t("sidebar.nav.calendar"),    icon: Calendar },
  { id: "attachments", label: t("sidebar.nav.attachments"), icon: Paperclip },
];

export function Sidebar({ collapsed, onAddAccount }: SidebarProps) {
  const activeLabel = useActiveLabel();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarNavConfig = useUIStore((s) => s.sidebarNavConfig);
  const taskIncompleteCount = useTaskStore((s) => s.incompleteCount);
  const taskOverdueTotal = useTaskStore((s) => s.taskOverdueTotal);
  const taskBadgeByAccount = useTaskStore((s) => s.taskBadgeByAccount);
  const refreshTaskBadges = useTaskStore((s) => s.refreshTaskBadges);
  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const setInboxViewMode = useUIStore((s) => s.setInboxViewMode);
  const activeCategory = useActiveCategory();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const setActiveAccount = useAccountStore((s) => s.setActiveAccount);
  const accounts = useAccountStore((s) => s.accounts);
  // In unified view activeAccountId is null; viewingAccountId tracks the account
  // of the currently open thread for display purposes (set by EmailList on thread click).
  const viewingAccountId = useAccountStore((s) => s.viewingAccountId);
  const selectedThreadAccountId = activeAccountId ? null : viewingAccountId;
  const [isScrolling, setIsScrolling] = useState(false);
  const [expandedGlobalItems, setExpandedGlobalItems] = useState<Record<string, boolean>>({});
  const toggleGlobalItem = useCallback(
    (id: string) => setExpandedGlobalItems((prev) => ({ ...prev, [id]: !prev[id] })),
    [],
  );


  const outgoingEmails = useOutgoingStore((s) => s.emails);
  const [outgoingDbByAccount, setOutgoingDbByAccount] = useState<Record<string, number>>({});

  useEffect(() => {
    let scrollTimer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      setIsScrolling(true);
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => setIsScrolling(false), 1500);
    };
    const navElement = document.querySelector('.sidebar nav');
    if (navElement) {
      navElement.addEventListener('scroll', handleScroll, { passive: true });
    }
    return () => {
      clearTimeout(scrollTimer);
      if (navElement) {
        navElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const labels = useLabelStore((s) => s.labels);
  const allAccountLabels = useLabelStore((s) => s.allAccountLabels);
  const loadLabels = useLabelStore((s) => s.loadLabels);
  const loadAllAccountLabels = useLabelStore((s) => s.loadAllAccountLabels);
  const unreadCounts = useLabelStore((s) => s.unreadCounts);
  const categoryUnreadCounts = useLabelStore((s) => s.categoryUnreadCounts);
  const globalUnreadCounts = useLabelStore((s) => s.globalUnreadCounts);
  const scheduledCounts = useLabelStore((s) => s.scheduledCounts);
  const draftCounts = useLabelStore((s) => s.draftCounts);
  const refreshLabelUnreadCounts = useLabelStore((s) => s.refreshUnreadCounts);
  const refreshGlobalUnreadCounts = useLabelStore((s) => s.refreshGlobalUnreadCounts);
  const refreshScheduledCounts = useLabelStore((s) => s.refreshScheduledCounts);
  const refreshDraftCounts = useLabelStore((s) => s.refreshDraftCounts);
  const deleteLabel = useLabelStore((s) => s.deleteLabel);
  const smartFolders = useSmartFolderStore((s) => s.folders);
  const smartFolderCounts = useSmartFolderStore((s) => s.unreadCounts);
  const smartFolderPerAccountCounts = useSmartFolderStore((s) => s.perAccountCounts);
  const loadSmartFolders = useSmartFolderStore((s) => s.loadFolders);
  const refreshSmartFolderCounts = useSmartFolderStore(
    (s) => s.refreshUnreadCounts,
  );
  const refreshSmartFolderGlobalCounts = useSmartFolderStore(
    (s) => s.refreshGlobalUnreadCounts,
  );
  const createSmartFolder = useSmartFolderStore((s) => s.createFolder);
  const SECTION_IDS = new Set(["smart-folders", "labels"]);

  const { visibleNavItems, showSmartFolders, showLabels } = useMemo(() => {
    if (!sidebarNavConfig) {
      const navOnly = ALL_NAV_ITEMS.filter((i) => !SECTION_IDS.has(i.id));
      return {
        visibleNavItems: navOnly,
        showSmartFolders: true,
        showLabels: true,
      };
    }
    const itemMap = new Map(ALL_NAV_ITEMS.map((item) => [item.id, item]));
    const result: typeof ALL_NAV_ITEMS = [];
    const seen = new Set<string>();
    let smartFoldersVisible = true;
    let labelsVisible = true;
    for (const entry of sidebarNavConfig) {
      seen.add(entry.id);
      if (entry.id === "smart-folders") {
        smartFoldersVisible = entry.visible;
        continue;
      }
      if (entry.id === "labels") {
        labelsVisible = entry.visible;
        continue;
      }
      if (entry.visible && itemMap.has(entry.id)) {
        result.push(itemMap.get(entry.id)!);
      }
    }
    // Append any new items not present in the saved config
    for (const item of ALL_NAV_ITEMS) {
      if (!seen.has(item.id) && !SECTION_IDS.has(item.id)) result.push(item);
    }
    return {
      visibleNavItems: result,
      showSmartFolders: smartFoldersVisible,
      showLabels: labelsVisible,
    };
  }, [sidebarNavConfig]);

  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [collapsedLabelGroups, setCollapsedLabelGroups] = useState<Set<string>>(new Set());
  const labelGroupsInitialized = useRef(false);

  const toggleLabelGroup = useCallback((accountId: string) => {
    setCollapsedLabelGroups((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  const handleAccountLabelClick = useCallback(
    (accountId: string, labelId: string) => {
      setActiveAccount(accountId);
      navigateToLabel(labelId);
    },
    [setActiveAccount],
  );

  // Inline label editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);

  const openMenu = useContextMenuStore((s) => s.openMenu);
  const isSyncingFolder = useUIStore((s) => s.isSyncingFolder);

  const handleNavContextMenu = useCallback(
    (e: React.MouseEvent, navId: string) => {
      e.preventDefault();
      openMenu("sidebarNav", { x: e.clientX, y: e.clientY }, { navId });
    },
    [openMenu],
  );

  // Load initial task badge counts
  useEffect(() => {
    refreshTaskBadges().catch(() => {});
  }, [refreshTaskBadges]);

  // Load labels when active account changes
  useEffect(() => {
    if (activeAccountId) {
      loadLabels(activeAccountId);
      refreshLabelUnreadCounts(activeAccountId);
    }
  }, [activeAccountId, loadLabels, refreshLabelUnreadCounts]);

  // Load labels for all accounts (for the per-account labels section)
  useEffect(() => {
    const allIds = accounts.map((a) => a.id);
    if (allIds.length > 0) loadAllAccountLabels(allIds);
  }, [accounts, loadAllAccountLabels]);

  // Collapse all account label groups on first load
  useEffect(() => {
    if (!labelGroupsInitialized.current && accounts.length > 0) {
      setCollapsedLabelGroups(new Set(accounts.map((a) => a.id)));
      labelGroupsInitialized.current = true;
    }
  }, [accounts]);

  // Load global unread counts for all accounts (for per-account sidebar sections)
  useEffect(() => {
    const allIds = accounts.map((a) => a.id);
    if (allIds.length > 0) {
      refreshGlobalUnreadCounts(allIds);
      refreshScheduledCounts(allIds);
      refreshDraftCounts(allIds);
    }
  }, [accounts, refreshGlobalUnreadCounts, refreshScheduledCounts, refreshDraftCounts]);

  // Load global smart folder counts when accounts or folders change
  useEffect(() => {
    const allIds = accounts.map((a) => a.id);
    if (allIds.length > 0 && smartFolders.length > 0) {
      refreshSmartFolderGlobalCounts(allIds);
    }
  }, [accounts, smartFolders, refreshSmartFolderGlobalCounts]);

  // Load smart folders when active account changes
  useEffect(() => {
    loadSmartFolders(activeAccountId ?? undefined);
  }, [activeAccountId, loadSmartFolders]);

  // Refresh smart folder counts when active account or folders change
  useEffect(() => {
    if (activeAccountId && smartFolders.length > 0) {
      refreshSmartFolderCounts(activeAccountId);
    }
  }, [activeAccountId, smartFolders, refreshSmartFolderCounts]);

  // Reload labels, smart folder counts, and global counts on sync completion
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (activeAccountId) {
          loadLabels(activeAccountId);
          refreshLabelUnreadCounts(activeAccountId);
          refreshSmartFolderCounts(activeAccountId);
        }
        const allIds = useAccountStore.getState().accounts.map((a) => a.id);
        if (allIds.length > 0) {
          refreshGlobalUnreadCounts(allIds);
          refreshScheduledCounts(allIds);
          refreshDraftCounts(allIds);
          loadAllAccountLabels(allIds);
          refreshSmartFolderGlobalCounts(allIds);
        }
        refreshTaskBadges().catch(() => {});
        useUIStore.getState().setSyncingFolder(null);
      }, 500);
    };
    window.addEventListener("velo-sync-done", handler);
    return () => {
      window.removeEventListener("velo-sync-done", handler);
      if (timer) clearTimeout(timer);
    };
  }, [activeAccountId, loadLabels, loadAllAccountLabels, refreshSmartFolderCounts, refreshSmartFolderGlobalCounts, refreshGlobalUnreadCounts, refreshScheduledCounts, refreshDraftCounts, refreshTaskBadges]);

  // Immediate badge refresh after user actions (trash, archive, markRead, spam).
  // No debounce — the DB is already updated by the time this event fires.
  useEffect(() => {
    const handler = () => {
      if (activeAccountId) {
        refreshLabelUnreadCounts(activeAccountId);
        refreshSmartFolderCounts(activeAccountId);
      }
      const allIds = useAccountStore.getState().accounts.map((a) => a.id);
      if (allIds.length > 0) {
        refreshGlobalUnreadCounts(allIds);
        refreshDraftCounts(allIds);
        refreshSmartFolderGlobalCounts(allIds);
      }
    };
    window.addEventListener("velo-badges-refresh", handler);
    return () => window.removeEventListener("velo-badges-refresh", handler);
  }, [activeAccountId, refreshLabelUnreadCounts, refreshSmartFolderCounts, refreshGlobalUnreadCounts, refreshDraftCounts, refreshSmartFolderGlobalCounts]);

  // Refresh scheduled badge immediately when a scheduled email is cancelled/edited,
  // and periodically (every 60s) to catch emails sent automatically by scheduledSendManager.
  useEffect(() => {
    const allIds = useAccountStore.getState().accounts.map((a) => a.id);
    const refresh = () => {
      const ids = useAccountStore.getState().accounts.map((a) => a.id);
      if (ids.length > 0) refreshScheduledCounts(ids).catch(() => {});
    };
    window.addEventListener("velo-scheduled-removed", refresh);
    const interval = setInterval(refresh, 60_000);
    // Immediate sync on mount to fix any stale count from previous sessions
    if (allIds.length > 0) refreshScheduledCounts(allIds).catch(() => {});
    return () => {
      window.removeEventListener("velo-scheduled-removed", refresh);
      clearInterval(interval);
    };
  }, [refreshScheduledCounts]);

  const handleDeleteLabel = useCallback(
    async (labelId: string) => {
      if (!activeAccountId) return;
      try {
        await deleteLabel(activeAccountId, labelId);
        if (editingLabelId === labelId) setEditingLabelId(null);
      } catch {
        // Silently fail in sidebar — user can use Settings for detailed errors
      }
    },
    [activeAccountId, deleteLabel, editingLabelId],
  );

  const handleFormDone = useCallback(() => {
    setEditingLabelId(null);
    setShowNewLabelForm(false);
  }, []);

  const handleAccountFolderClick = useCallback(
    (accountId: string, folder: string) => {
      setActiveAccount(accountId);
      navigateToLabel(folder);
    },
    [setActiveAccount],
  );

  const globalAccounts = useMemo(
    () => accounts.filter((a) => a.includeInGlobal),
    [accounts],
  );
  const hasGlobal = globalAccounts.length >= 2;

  const outgoingMemByAccount = useMemo(() => {
    const result: Record<string, number> = {};
    for (const e of outgoingEmails) result[e.accountId] = (result[e.accountId] ?? 0) + 1;
    return result;
  }, [outgoingEmails]);

  const outgoingByAccount = useMemo(() => {
    const result: Record<string, number> = {};
    for (const a of globalAccounts) {
      const total = (outgoingMemByAccount[a.id] ?? 0) + (outgoingDbByAccount[a.id] ?? 0);
      if (total > 0) result[a.id] = total;
    }
    return result;
  }, [globalAccounts, outgoingMemByAccount, outgoingDbByAccount]);

  const outgoingTotal = useMemo(
    () => Object.values(outgoingByAccount).reduce((s, n) => s + n, 0),
    [outgoingByAccount],
  );

  useEffect(() => {
    if (globalAccounts.length === 0) return;
    const ids = globalAccounts.map((a) => a.id);
    getOutgoingDbCountByAccount(ids).then(setOutgoingDbByAccount).catch(() => {});
    const handler = () =>
      getOutgoingDbCountByAccount(ids).then(setOutgoingDbByAccount).catch(() => {});
    window.addEventListener("velo-sync-done", handler);
    return () => window.removeEventListener("velo-sync-done", handler);
  }, [globalAccounts, outgoingEmails]);

  const handleEditLabel = useCallback((labelId: string) => {
    setShowNewLabelForm(false);
    setEditingLabelId(labelId);
  }, []);

  const handleLabelContextMenu = useCallback(
    (e: React.MouseEvent, labelId: string) => {
      e.preventDefault();
      openMenu(
        "sidebarLabel",
        { x: e.clientX, y: e.clientY },
        {
          labelId,
          onEdit: () => handleEditLabel(labelId),
          onDelete: () => handleDeleteLabel(labelId),
        },
      );
    },
    [openMenu, handleEditLabel, handleDeleteLabel],
  );

  const handleAddLabel = useCallback(() => {
    setEditingLabelId(null);
    setShowNewLabelForm(true);
  }, []);

  const [showSmartFolderModal, setShowSmartFolderModal] = useState(false);

  const handleAddSmartFolder = useCallback(() => {
    setShowSmartFolderModal(true);
  }, []);

  const editingLabel = editingLabelId
    ? (labels.find((l: Label) => l.id === editingLabelId) ?? null)
    : null;

  return (
    <aside
      data-tauri-drag-region
      className={`sidebar no-select flex flex-col bg-sidebar-bg text-sidebar-text border-r border-border-primary transition-all duration-200 glass-panel ${collapsed ? "w-20" : "w-90"
        }`}
    >
      {isMac && <div className="h-7 shrink-0" data-tauri-drag-region />}
      <AccountSwitcher collapsed={collapsed} onAddAccount={onAddAccount} />

      <nav className={`flex-1 overflow-y-auto py-2 ${isScrolling ? 'scrollbar-visible' : 'scrollbar-hidden'}`}>

        {/* ─── Global / Unified Inbox ─── */}
        {hasGlobal && (
          <>
            {!collapsed && (
              <div className="px-3 pt-2 pb-1">
                <span className="text-xs font-medium text-sidebar-text/50 uppercase tracking-wider">
                  {t("sidebar.global")}
                </span>
              </div>
            )}
            <ExpandableNavItem
              id="unified-inbox"
              label="Inbox"
              isActive={activeLabel === "unified-inbox"}
              collapsed={collapsed}
              expanded={!!expandedGlobalItems["unified-inbox"]}
              onNavigate={() => {
                setActiveAccount(null);
                navigateToLabel("unified-inbox");
              }}
              onToggleExpand={() => toggleGlobalItem("unified-inbox")}
            >
              <Inbox size={18} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{t("sidebar.nav.inbox")}</span>
                  {(() => {
                    const total = globalAccounts.reduce(
                      (sum, a) => sum + (globalUnreadCounts[a.id]?.["INBOX"] ?? 0),
                      0,
                    );
                    return total > 0 ? (
                      <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                        {total}
                      </span>
                    ) : null;
                  })()}
                </>
              )}
            </ExpandableNavItem>
            {!collapsed && (
              <div
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedGlobalItems["unified-inbox"] ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  {globalAccounts.map((account) => {
                    const color = account.color ?? "#3182CE";
                    const displayName = account.label ?? account.displayName ?? account.email;
                    const unread = globalUnreadCounts[account.id]?.["INBOX"] ?? 0;
                    const isAccountActive =
                      activeLabel === "inbox" &&
                      activeAccountId === account.id;
                    const isThreadAccount =
                      !isAccountActive &&
                      selectedThreadAccountId === account.id &&
                      activeLabel === "unified-inbox";
                    return (
                      <button
                        key={account.id}
                        onClick={() => {
                          setActiveAccount(account.id);
                          navigateToLabel("inbox");
                        }}
                        className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-8 text-left text-[0.8125rem] transition-colors ${
                          isAccountActive
                            ? "text-accent font-medium bg-accent/10"
                            : isThreadAccount
                              ? "text-sidebar-text font-medium bg-sidebar-hover"
                              : "text-sidebar-text/80 hover:text-sidebar-text hover:bg-sidebar-hover"
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="flex-1 truncate">{displayName}</span>
                        {unread > 0 && (
                          <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                            {unread}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* ─── Other global folder items ─── */}
            {GLOBAL_FOLDER_ITEMS.filter((gi) =>
              visibleNavItems.some((vi) => vi.id === gi.id)
            ).map((gi) => {
              const GIcon = gi.icon;
              const unreadKey = FOLDER_UNREAD_KEY[gi.id];
              const nullBadge = taskBadgeByAccount["__null__"] ?? { active: 0, overdue: 0 };
              const globalTotal = gi.id === "tasks"
                ? taskIncompleteCount
                : gi.id === "scheduled"
                  ? globalAccounts.reduce((sum, a) => sum + (scheduledCounts[a.id] ?? 0), 0)
                  : gi.id === "drafts"
                    ? globalAccounts.reduce((sum, a) => sum + (draftCounts[a.id] ?? 0), 0)
                    : unreadKey
                      ? globalAccounts.reduce(
                          (sum, a) => sum + (globalUnreadCounts[a.id]?.[unreadKey] ?? 0),
                          0,
                        )
                      : 0;
              const globalTaskOverdue = gi.id === "tasks" ? taskOverdueTotal : 0;
              return (
                <Fragment key={`global-${gi.id}`}>
                  <div>
                    <ExpandableNavItem
                      id={`global-${gi.id}`}
                      label={gi.label}
                      isActive={activeLabel === gi.id && activeAccountId === null}
                      collapsed={collapsed}
                      expanded={!!expandedGlobalItems[`global-${gi.id}`]}
                      onNavigate={() => {
                        setActiveAccount(null);
                        navigateToLabel(gi.id);
                      }}
                      onToggleExpand={() => toggleGlobalItem(`global-${gi.id}`)}
                    >
                      <GIcon size={18} className="shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{gi.label}</span>
                          {globalTaskOverdue > 0 ? (
                            <span className="text-[0.625rem] bg-amber-500/15 text-amber-500 px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                              {globalTaskOverdue}
                            </span>
                          ) : globalTotal > 0 ? (
                            <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                              {globalTotal}
                            </span>
                          ) : null}
                        </>
                      )}
                    </ExpandableNavItem>
                    {!collapsed && (
                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedGlobalItems[`global-${gi.id}`] ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                      >
                        <div className="overflow-hidden">
                          {globalAccounts.map((account) => {
                            const color = account.color ?? "#3182CE";
                            const displayName = account.label ?? account.displayName ?? account.email;
                            let unread: number;
                            let unreadOverdue = 0;
                            if (gi.id === "tasks") {
                              const accBadge = taskBadgeByAccount[account.id] ?? { active: 0, overdue: 0 };
                              unread = accBadge.active + nullBadge.active;
                              unreadOverdue = accBadge.overdue + nullBadge.overdue;
                            } else {
                              unread = gi.id === "scheduled"
                                ? (scheduledCounts[account.id] ?? 0)
                                : gi.id === "drafts"
                                  ? (draftCounts[account.id] ?? 0)
                                  : unreadKey ? (globalUnreadCounts[account.id]?.[unreadKey] ?? 0) : 0;
                            }
                            const isAccountActive =
                              activeLabel === gi.id && activeAccountId === account.id;
                            const isThreadAccount =
                              !isAccountActive &&
                              selectedThreadAccountId === account.id &&
                              activeLabel === gi.id;
                            return (
                              <button
                                key={account.id}
                                onClick={() => {
                                  setActiveAccount(account.id);
                                  navigateToLabel(gi.id);
                                }}
                                className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-8 text-left text-[0.8125rem] transition-colors ${
                                  isAccountActive
                                    ? "text-accent font-medium bg-accent/10"
                                    : isThreadAccount
                                      ? "text-sidebar-text font-medium bg-sidebar-hover"
                                      : "text-sidebar-text/80 hover:text-sidebar-text hover:bg-sidebar-hover"
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="flex-1 truncate">{displayName}</span>
                                {unreadOverdue > 0 ? (
                                  <span className="text-[0.625rem] bg-amber-500/15 text-amber-500 px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                                    {unreadOverdue}
                                  </span>
                                ) : unread > 0 ? (
                                  <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                                    {unread}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ─── Outgoing (shown only when there are pending sends, positioned below Scheduled) ─── */}
                  {gi.id === "scheduled" && outgoingTotal > 0 && (
                    <div>
                      <ExpandableNavItem
                        id="global-outgoing"
                        label={t("sidebar.nav.outgoing")}
                        isActive={activeLabel === "outgoing" && activeAccountId === null}
                        collapsed={collapsed}
                        expanded={!!expandedGlobalItems["global-outgoing"]}
                        onNavigate={() => { setActiveAccount(null); navigateToLabel("outgoing"); }}
                        onToggleExpand={() => toggleGlobalItem("global-outgoing")}
                      >
                        <Rocket size={18} className="shrink-0 text-amber-500" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{t("sidebar.nav.outgoing")}</span>
                            <span className="text-[0.625rem] bg-amber-500/15 text-amber-500 px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                              {outgoingTotal}
                            </span>
                          </>
                        )}
                      </ExpandableNavItem>
                      {!collapsed && (
                        <div
                          className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedGlobalItems["global-outgoing"] ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                        >
                          <div className="overflow-hidden">
                            {globalAccounts.map((account) => {
                              const count = outgoingByAccount[account.id] ?? 0;
                              if (count === 0) return null;
                              const color = account.color ?? "#3182CE";
                              const displayName = account.label ?? account.displayName ?? account.email;
                              const isAccountActive = activeLabel === "outgoing" && activeAccountId === account.id;
                              return (
                                <button
                                  key={account.id}
                                  onClick={() => { setActiveAccount(account.id); navigateToLabel("outgoing"); }}
                                  className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-8 text-left text-[0.8125rem] transition-colors ${
                                    isAccountActive
                                      ? "text-accent font-medium bg-accent/10"
                                      : "text-sidebar-text/80 hover:text-sidebar-text hover:bg-sidebar-hover"
                                  }`}
                                >
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                  <span className="flex-1 truncate">{displayName}</span>
                                  <span className="text-[0.625rem] bg-amber-500/15 text-amber-500 px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
            {/* ─── Smart folders in Global section ─── */}
            {showSmartFolders && smartFolders.length > 0 && !collapsed && (
              <div className="mx-3 mt-2 mb-1 flex items-center gap-2">
                <div className="flex-1 border-t border-border-primary/50" />
                <span className="text-[0.65rem] font-medium text-sidebar-text/40 uppercase tracking-wider">{t("sidebar.smartFolders")}</span>
                <div className="flex-1 border-t border-border-primary/50" />
              </div>
            )}
            {showSmartFolders && smartFolders.map((folder) => {
              const GIcon = getSmartFolderIcon(folder.icon);
              const count = globalAccounts.reduce(
                (sum, a) => sum + (smartFolderPerAccountCounts[`${folder.id}:${a.id}`] ?? 0),
                0,
              );
              return (
                <div key={`global-smart-${folder.id}`}>
                  <ExpandableNavItem
                    id={`global-smart-${folder.id}`}
                    label={smartFolderName(folder.id, folder.name)}
                    isActive={activeLabel === `smart-folder:${folder.id}` && activeAccountId === null}
                    collapsed={collapsed}
                    expanded={!!expandedGlobalItems[`global-smart-${folder.id}`]}
                    onNavigate={() => {
                      setActiveAccount(null);
                      navigateToLabel(`smart-folder:${folder.id}`);
                    }}
                    onToggleExpand={() => toggleGlobalItem(`global-smart-${folder.id}`)}
                    leftBorderColor={folder.color ?? undefined}
                  >
                    <GIcon size={18} className="shrink-0" style={folder.color ? { color: folder.color } : undefined} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{smartFolderName(folder.id, folder.name)}</span>
                        {count > 0 && (
                          <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </ExpandableNavItem>
                  {!collapsed && (
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${expandedGlobalItems[`global-smart-${folder.id}`] ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    >
                      <div className="overflow-hidden">
                        {globalAccounts.map((account) => {
                          const color = account.color ?? "#3182CE";
                          const displayName = account.label ?? account.displayName ?? account.email;
                          const isAccountActive =
                            activeLabel === `smart-folder:${folder.id}` && activeAccountId === account.id;
                          const isThreadAccount =
                            !isAccountActive &&
                            selectedThreadAccountId === account.id &&
                            activeLabel === `smart-folder:${folder.id}`;
                          const perAccountCount = smartFolderPerAccountCounts[`${folder.id}:${account.id}`] ?? 0;
                          return (
                            <button
                              key={account.id}
                              onClick={() => {
                                setActiveAccount(account.id);
                                navigateToLabel(`smart-folder:${folder.id}`);
                              }}
                              className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-8 text-left text-[0.8125rem] transition-colors ${
                                isAccountActive
                                  ? "text-accent font-medium bg-accent/10"
                                  : isThreadAccount
                                    ? "text-sidebar-text font-medium bg-sidebar-hover"
                                    : "text-sidebar-text/80 hover:text-sidebar-text hover:bg-sidebar-hover"
                              }`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className="flex-1 truncate">{displayName}</span>
                              {perAccountCount > 0 && (
                                <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                                  {perAccountCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!collapsed && <div className="mx-3 my-2 border-t border-border-primary/50" />}
          </>
        )}

        {/* ─── Per-account sections ─── */}
        {accounts.length > 1 && (
          <>
            {!collapsed && (
              <div className="px-3 pt-1 pb-1">
                <span className="text-xs font-medium text-sidebar-text/50 uppercase tracking-wider">
                  {t("sidebar.accounts")}
                </span>
              </div>
            )}
            {accounts.map((account) => (
              <AccountSection
                key={account.id}
                account={account}
                sidebarCollapsed={collapsed}
                unreadCounts={globalUnreadCounts[account.id] ?? {}}
                onFolderClick={handleAccountFolderClick}
                activeAccountId={activeAccountId}
              />
            ))}
            {!collapsed && <div className="mx-3 my-2 border-t border-border-primary/50" />}
          </>
        )}

        {!hasGlobal && visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isInbox = item.id === "inbox";

          // Show unread badge on Inbox; scheduled count badge on Scheduled;
          // total draft count (read or not) on Drafts.
          const unreadCount =
            item.id === "inbox"
              ? (unreadCounts["INBOX"] ?? 0)
              : item.id === "scheduled" && activeAccountId
                ? (scheduledCounts[activeAccountId] ?? 0)
                : item.id === "drafts" && activeAccountId
                  ? (draftCounts[activeAccountId] ?? 0)
                  : 0;

          return (
            <div key={item.id}>
              <DroppableNavItem
                id={item.id}
                isActive={
                  isInbox
                    ? activeLabel === "inbox" &&
                    (inboxViewMode === "unified" ||
                      activeCategory === "Primary")
                    : activeLabel === item.id
                }
                collapsed={collapsed}
                onClick={() => {
                  if (isInbox && inboxViewMode === "split") {
                    navigateToLabel(item.id, { category: "Primary" });
                  } else {
                    navigateToLabel(item.id);
                  }
                }}
                onContextMenu={(e) => handleNavContextMenu(e, item.id)}
                title={collapsed ? item.label : undefined}
              >
                {() => (
                  <>
                    {isSyncingFolder === item.id ? (
                      <Loader2
                        size={18}
                        className="shrink-0 animate-spin text-accent"
                      />
                    ) : (
                      <Icon size={18} className="shrink-0" />
                    )}
                    {!collapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}
                    {item.id === "tasks" && !collapsed && (
                      taskOverdueTotal > 0 ? (
                        <span className="text-[0.625rem] bg-amber-500/15 text-amber-500 px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                          {taskOverdueTotal}
                        </span>
                      ) : taskIncompleteCount > 0 ? (
                        <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                          {taskIncompleteCount}
                        </span>
                      ) : null
                    )}
                    {unreadCount > 0 && !collapsed && item.id !== "tasks" && (
                      <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                        {unreadCount}
                      </span>
                    )}
                    {isInbox && !collapsed && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInboxViewMode(
                            inboxViewMode === "split" ? "unified" : "split",
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setInboxViewMode(
                              inboxViewMode === "split" ? "unified" : "split",
                            );
                          }
                        }}
                        title={
                          inboxViewMode === "split"
                            ? t("sidebar.switchToUnifiedInbox")
                            : t("sidebar.switchToSplitInbox")
                        }
                        className={`p-1 rounded transition-colors ${inboxViewMode === "split"
                          ? "text-accent hover:bg-accent/10"
                          : "text-sidebar-text/40 hover:text-sidebar-text hover:bg-sidebar-hover"
                          }`}
                      >
                        <Columns2 size={14} />
                      </span>
                    )}
                  </>
                )}
              </DroppableNavItem>
              {/* Category sub-items when split mode is active */}
              {isInbox && inboxViewMode === "split" && !collapsed && (
                <div>
                  {CATEGORY_ITEMS.map((cat) => {
                    const CatIcon = cat.icon;
                    const isCatActive =
                      activeLabel === "inbox" && activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          navigateToLabel("inbox", { category: cat.id });
                        }}
                        className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-3 text-left text-[0.8125rem] transition-colors ${isCatActive
                          ? "text-accent font-medium"
                          : "text-sidebar-text/70 hover:text-sidebar-text hover:bg-sidebar-hover"
                          }`}
                      >
                        <CatIcon size={14} className="shrink-0" />
                        <span className="flex-1 truncate">{cat.label}</span>
                        {(categoryUnreadCounts[cat.id] ?? 0) > 0 && (
                          <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                            {categoryUnreadCounts[cat.id]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Smart Folders — only when not already shown in Global section */}
        {showSmartFolders && !hasGlobal && (smartFolders.length > 0 || !collapsed) && (
          <>
            {!collapsed && (
              <div className="flex items-center justify-between px-3 pt-4 pb-1">
                <span className="text-xs font-medium text-sidebar-text/60 uppercase tracking-wider">
                  {t("sidebar.smartFolders")}
                </span>
                <button
                  onClick={handleAddSmartFolder}
                  className="p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-colors"
                  title={t("sidebar.addSmartFolder")}
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {smartFolders.map((folder) => {
              const Icon = getSmartFolderIcon(folder.icon);
              const isActive = activeLabel === `smart-folder:${folder.id}`;
              const count = smartFolderCounts[folder.id] ?? 0;
              return (
                <button
                  key={folder.id}
                  onClick={() => navigateToLabel(`smart-folder:${folder.id}`)}
                  title={collapsed ? folder.name : undefined}
                  className={`flex items-center w-full py-2 text-sm transition-colors press-scale ${collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
                    } ${isActive
                      ? "bg-accent/10 text-accent font-medium"
                      : "hover:bg-sidebar-hover text-sidebar-text"
                    }`}
                >
                  <Icon
                    size={18}
                    className="shrink-0"
                    style={folder.color ? { color: folder.color } : undefined}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{folder.name}</span>
                      {count > 0 && (
                        <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 min-w-[1.25rem] h-[1.125rem] rounded-full inline-flex items-center justify-center tabular-nums">
                          {count}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </>
        )}

        {/* User labels — hidden when collapsed */}
        {showLabels && !collapsed && (
          <>
            <div className="flex items-center justify-between px-3 pt-4 pb-1">
              <span className="text-xs font-medium text-sidebar-text/60 uppercase tracking-wider">
                {t("sidebar.labels")}
              </span>
              {activeAccountId && (
                <button
                  onClick={handleAddLabel}
                  className="p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-colors"
                  title={t("sidebar.addLabel")}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {accounts.length > 1 ? (
              /* ── Multi-account: grouped by account ── */
              <>
                {accounts.map((account) => {
                  const accountLabels = allAccountLabels[account.id] ?? [];
                  if (accountLabels.length === 0) return null;
                  const isGroupCollapsed = collapsedLabelGroups.has(account.id);
                  const accountColor = account.color ?? undefined;
                  return (
                    <div key={account.id}>
                      {/* Account group header */}
                      <button
                        onClick={() => toggleLabelGroup(account.id)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-[0.75rem] text-sidebar-text/60 hover:text-sidebar-text transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={accountColor ? { backgroundColor: accountColor } : undefined}
                        />
                        <span className="flex-1 truncate text-left">
                          {account.label ?? account.displayName ?? account.email}
                        </span>
                        {isGroupCollapsed ? (
                          <ChevronRight size={11} className="shrink-0" />
                        ) : (
                          <ChevronDown size={11} className="shrink-0" />
                        )}
                      </button>
                      <div
                        className={`grid transition-[grid-template-rows] duration-200 ease-out ${isGroupCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
                      >
                        <div className="overflow-hidden">
                          {accountLabels.map((label: Label) => {
                            const labelUnread =
                              account.id === activeAccountId
                                ? (unreadCounts[label.id] ?? 0)
                                : (globalUnreadCounts[account.id]?.[label.id] ?? 0);
                            return (
                              <div key={label.id}>
                                <DroppableLabelItem
                                  label={label}
                                  isActive={activeLabel === label.id && activeAccountId === account.id}
                                  collapsed={false}
                                  onClick={() => handleAccountLabelClick(account.id, label.id)}
                                  onContextMenu={(e) => handleLabelContextMenu(e, label.id)}
                                  onEditClick={() => handleEditLabel(label.id)}
                                  unreadCount={labelUnread}
                                />
                                {editingLabelId === label.id && !collapsed && (
                                  <LabelForm
                                    accountId={account.id}
                                    label={editingLabel}
                                    onDone={handleFormDone}
                                    variant="sidebar"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              /* ── Single account: flat list ── */
              <>
                {labels.slice(0, LABELS_COLLAPSED_COUNT).map((label: Label) => (
                  <div key={label.id}>
                    <DroppableLabelItem
                      label={label}
                      isActive={activeLabel === label.id}
                      collapsed={collapsed}
                      onClick={() => navigateToLabel(label.id)}
                      onContextMenu={(e) => handleLabelContextMenu(e, label.id)}
                      onEditClick={() => handleEditLabel(label.id)}
                      unreadCount={unreadCounts[label.id]}
                    />
                    {editingLabelId === label.id && activeAccountId && !collapsed && (
                      <LabelForm
                        accountId={activeAccountId}
                        label={editingLabel}
                        onDone={handleFormDone}
                        variant="sidebar"
                      />
                    )}
                  </div>
                ))}
                {labels.length > LABELS_COLLAPSED_COUNT && (
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${labelsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  >
                    <div className="overflow-hidden">
                      {labels.slice(LABELS_COLLAPSED_COUNT).map((label: Label) => (
                        <div key={label.id}>
                          <DroppableLabelItem
                            label={label}
                            isActive={activeLabel === label.id}
                            collapsed={collapsed}
                            onClick={() => navigateToLabel(label.id)}
                            onContextMenu={(e) => handleLabelContextMenu(e, label.id)}
                            onEditClick={() => handleEditLabel(label.id)}
                            unreadCount={unreadCounts[label.id]}
                          />
                          {editingLabelId === label.id && activeAccountId && !collapsed && (
                            <LabelForm
                              accountId={activeAccountId}
                              label={editingLabel}
                              onDone={handleFormDone}
                              variant="sidebar"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {labels.length > LABELS_COLLAPSED_COUNT && (
                  <button
                    onClick={() => setLabelsExpanded((v) => !v)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-sidebar-text/60 hover:text-sidebar-text transition-colors"
                  >
                    {labelsExpanded ? (
                      <>
                        <ChevronUp size={12} />
                        <span>{t("sidebar.showLess")}</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown size={12} />
                        <span>{t("sidebar.moreLabels", { count: labels.length - LABELS_COLLAPSED_COUNT })}</span>
                      </>
                    )}
                  </button>
                )}
              </>
            )}

            {/* New label form at bottom */}
            {showNewLabelForm && activeAccountId && !collapsed && (
              <LabelForm
                accountId={activeAccountId}
                onDone={handleFormDone}
                variant="sidebar"
              />
            )}
          </>
        )}
      </nav>

      {/* Bottom bar: Settings + collapse toggle */}
      <div
        className={`py-2 border-t border-border-primary flex ${collapsed ? "flex-col items-center gap-1 px-2" : "items-center gap-1 px-3"}`}
      >
        <button
          onClick={() => navigateToLabel("settings")}
          className={`flex items-center text-sm rounded-md transition-colors ${collapsed
            ? "p-2 justify-center"
            : "gap-3 flex-1 px-3 py-2 text-left"
            } ${activeLabel === "settings"
              ? "bg-accent/10 text-accent font-medium"
              : "text-sidebar-text hover:bg-sidebar-hover"
            }`}
          title={t("sidebar.settings")}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>{t("sidebar.settings")}</span>}
        </button>
        <button
          onClick={() => navigateToLabel("help")}
          className={`flex items-center text-sm rounded-md transition-colors ${collapsed ? "p-2 justify-center" : "p-2"
            } ${activeLabel === "help"
              ? "bg-accent/10 text-accent font-medium"
              : "text-sidebar-text hover:bg-sidebar-hover"
            }`}
          title={t("sidebar.help")}
        >
          <HelpCircle size={18} className="shrink-0" />
        </button>
        <button
          onClick={toggleSidebar}
          className="p-2 text-sidebar-text/60 hover:text-sidebar-text hover:bg-sidebar-hover rounded-md transition-colors"
          title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
      </div>

      <InputDialog
        isOpen={showSmartFolderModal}
        onClose={() => setShowSmartFolderModal(false)}
        onSubmit={(values) => {
          createSmartFolder(
            values.name!.trim(),
            values.query!.trim(),
            activeAccountId ?? undefined,
          );
        }}
        title="New Smart Folder"
        fields={[
          { key: "name", label: "Name", placeholder: "e.g. Unread from boss" },
          {
            key: "query",
            label: "Search query",
            placeholder: "e.g. is:unread from:boss",
          },
        ]}
      />

      {/* Pending operations indicator */}
      <PendingOpsIndicator collapsed={collapsed} />
    </aside>
  );
}

function PendingOpsIndicator({ collapsed }: { collapsed: boolean }) {
  const pendingOpsCount = useUIStore((s) => s.pendingOpsCount);
  if (pendingOpsCount <= 0) return null;

  return (
    <div className="px-3 py-2 border-t border-border-primary">
      {collapsed ? (
        <div className="flex justify-center">
          <span className="bg-accent/20 text-accent text-xs font-medium px-1.5 py-0.5 rounded-full">
            {pendingOpsCount}
          </span>
        </div>
      ) : (
        <div className="text-xs text-text-secondary">
          {pendingOpsCount === 1
            ? t("sidebar.pendingChange", { count: pendingOpsCount })
            : t("sidebar.pendingChanges", { count: pendingOpsCount })}
        </div>
      )}
    </div>
  );
}
