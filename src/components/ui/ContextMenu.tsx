import { useEffect, useRef, useState, useCallback } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { ChevronRight, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
  action?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [submenuOpenId, setSubmenuOpenId] = useState<string | null>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useClickOutside(menuRef, onClose);

  // Measure and clamp position to viewport
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x = position.x;
    let y = position.y;

    if (x + rect.width > vw) x = vw - rect.width - 4;
    if (y + rect.height > vh) y = vh - rect.height - 4;
    if (x < 4) x = 4;
    if (y < 4) y = 4;

    setAdjustedPosition({ x, y });
  }, [position]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev + 1;
            while (next < items.length && items[next]?.separator) next++;
            return next >= items.length ? prev : next;
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && items[next]?.separator) next--;
            return next < 0 ? prev : next;
          });
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const focused = items[focusedIndex];
          if (focused?.children && !focused.disabled) {
            setSubmenuOpenId(focused.id);
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          setSubmenuOpenId(null);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const focused = items[focusedIndex];
          if (focused && !focused.disabled && !focused.separator) {
            if (focused.children) {
              setSubmenuOpenId(focused.id);
            } else if (focused.action) {
              focused.action();
              onClose();
            }
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
        }
      }

      // Prevent other handlers from seeing these keys
      if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Enter", "Escape"].includes(e.key)) {
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [items, focusedIndex, onClose]);

  const handleMouseEnter = useCallback((index: number, item: ContextMenuItem) => {
    setFocusedIndex(index);

    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }

    if (item.children && !item.disabled) {
      submenuTimerRef.current = setTimeout(() => {
        setSubmenuOpenId(item.id);
      }, 150);
    } else {
      submenuTimerRef.current = setTimeout(() => {
        setSubmenuOpenId(null);
      }, 150);
    }
  }, []);

  const handleItemClick = useCallback((item: ContextMenuItem) => {
    if (item.disabled || item.separator) return;
    if (item.children) {
      setSubmenuOpenId(item.id);
      return;
    }
    item.action?.();
    onClose();
  }, [onClose]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100] bg-bg-primary border border-border-primary rounded-md shadow-lg py-1 min-w-[200px]"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return (
            <div
              key={item.id}
              role="separator"
              className="my-1 border-t border-border-secondary"
            />
          );
        }

        const Icon = item.icon;
        const isFocused = focusedIndex === index;
        const hasSubmenu = !!item.children;
        const isSubmenuOpen = submenuOpenId === item.id;

        return (
          <div key={item.id} className="relative">
            <button
              role="menuitem"
              disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => handleMouseEnter(index, item)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors ${
                item.disabled
                  ? "text-text-tertiary cursor-default"
                  : item.danger
                    ? `text-danger ${isFocused ? "bg-bg-hover" : ""}`
                    : `text-text-primary ${isFocused ? "bg-bg-hover" : ""}`
              }`}
            >
              {/* Checkmark or icon column */}
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {item.checked != null ? (
                  item.checked ? <Check size={12} /> : null
                ) : Icon ? (
                  <Icon size={12} />
                ) : null}
              </span>

              <span className="flex-1">{item.label}</span>

              {hasSubmenu && (
                <ChevronRight size={12} className="text-text-tertiary shrink-0" />
              )}

              {item.shortcut && !hasSubmenu && (
                <span className="text-text-tertiary ml-4 shrink-0">
                  {item.shortcut}
                </span>
              )}
            </button>

            {/* Submenu */}
            {hasSubmenu && isSubmenuOpen && item.children && (
              <Submenu
                items={item.children}
                parentRef={menuRef}
                itemIndex={index}
                onClose={onClose}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Submenu({
  items,
  parentRef,
  itemIndex,
  onClose,
}: {
  items: ContextMenuItem[];
  parentRef: React.RefObject<HTMLDivElement | null>;
  itemIndex: number;
  onClose: () => void;
}) {
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: string; top: string }>({ left: "100%", top: "0" });

  useEffect(() => {
    const parent = parentRef.current;
    const submenu = submenuRef.current;
    if (!parent || !submenu) return;

    const parentRect = parent.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Check if submenu fits to the right
    const fitsRight = parentRect.right + submenuRect.width <= vw;
    const left = fitsRight ? "100%" : `-${submenuRect.width}px`;

    // Vertical: align with the parent item, but clamp to viewport
    const itemElements = parent.querySelectorAll('[role="menuitem"], [role="separator"]');
    const itemEl = itemElements[itemIndex];
    let top = "0";
    if (itemEl) {
      const itemRect = itemEl.getBoundingClientRect();
      const submenuTop = itemRect.top - parentRect.top;
      const clampedTop = Math.min(
        submenuTop,
        vh - parentRect.top - submenuRect.height - 4,
      );
      top = `${Math.max(0, clampedTop)}px`;
    }

    setPosition({ left, top });
  }, [parentRef, itemIndex]);

  return (
    <div
      ref={submenuRef}
      role="menu"
      className="absolute z-[101] bg-bg-primary border border-border-primary rounded-md shadow-lg py-1 min-w-[180px]"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.action?.();
              // Don't close on label toggle — allow multi-apply
              if (item.checked == null) {
                onClose();
              }
            }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors ${
              item.disabled
                ? "text-text-tertiary cursor-default"
                : "text-text-primary hover:bg-bg-hover"
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {item.checked != null ? (
                item.checked ? <Check size={12} className="text-accent" /> : null
              ) : Icon ? (
                <Icon size={12} />
              ) : null}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
