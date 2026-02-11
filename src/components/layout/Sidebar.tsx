import { useEffect, useState, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { AccountSwitcher } from "../accounts/AccountSwitcher";
import { LabelForm } from "../labels/LabelForm";
import { useUIStore } from "@/stores/uiStore";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLabelStore, type Label } from "@/stores/labelStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import {
  Inbox,
  Star,
  Clock,
  Send,
  FileEdit,
  Trash2,
  Ban,
  Mail,
  Calendar,
  Settings,
  Plus,
  Tag,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  type LucideIcon,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onAddAccount: () => void;
}

const NAV_ITEMS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "snoozed", label: "Snoozed", icon: Clock },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileEdit },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "spam", label: "Spam", icon: Ban },
  { id: "all", label: "All Mail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
];

function DroppableNavItem({
  id,
  isActive,
  collapsed,
  onClick,
  title,
  children,
}: {
  id: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  title?: string;
  children: (isOver: boolean) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
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
  onClick,
  onContextMenu,
  onEditClick,
}: {
  label: Label;
  isActive: boolean;
  collapsed: boolean;
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
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
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
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onEditClick(); }}
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

const LABELS_COLLAPSED_COUNT = 3;

export function Sidebar({ collapsed, onAddAccount }: SidebarProps) {
  const { activeLabel, setActiveLabel, toggleSidebar } = useUIStore();
  const openComposer = useComposerStore((s) => s.openComposer);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const { labels, loadLabels, deleteLabel } = useLabelStore();
  const [labelsExpanded, setLabelsExpanded] = useState(false);

  // Inline label editing state
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [showNewLabelForm, setShowNewLabelForm] = useState(false);

  const openMenu = useContextMenuStore((s) => s.openMenu);

  // Load labels when active account changes
  useEffect(() => {
    if (activeAccountId) {
      loadLabels(activeAccountId);
    }
  }, [activeAccountId, loadLabels]);

  // Reload labels on sync completion
  useEffect(() => {
    const handler = () => {
      if (activeAccountId) {
        loadLabels(activeAccountId);
      }
    };
    window.addEventListener("velo-sync-done", handler);
    return () => window.removeEventListener("velo-sync-done", handler);
  }, [activeAccountId, loadLabels]);

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
          {collapsed ? <Plus size={16} /> : "Compose"}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <DroppableNavItem
              key={item.id}
              id={item.id}
              isActive={activeLabel === item.id}
              collapsed={collapsed}
              onClick={() => setActiveLabel(item.id)}
              title={collapsed ? item.label : undefined}
            >
              {() => (
                <>
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate">{item.label}</span>
                  )}
                </>
              )}
            </DroppableNavItem>
          );
        })}

        {/* User labels */}
        {(labels.length > 0 || !collapsed) && (
          <>
            {!collapsed && (
              <div className="flex items-center justify-between px-3 pt-4 pb-1">
                <span className="text-xs font-medium text-sidebar-text/60 uppercase tracking-wider">
                  Labels
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
                  onClick={() => setActiveLabel(label.id)}
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
                        onClick={() => setActiveLabel(label.id)}
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
                    <span>Show less</span>
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} />
                    <span>{labels.length - LABELS_COLLAPSED_COUNT} more</span>
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
          onClick={() => setActiveLabel("settings")}
          className={`flex items-center text-sm rounded-md transition-colors ${
            collapsed ? "p-2 justify-center" : "gap-3 flex-1 px-3 py-2 text-left"
          } ${
            activeLabel === "settings"
              ? "bg-accent/10 text-accent font-medium"
              : "text-sidebar-text hover:bg-sidebar-hover"
          }`}
          title="Settings"
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        <button
          onClick={toggleSidebar}
          className="p-2 text-sidebar-text/60 hover:text-sidebar-text hover:bg-sidebar-hover rounded-md transition-colors"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

    </aside>
  );
}
