import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDroppable } from "@dnd-kit/core";
import { AccountSwitcher } from "../accounts/AccountSwitcher";
import { LabelForm } from "../labels/LabelForm";
import { InputDialog } from "../ui/InputDialog";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLabelStore, type Label } from "@/stores/labelStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { useActiveLabel, useActiveCategory } from "@/hooks/useRouteNavigation";
import { navigateToLabel } from "@/router/navigate";
import { getCategoryUnreadCounts } from "@/services/db/threadCategories";
import { getLabelUnreadCount, getAllLabelUnreadCounts } from "@/services/db/threads";
import {
  Inbox,
  Star,
  Clock,
  Send,
  FileEdit,
  Trash2,
  Ban,
  Mail,
  CheckSquare,
  Calendar,
  Settings,
  Plus,
  Tag,
  ChevronDown,
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
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { useTaskStore } from "@/stores/taskStore";

interface SidebarProps {
  collapsed: boolean;
  onAddAccount: () => void;
}

export const ALL_NAV_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "inbox", label: "nav.inbox", icon: Inbox },
  { id: "starred", label: "nav.starred", icon: Star },
  { id: "snoozed", label: "nav.snoozed", icon: Clock },
  { id: "sent", label: "nav.sent", icon: Send },
  { id: "drafts", label: "nav.drafts", icon: FileEdit },
  { id: "trash", label: "nav.trash", icon: Trash2 },
  { id: "spam", label: "nav.spam", icon: Ban },
  { id: "all", label: "nav.allMail", icon: Mail },
  { id: "tasks", label: "nav.tasks", icon: CheckSquare },
  { id: "calendar", label: "nav.calendar", icon: Calendar },
  { id: "attachments", label: "nav.attachments", icon: Paperclip },
  { id: "campaigns", label: "nav.campaigns", icon: Send },
  { id: "business", label: "nav.business", icon: BarChart3 },
  { id: "smart-folders", label: "nav.smartFolders", icon: FolderSearch },
  { id: "labels", label: "nav.labels", icon: Tag },
];

