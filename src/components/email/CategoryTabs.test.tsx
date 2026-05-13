import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CategoryTabs } from "./CategoryTabs";

vi.mock("@/services/db/threadCategories", () => ({
  ALL_CATEGORIES: ["Primary", "Updates", "Promotions", "Social", "Newsletters"],
}));

// jsdom does not provide ResizeObserver or scrollIntoView
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Element.prototype.scrollIntoView = vi.fn();
});

describe("CategoryTabs", () => {
  const onCategoryChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all 5 category tabs", () => {
    render(
      <CategoryTabs
        activeCategory="Primary"
        onCategoryChange={onCategoryChange}
      />,
    );

    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
    expect(screen.getByText("Promotions")).toBeInTheDocument();
    expect(screen.getByText("Social")).toBeInTheDocument();
    expect(screen.getByText("Newsletters")).toBeInTheDocument();
  });

  it("highlights the active category", () => {
    render(
      <CategoryTabs
        activeCategory="Updates"
        onCategoryChange={onCategoryChange}
      />,
    );

    const updatesBtn = screen.getByText("Updates").closest("button");
    expect(updatesBtn?.className).toContain("text-accent");

    const primaryBtn = screen.getByText("Primary").closest("button");
    expect(primaryBtn?.className).toContain("text-text-tertiary");
  });

  it("calls onCategoryChange when a tab is clicked", () => {
    render(
      <CategoryTabs
        activeCategory="Primary"
        onCategoryChange={onCategoryChange}
      />,
    );

    fireEvent.click(screen.getByText("Social"));
    expect(onCategoryChange).toHaveBeenCalledWith("Social");
  });

  it("shows unread count badges when provided", () => {
    render(
      <CategoryTabs
        activeCategory="Primary"
        onCategoryChange={onCategoryChange}
        unreadCounts={{ Updates: 5, Promotions: 12 }}
      />,
    );

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("does not show unread badge for zero counts", () => {
    render(
      <CategoryTabs
        activeCategory="Primary"
        onCategoryChange={onCategoryChange}
        unreadCounts={{ Primary: 0, Updates: 3 }}
      />,
    );

    // "3" should be shown, but "0" should not
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows pencil icon on tabs with user overrides", () => {
    render(
      <CategoryTabs
        activeCategory="Primary"
        onCategoryChange={onCategoryChange}
        userOverrideCounts={{ Updates: 2, Promotions: 1 }}
      />,
    );

    const pencils = document.querySelectorAll('[class*="lucide-pencil"]');
    expect(pencils.length).toBe(2);
  });
});
