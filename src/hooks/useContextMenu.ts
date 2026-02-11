import { useCallback } from "react";
import { useContextMenuStore, type ContextMenuType } from "@/stores/contextMenuStore";

/**
 * Hook to wire up a context menu trigger on an element.
 * Returns an onContextMenu handler that opens the specified menu type.
 */
export function useContextMenu(
  menuType: ContextMenuType,
  getData?: () => Record<string, unknown>,
) {
  const openMenu = useContextMenuStore((s) => s.openMenu);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openMenu(menuType, { x: e.clientX, y: e.clientY }, getData?.());
    },
    [menuType, openMenu, getData],
  );

  return onContextMenu;
}