const CATEGORY_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "Primary", label: "categories.primary", icon: Inbox },
  { id: "Updates", label: "categories.updates", icon: Bell },
  { id: "Promotions", label: "categories.promotions", icon: Tag },
  { id: "Social", label: "categories.social", icon: Users },
  { id: "Newsletters", label: "categories.newsletters", icon: Newspaper },
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
      className={`flex items-center w-full py-2 text-sm transition-colors press-scale ${
        collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
      } ${
        isOver
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

function DroppableLabelItem({
  label,
  isActive,
  collapsed,
  unreadCount,
  onClick,
  onContextMenu,
  onEditClick,
}: {
  label: Label;
  isActive: boolean;
  collapsed: boolean;
  unreadCount?: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEditClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: label.id });
  const initial = (label.name[0] ?? "?").toUpperCase();

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={collapsed ? label.name : undefined}
      className={`group flex items-center w-full py-2 text-sm transition-colors ${
        collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
      } ${
        isOver
          ? "bg-accent/20 ring-1 ring-accent"
          : isActive
            ? "bg-accent/10 text-accent font-medium"
            : "hover:bg-sidebar-hover text-sidebar-text"
      }`}
    >
      {collapsed ? (
        <span
          className="relative w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
          style={label.colorBg
            ? { backgroundColor: label.colorBg, color: label.colorFg ?? "#ffffff" }
            : undefined
          }
        >
          {label.colorBg ? (
            initial
          ) : (
            <Tag size={14} />
          )}
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center bg-accent text-white text-[0.5rem] font-bold rounded-full transition-all duration-300">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
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
            <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal transition-all duration-300 mr-0.5">
              {unreadCount}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onEditClick(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onEditClick(); } }}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-opacity"
            title="Edit label"
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
};

function getSmartFolderIcon(iconName: string): LucideIcon {
  return SMART_FOLDER_ICON_MAP[iconName] ?? Search;
}

const LABELS_COLLAPSED_COUNT = 3;

export function Sidebar({ collapsed, onAddAccount }: SidebarProps) {
  const { t } = useTranslation();
  const activeLabel = useActiveLabel();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarNavConfig = useUIStore((s) => s.sidebarNavConfig);
  const taskIncompleteCount = useTaskStore((s) => s.incompleteCount);
  const inboxViewMode = useUIStore((s) => s.inboxViewMode);
  const setInboxViewMode = useUIStore((s) => s.setInboxViewMode);
  const activeCategory = useActiveCategory();
  const openComposer = useComposerStore((s) => s.openComposer);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const labels = useLabelStore((s) => s.labels);
  const loadLabels = useLabelStore((s) => s.loadLabels);
  const deleteLabel = useLabelStore((s) => s.deleteLabel);
  const smartFolders = useSmartFolderStore((s) => s.folders);
  const smartFolderCounts = useSmartFolderStore((s) => s.unreadCounts);
  const loadSmartFolders = useSmartFolderStore((s) => s.loadFolders);
  const refreshSmartFolderCounts = useSmartFolderStore((s) => s.refreshUnreadCounts);
  const createSmartFolder = useSmartFolderStore((s) => s.createFolder);
  const SECTION_IDS = new Set(["smart-folders", "labels"]);

  const { visibleNavItems, showSmartFolders, showLabels } = useMemo(() => {
    if (!sidebarNavConfig) {
      const navOnly = ALL_NAV_ITEMS.filter((i) => !SECTION_IDS.has(i.id));
      return { visibleNavItems: navOnly, showSmartFolders: true, showLabels: true };
    }
    const itemMap = new Map(ALL_NAV_ITEMS.map((item) => [item.id, item]));
    const result: typeof ALL_NAV_ITEMS = [];
    const seen = new Set<string>();
    let smartFoldersVisible = true;
    let labelsVisible = true;
    for (const entry of sidebarNavConfig) {
      seen.add(entry.id);
      if (entry.id === "smart-folders") { smartFoldersVisible = entry.visible; continue; }
      if (entry.id === "labels") { labelsVisible = entry.visible; continue; }
      if (entry.visible && itemMap.has(entry.id)) {
        result.push(itemMap.get(entry.id)!);
      }
    }
    // Append any new items not present in the saved config
    for (const item of ALL_NAV_ITEMS) {
      if (!seen.has(item.id) && !SECTION_IDS.has(item.id)) result.push(item);
    }
    return { visibleNavItems: result, showSmartFolders: smartFoldersVisible, showLabels: labelsVisible };
  }, [sidebarNavConfig]);

  const [labelsExpanded, setLabelsExpanded] = useState(false);

  // Unread counts for inbox nav item and category sub-items
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Per-label unread counts for user-created labels
  const [labelUnreadCounts, setLabelUnreadCounts] = useState<Record<string, number>>({});

  const refreshLabelUnreadCounts = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      // Fetch per-label counts and per-category counts in parallel
      const [labelCounts, categoryCounts, allLabelCounts] = await Promise.all([
        getLabelUnreadCount(activeAccountId, "INBOX"),
        getCategoryUnreadCounts(activeAccountId),
        getAllLabelUnreadCounts(activeAccountId),
      ]);
      const counts: Record<string, number> = { INBOX: labelCounts };
      for (const [cat, count] of categoryCounts) {
        counts[cat] = count;
      }
      setUnreadCounts(counts);
      setLabelUnreadCounts(allLabelCounts);
    } catch (err) {
      console.error("Failed to refresh label unread counts:", err);
    }
  }, [activeAccountId]);

  // Load labels when active account changes
  useEffect(() => {
    if (activeAccountId) {
      loadLabels(activeAccountId);
    }
  }, [activeAccountId, loadLabels]);

  // Load smart folders when active account changes
  useEffect(() => {
    loadSmartFolders(activeAccountId ?? undefined);
    if (activeAccountId) {
      refreshSmartFolderCounts(activeAccountId);
      refreshLabelUnreadCounts();
    }
  }, [activeAccountId, loadSmartFolders, refreshSmartFolderCounts, refreshLabelUnreadCounts]);

  // Reload labels and smart folder counts on sync completion (debounced to avoid waterfall from multiple emitters)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (activeAccountId) {
          loadLabels(activeAccountId);
          refreshSmartFolderCounts(activeAccountId);
          refreshLabelUnreadCounts();
        }
        useUIStore.getState().setSyncingFolder(null);
      }, 500);
    };
    window.addEventListener("velo-sync-done", handler);
    return () => {
      window.removeEventListener("velo-sync-done", handler);
      if (timer) clearTimeout(timer);
    };
  }, [activeAccountId, loadLabels, refreshSmartFolderCounts, refreshLabelUnreadCounts]);

  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);

  const openMenu = useContextMenuStore((s) => s.openMenu);
  const isSyncingFolder = useUIStore((s) => s.isSyncingFolder);

  const handleNavContextMenu = useCallback((e: React.MouseEvent, navId: string) => {
    e.preventDefault();
    openMenu("sidebarNav", { x: e.clientX, y: e.clientY }, { navId });
  }, [openMenu]);

  const handleDeleteLabel = useCallback(async (labelId: string) => {
    if (!activeAccountId) return;
    try {
      await deleteLabel(activeAccountId, labelId);
      if (editingLabelId === labelId) setEditingLabelId(null);
    } catch {
      // Silently fail in sidebar — user can use Settings for detailed errors
    }
  }, [activeAccountId, deleteLabel, editingLabelId]);

  const handleFormDone = useCallback(() => {
    setEditingLabelId(null);
    setShowNewLabelForm(false);
  }, []);

  const handleEditLabel = useCallback((labelId: string) => {
    setShowNewLabelForm(false);
    setEditingLabelId(labelId);
  }, []);

  const handleLabelContextMenu = useCallback((e: React.MouseEvent, labelId: string) => {
    e.preventDefault();
    openMenu("sidebarLabel", { x: e.clientX, y: e.clientY }, {
      labelId,
      onEdit: () => handleEditLabel(labelId),
      onDelete: () => handleDeleteLabel(labelId),
    });
  }, [openMenu, handleEditLabel, handleDeleteLabel]);

  const handleAddLabel = useCallback(() => {
    setEditingLabelId(null);
    setShowNewLabelForm(true);
  }, []);

  const [showSmartFolderModal, setShowSmartFolderModal] = useState(false);

  const handleAddSmartFolder = useCallback(() => {
    setShowSmartFolderModal(true);
  }, []);

  const editingLabel = editingLabelId ? labels.find((l) => l.id === editingLabelId) ?? null : null;

  return (
    <aside
      className={`no-select flex flex-col bg-sidebar-bg text-sidebar-text border-r border-border-primary transition-all duration-200 glass-panel ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <AccountSwitcher collapsed={collapsed} onAddAccount={onAddAccount} />

      {/* Compose button */}
      <div className="px-3 py-2">
        <button
          onClick={() => openComposer()}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white rounded-lg py-2 text-sm font-medium interactive-btn"
        >
          {collapsed ? <Plus size={16} /> : t("nav.compose")}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isInbox = item.id === "inbox";
          return (
            <div key={item.id}>
              <DroppableNavItem
                id={item.id}
                isActive={isInbox ? (activeLabel === "inbox" && (inboxViewMode === "unified" || activeCategory === "Primary")) : activeLabel === item.id}
                collapsed={collapsed}
                onClick={() => {
                  if (isInbox && inboxViewMode === "split") {
                    navigateToLabel(item.id, { category: "Primary" });
                  } else {
                    navigateToLabel(item.id);
                  }
                }}
                onContextMenu={(e) => handleNavContextMenu(e, item.id)}
                title={collapsed ? t(item.label) : undefined}
              >
                {() => (
                  <>
                    {isSyncingFolder === item.id ? (
                      <Loader2 size={18} className="shrink-0 animate-spin text-accent" />
                    ) : (
                      <Icon size={18} className="shrink-0" />
                    )}
{!collapsed && (
                       <span className="flex-1 truncate">{t(item.label)}</span>
                     )}
                      {isInbox && (unreadCounts["INBOX"] ?? 0) > 0 && !collapsed && (
                        <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
                          {unreadCounts["INBOX"]}
                        </span>
                      )}
                     {item.id === "tasks" && taskIncompleteCount > 0 && !collapsed && (
                      <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
                        {taskIncompleteCount}
                      </span>
                    )}
                    {isInbox && !collapsed && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInboxViewMode(inboxViewMode === "split" ? "unified" : "split");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setInboxViewMode(inboxViewMode === "split" ? "unified" : "split");
                          }
                        }}
                        title={inboxViewMode === "split" ? "Switch to unified inbox" : "Switch to split inbox"}
                        className={`p-1 rounded transition-colors ${
                          inboxViewMode === "split"
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
                    const isCatActive = activeLabel === "inbox" && activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          navigateToLabel("inbox", { category: cat.id });
                        }}
                        className={`flex items-center gap-2 w-full py-1.5 pl-7 pr-3 text-left text-[0.8125rem] transition-colors ${
                          isCatActive
                            ? "text-accent font-medium"
                            : "text-sidebar-text/70 hover:text-sidebar-text hover:bg-sidebar-hover"
                        }`}
                      >
<CatIcon size={14} className="shrink-0" />
                         <span className="flex-1 truncate">{t(cat.label)}</span>
{unreadCounts[cat.id] !== undefined && (unreadCounts[cat.id] ?? 0) > 0 && (
                            <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
                              {unreadCounts[cat.id] ?? 0}
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

        {/* Smart Folders */}
        {showSmartFolders && (smartFolders.length > 0 || !collapsed) && (
          <>
            {!collapsed && (
              <div className="flex items-center justify-between px-3 pt-4 pb-1">
                <span className="text-xs font-medium text-sidebar-text/60 uppercase tracking-wider">
                  {t("nav.smartFolders")}
                </span>
                <button
                  onClick={handleAddSmartFolder}
                  className="p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-colors"
                  title="Add smart folder"
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
                  className={`flex items-center w-full py-2 text-sm transition-colors press-scale ${
                    collapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
                  } ${
                    isActive
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
                        <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
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

        {/* User labels */}
        {showLabels && (labels.length > 0 || !collapsed) && (
          <>
            {!collapsed && (
              <div className="flex items-center justify-between px-3 pt-4 pb-1">
                <span className="text-xs font-medium text-sidebar-text/60 uppercase tracking-wider">
                  {t("nav.labels")}
                </span>
                <button
                  onClick={handleAddLabel}
                  className="p-0.5 text-sidebar-text/40 hover:text-sidebar-text transition-colors"
                  title="Add label"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
            {/* Always-visible labels */}
            {labels.slice(0, LABELS_COLLAPSED_COUNT).map((label) => (
              <div key={label.id}>
                <DroppableLabelItem
                  label={label}
                  isActive={activeLabel === label.id}
                  collapsed={collapsed}
                  unreadCount={labelUnreadCounts[label.id] ?? 0}
                  onClick={() => navigateToLabel(label.id)}
                  onContextMenu={(e) => handleLabelContextMenu(e, label.id)}
                  onEditClick={() => handleEditLabel(label.id)}
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
            {/* Collapsible labels with accordion animation */}
            {labels.length > LABELS_COLLAPSED_COUNT && (
              <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${labelsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  {labels.slice(LABELS_COLLAPSED_COUNT).map((label) => (
                    <div key={label.id}>
                      <DroppableLabelItem
                        label={label}
                        isActive={activeLabel === label.id}
                        collapsed={collapsed}
                        unreadCount={labelUnreadCounts[label.id] ?? 0}
                        onClick={() => navigateToLabel(label.id)}
                        onContextMenu={(e) => handleLabelContextMenu(e, label.id)}
                        onEditClick={() => handleEditLabel(label.id)}
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
            {!collapsed && labels.length > LABELS_COLLAPSED_COUNT && (
              <button
                onClick={() => setLabelsExpanded((v) => !v)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-sidebar-text/60 hover:text-sidebar-text transition-colors"
              >
                {labelsExpanded ? (
                  <>
                    <ChevronUp size={12} />
                    <span>{t("nav.showLess")}</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    <span>{t("nav.nMore", { n: labels.length - LABELS_COLLAPSED_COUNT })}</span>
                  </>
                )}
              </button>
            )}
            {/* New label form at bottom of list */}
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
      <div className={`py-2 border-t border-border-primary flex ${collapsed ? "flex-col items-center gap-1 px-2" : "items-center gap-1 px-3"}`}>
        <button
          onClick={() => navigateToLabel("settings")}
          className={`flex items-center text-sm rounded-md transition-colors ${
            collapsed ? "p-2 justify-center" : "gap-3 flex-1 px-3 py-2 text-left"
          } ${
            activeLabel === "settings"
              ? "bg-accent/10 text-accent font-medium"
              : "text-sidebar-text hover:bg-sidebar-hover"
          }`}
          title={t("nav.settings")}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </button>
        <button
          onClick={() => navigateToLabel("help")}
          className={`flex items-center text-sm rounded-md transition-colors ${
            collapsed ? "p-2 justify-center" : "p-2"
          } ${
            activeLabel === "help"
              ? "bg-accent/10 text-accent font-medium"
              : "text-sidebar-text hover:bg-sidebar-hover"
          }`}
          title={t("nav.help")}
        >
          <HelpCircle size={18} className="shrink-0" />
        </button>
        <button
          onClick={toggleSidebar}
          className="p-2 text-sidebar-text/60 hover:text-sidebar-text hover:bg-sidebar-hover rounded-md transition-colors"
          title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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
        title={t("nav.newSmartFolder")}
        fields={[
          { key: "name", label: t("nav.name"), placeholder: t("nav.nameExample") },
          { key: "query", label: t("nav.searchQuery"), placeholder: t("nav.searchQueryExample") },
        ]}
      />

      {/* Pending operations indicator */}
      <PendingOpsIndicator collapsed={collapsed} />
    </aside>
  );
}

function PendingOpsIndicator({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const pendingOpsCount = useUIStore((s) => s.pendingOpsCount);
  if (pendingOpsCount <= 0) return null;

  return (
    <div className="px-3 py-2 border-t border-border-primary">
      {collapsed ? (
        <div className="flex justify-center">
          <span className="bg-accent/20 text-accent text-xs font-medium px-1.5 py-0.5 rounded-full">{pendingOpsCount}</span>
        </div>
      ) : (
        <div className="text-xs text-text-secondary">
          {t("nav.nPending", { n: pendingOpsCount })}
        </div>
      )}
    </div>
  );
}
