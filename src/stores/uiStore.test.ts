import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUIStore } from "./uiStore";

vi.mock("@/services/db/settings", () => ({
  setSetting: vi.fn(() => Promise.resolve()),
}));

import { setSetting } from "@/services/db/settings";

describe("uiStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({
      theme: "system",
      sidebarCollapsed: false,
      readingPanePosition: "right",
      activeLabel: "inbox",
      readFilter: "all",
    });
  });

  it("should have correct default values", () => {
    const state = useUIStore.getState();
    expect(state.theme).toBe("system");
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.readingPanePosition).toBe("right");
    expect(state.activeLabel).toBe("inbox");
  });

  it("should set theme", () => {
    useUIStore.getState().setTheme("dark");
    expect(useUIStore.getState().theme).toBe("dark");
  });

  it("should toggle sidebar", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("should persist sidebar state on toggle", () => {
    useUIStore.getState().toggleSidebar();
    expect(setSetting).toHaveBeenCalledWith("sidebar_collapsed", "true");

    useUIStore.getState().toggleSidebar();
    expect(setSetting).toHaveBeenCalledWith("sidebar_collapsed", "false");
  });

  it("should set sidebar collapsed directly", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    useUIStore.getState().setSidebarCollapsed(false);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("should set reading pane position", () => {
    useUIStore.getState().setReadingPanePosition("bottom");
    expect(useUIStore.getState().readingPanePosition).toBe("bottom");
  });

  it("should set active label", () => {
    useUIStore.getState().setActiveLabel("starred");
    expect(useUIStore.getState().activeLabel).toBe("starred");
  });

  it("setReadingPanePosition should persist to DB settings", () => {
    useUIStore.getState().setReadingPanePosition("bottom");
    expect(setSetting).toHaveBeenCalledWith("reading_pane_position", "bottom");
    expect(useUIStore.getState().readingPanePosition).toBe("bottom");

    useUIStore.getState().setReadingPanePosition("hidden");
    expect(setSetting).toHaveBeenCalledWith("reading_pane_position", "hidden");
    expect(useUIStore.getState().readingPanePosition).toBe("hidden");
  });

  it("setReadFilter should persist to DB settings", () => {
    useUIStore.getState().setReadFilter("unread");
    expect(setSetting).toHaveBeenCalledWith("read_filter", "unread");
    expect(useUIStore.getState().readFilter).toBe("unread");

    useUIStore.getState().setReadFilter("read");
    expect(setSetting).toHaveBeenCalledWith("read_filter", "read");
    expect(useUIStore.getState().readFilter).toBe("read");
  });
});
