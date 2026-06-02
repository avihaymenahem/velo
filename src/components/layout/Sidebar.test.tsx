import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { navigateToLabel } from "@/router/navigate";
import { Sidebar } from "./Sidebar";

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock("../accounts/AccountSwitcher", () => ({
  AccountSwitcher: () => <div data-testid="account-switcher" />,
}));

vi.mock("../labels/LabelForm", () => ({
  LabelForm: () => <div data-testid="label-form" />,
}));

vi.mock("../ui/InputDialog", () => ({
  InputDialog: () => null,
}));

vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
}));

vi.mock("@/hooks/useRouteNavigation", () => ({
  useActiveLabel: () => "today",
  useActiveCategory: () => "Primary",
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        toggleSidebar: vi.fn(),
        sidebarNavConfig: null,
        inboxViewMode: "unified",
        setInboxViewMode: vi.fn(),
        isSyncingFolder: null,
      }),
    { getState: () => ({ setSyncingFolder: vi.fn() }) },
  ),
}));

vi.mock("@/stores/composerStore", () => ({
  useComposerStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openComposer: vi.fn() }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeAccountId: null }),
}));

vi.mock("@/stores/labelStore", () => ({
  useLabelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      labels: [],
      loadLabels: vi.fn(),
      deleteLabel: vi.fn(),
    }),
}));

vi.mock("@/stores/contextMenuStore", () => ({
  useContextMenuStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openMenu: vi.fn() }),
}));

vi.mock("@/stores/smartFolderStore", () => ({
  useSmartFolderStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      folders: [],
      unreadCounts: {},
      loadFolders: vi.fn(),
      refreshUnreadCounts: vi.fn(),
      createFolder: vi.fn(),
    }),
}));

vi.mock("@/stores/taskStore", () => ({
  useTaskStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ incompleteCount: 0 }),
}));

describe("Sidebar follow-up navigation", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("renders follow-up queues before traditional mailboxes", () => {
    const { container } = render(<Sidebar collapsed={false} onAddAccount={vi.fn()} />);

    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Needs Reply")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
    expect(screen.getByText("Due Soon")).toBeInTheDocument();

    const navText = container.querySelector("nav")?.textContent ?? "";
    expect(navText.indexOf("Follow-up")).toBeLessThan(navText.indexOf("Inbox"));
    expect(navText.indexOf("Due Soon")).toBeLessThan(navText.indexOf("Inbox"));
  });

  it("navigates to follow-up views through the mail label route", () => {
    render(<Sidebar collapsed={false} onAddAccount={vi.fn()} />);

    fireEvent.click(screen.getByText("Needs Reply"));

    expect(navigateToLabel).toHaveBeenCalledWith("needs-reply");
  });
});
