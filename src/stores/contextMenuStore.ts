import { create } from "zustand";

export type ContextMenuType = "sidebarLabel" | "thread" | "message" | null;

interface ContextMenuState {
  menuType: ContextMenuType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  openMenu: (type: ContextMenuType, position: { x: number; y: number }, data?: Record<string, unknown>) => void;
  closeMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  menuType: null,
  position: { x: 0, y: 0 },
  data: {},

  openMenu: (menuType, position, data = {}) =>
    set({ menuType, position, data }),

  closeMenu: () =>
    set({ menuType: null, data: {} }),
}));
