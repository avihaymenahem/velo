import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { Archive, Trash2, Star } from "lucide-react";

// Mock useClickOutside since it relies on document event listeners
vi.mock("@/hooks/useClickOutside", () => ({
  useClickOutside: vi.fn(),
}));

vi.mock("@/stores/contextMenuStore", () => ({
  useContextMenuStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => selector({
      menuType: null,
      position: { x: 0, y: 0 },
      data: {},
      openMenu: vi.fn(),
      closeMenu: vi.fn(),
    }),
    { getState: () => ({ menuType: null, closeMenu: vi.fn() }) },
  ),
}));

describe("ContextMenu", () => {
  const onClose = vi.fn();

  const baseItems: ContextMenuItem[] = [
    { id: "archive", label: "Archive", icon: Archive, shortcut: "e", action: vi.fn() },
    { id: "sep-1", label: "", separator: true },
    { id: "delete", label: "Delete", icon: Trash2, danger: true, action: vi.fn() },
    { id: "star", label: "Star", icon: Star, shortcut: "s", disabled: true, action: vi.fn() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render menu items", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Star")).toBeInTheDocument();
  });

  it("should render separators", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(1);
  });

  it("should render shortcuts", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    expect(screen.getByText("e")).toBeInTheDocument();
    expect(screen.getByText("s")).toBeInTheDocument();
  });

  it("should call action and close on click", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText("Archive"));
    expect(baseItems[0]!.action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("should not call action on disabled item click", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText("Star"));
    expect(baseItems[3]!.action).not.toHaveBeenCalled();
  });

  it("should apply danger styling", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    const deleteBtn = screen.getByText("Delete").closest("button");
    expect(deleteBtn?.className).toContain("text-danger");
  });

  it("should apply disabled styling", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    const starBtn = screen.getByText("Star").closest("button");
    expect(starBtn?.className).toContain("text-text-tertiary");
    expect(starBtn?.className).toContain("cursor-default");
  });

  it("should navigate with keyboard ArrowDown", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    // First ArrowDown should focus "Archive" (index 0)
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const archiveBtn = screen.getByText("Archive").closest("button");
    expect(archiveBtn?.className).toContain("bg-bg-hover");
  });

  it("should select focused item with Enter", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    // Navigate to Archive
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // Select
    fireEvent.keyDown(window, { key: "Enter" });
    expect(baseItems[0]!.action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("should close on Escape", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("should render with role=menu", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("should render items with role=menuitem", () => {
    render(
      <ContextMenu items={baseItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    const menuItems = screen.getAllByRole("menuitem");
    // 3 items (separator doesn't count as menuitem)
    expect(menuItems).toHaveLength(3);
  });

  it("should render submenu indicator for items with children", () => {
    const itemsWithSubmenu: ContextMenuItem[] = [
      {
        id: "label",
        label: "Apply Label",
        children: [
          { id: "label-1", label: "Work", action: vi.fn() },
          { id: "label-2", label: "Personal", action: vi.fn() },
        ],
      },
    ];

    render(
      <ContextMenu items={itemsWithSubmenu} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    expect(screen.getByText("Apply Label")).toBeInTheDocument();
  });

  it("should render checked items with checkmarks", () => {
    const checkedItems: ContextMenuItem[] = [
      { id: "item-checked", label: "Checked Item", checked: true, action: vi.fn() },
      { id: "item-unchecked", label: "Unchecked Item", checked: false, action: vi.fn() },
    ];

    render(
      <ContextMenu items={checkedItems} position={{ x: 100, y: 100 }} onClose={onClose} />,
    );

    expect(screen.getByText("Checked Item")).toBeInTheDocument();
    expect(screen.getByText("Unchecked Item")).toBeInTheDocument();
  });
});
