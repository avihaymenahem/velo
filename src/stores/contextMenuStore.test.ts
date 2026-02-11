import { describe, it, expect, beforeEach } from "vitest";
import { useContextMenuStore } from "./contextMenuStore";

describe("contextMenuStore", () => {
  beforeEach(() => {
    useContextMenuStore.setState({
      menuType: null,
      position: { x: 0, y: 0 },
      data: {},
    });
  });

  it("should have correct default values", () => {
    const state = useContextMenuStore.getState();
    expect(state.menuType).toBeNull();
    expect(state.position).toEqual({ x: 0, y: 0 });
    expect(state.data).toEqual({});
  });

  it("should open a menu with type, position, and data", () => {
    useContextMenuStore.getState().openMenu(
      "thread",
      { x: 100, y: 200 },
      { threadId: "abc123" },
    );

    const state = useContextMenuStore.getState();
    expect(state.menuType).toBe("thread");
    expect(state.position).toEqual({ x: 100, y: 200 });
    expect(state.data).toEqual({ threadId: "abc123" });
  });

  it("should open a menu with default empty data", () => {
    useContextMenuStore.getState().openMenu(
      "sidebarLabel",
      { x: 50, y: 75 },
    );

    const state = useContextMenuStore.getState();
    expect(state.menuType).toBe("sidebarLabel");
    expect(state.position).toEqual({ x: 50, y: 75 });
    expect(state.data).toEqual({});
  });

  it("should close the menu", () => {
    useContextMenuStore.getState().openMenu(
      "thread",
      { x: 100, y: 200 },
      { threadId: "abc123" },
    );

    useContextMenuStore.getState().closeMenu();

    const state = useContextMenuStore.getState();
    expect(state.menuType).toBeNull();
    expect(state.data).toEqual({});
  });

  it("should only have one menu open at a time", () => {
    useContextMenuStore.getState().openMenu(
      "thread",
      { x: 100, y: 200 },
      { threadId: "thread1" },
    );

    useContextMenuStore.getState().openMenu(
      "sidebarLabel",
      { x: 300, y: 400 },
      { labelId: "label1" },
    );

    const state = useContextMenuStore.getState();
    expect(state.menuType).toBe("sidebarLabel");
    expect(state.position).toEqual({ x: 300, y: 400 });
    expect(state.data).toEqual({ labelId: "label1" });
  });

  it("should handle message menu type", () => {
    useContextMenuStore.getState().openMenu(
      "message",
      { x: 150, y: 250 },
      { messageId: "msg1", bodyText: "Hello" },
    );

    const state = useContextMenuStore.getState();
    expect(state.menuType).toBe("message");
    expect(state.data["messageId"]).toBe("msg1");
    expect(state.data["bodyText"]).toBe("Hello");
  });
});
