import { create } from "zustand";
import { setSetting } from "@/services/db/settings";

type Theme = "light" | "dark" | "system";
type ReadingPanePosition = "right" | "bottom" | "hidden";
type ReadFilter = "all" | "read" | "unread";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  contactSidebarVisible: boolean;
  readingPanePosition: ReadingPanePosition;
  activeLabel: string;
  readFilter: ReadFilter;
  emailListWidth: number;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleContactSidebar: () => void;
  setContactSidebarVisible: (visible: boolean) => void;
  setReadingPanePosition: (position: ReadingPanePosition) => void;
  setActiveLabel: (label: string) => void;
  setReadFilter: (filter: ReadFilter) => void;
  setEmailListWidth: (width: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  theme: "system",
  sidebarCollapsed: false,
  contactSidebarVisible: true,
  readingPanePosition: "right",
  activeLabel: "inbox",
  readFilter: "all",
  emailListWidth: 320,

  setTheme: (theme) => set({ theme }),
  toggleSidebar: () =>
    set((state) => {
      const collapsed = !state.sidebarCollapsed;
      setSetting("sidebar_collapsed", String(collapsed)).catch(() => {});
      return { sidebarCollapsed: collapsed };
    }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleContactSidebar: () =>
    set((state) => {
      const visible = !state.contactSidebarVisible;
      setSetting("contact_sidebar_visible", String(visible)).catch(() => {});
      return { contactSidebarVisible: visible };
    }),
  setContactSidebarVisible: (contactSidebarVisible) => set({ contactSidebarVisible }),
  setReadingPanePosition: (readingPanePosition) => {
    setSetting("reading_pane_position", readingPanePosition).catch(() => {});
    set({ readingPanePosition });
  },
  setActiveLabel: (activeLabel) => set({ activeLabel }),
  setReadFilter: (readFilter) => {
    setSetting("read_filter", readFilter).catch(() => {});
    set({ readFilter });
  },
  setEmailListWidth: (emailListWidth) => {
    setSetting("email_list_width", String(emailListWidth)).catch(() => {});
    set({ emailListWidth });
  },
}));
