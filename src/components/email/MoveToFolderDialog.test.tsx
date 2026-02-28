import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoveToFolderDialog } from "./MoveToFolderDialog";

// Mock dependencies
vi.mock("@/stores/labelStore", () => ({
  useLabelStore: vi.fn((selector: (s: { labels: { id: string; name: string; accountId: string; type: string; colorBg: string | null; colorFg: string | null; sortOrder: number }[] }) => unknown) =>
    selector({
      labels: [
        { id: "label-1", name: "Work", accountId: "acc-1", type: "user", colorBg: null, colorFg: null, sortOrder: 0 },
        { id: "label-2", name: "Personal", accountId: "acc-1", type: "user", colorBg: null, colorFg: null, sortOrder: 1 },
        { id: "label-3", name: "Finance", accountId: "acc-1", type: "user", colorBg: null, colorFg: null, sortOrder: 2 },
      ],
    }),
  ),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: vi.fn((selector: (s: { activeAccountId: string; accounts: { id: string; provider?: string }[] }) => unknown) =>
    selector({
      activeAccountId: "acc-1",
      accounts: [{ id: "acc-1", provider: "gmail_api" }],
    }),
  ),
}));

vi.mock("@/stores/threadStore", () => ({
  useThreadStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: () => ({
        threads: [{ id: "thread-1", labelIds: ["INBOX"] }],
      }),
    },
  ),
}));

vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(() => Promise.resolve({ success: true })),
  trashThread: vi.fn(() => Promise.resolve({ success: true })),
  spamThread: vi.fn(() => Promise.resolve({ success: true })),
  addThreadLabel: vi.fn(() => Promise.resolve({ success: true })),
  removeThreadLabel: vi.fn(() => Promise.resolve({ success: true })),
  moveThread: vi.fn(() => Promise.resolve({ success: true })),
}));

// CSSTransition mock: render children immediately when `in` is true
vi.mock("react-transition-group", () => ({
  CSSTransition: ({ in: inProp, children, unmountOnExit, onEntered }: { in: boolean; children: React.ReactNode; unmountOnExit?: boolean; onEntered?: () => void }) => {
    if (!inProp && unmountOnExit) return null;
    // Trigger onEntered immediately for testing
    if (inProp && onEntered) {
      setTimeout(onEntered, 0);
    }
    return <>{children}</>;
  },
}));

import { archiveThread, trashThread, spamThread, addThreadLabel, removeThreadLabel } from "@/services/emailActions";

const defaultProps = {
  isOpen: true,
  threadIds: ["thread-1"],
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MoveToFolderDialog", () => {
  it("renders system destinations and user labels when open", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
    expect(screen.getByText("Spam")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    render(<MoveToFolderDialog {...defaultProps} isOpen={false} />);

    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
  });

  it("filters destinations by search query", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("Move to...");
    fireEvent.change(input, { target: { value: "work" } });

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.queryByText("Personal")).not.toBeInTheDocument();
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
  });

  it("shows empty state when no matches", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("Move to...");
    fireEvent.change(input, { target: { value: "nonexistent" } });

    expect(screen.getByText("No matching folders or labels")).toBeInTheDocument();
  });

  it("calls archiveThread when Archive is selected", async () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Archive"));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(archiveThread).toHaveBeenCalledWith("acc-1", "thread-1", []);
  });

  it("calls trashThread when Trash is selected", async () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Trash"));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(trashThread).toHaveBeenCalledWith("acc-1", "thread-1", []);
  });

  it("calls spamThread when Spam is selected", async () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Spam"));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(spamThread).toHaveBeenCalledWith("acc-1", "thread-1", [], true);
  });

  it("calls addThreadLabel + removeThreadLabel for Gmail label selection", async () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Work"));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "thread-1", "label-1");
    // removeThreadLabel is called after addThreadLabel resolves — wait for microtasks
    await vi.waitFor(() => {
      expect(removeThreadLabel).toHaveBeenCalledWith("acc-1", "thread-1", "INBOX");
    });
  });

  it("calls addThreadLabel for Inbox (un-archive) on Gmail", async () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    fireEvent.click(screen.getByText("Inbox"));

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "thread-1", "INBOX");
  });

  it("closes on Escape key", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("Move to...");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("navigates with arrow keys and selects with Enter", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    const input = screen.getByPlaceholderText("Move to...");

    // Arrow down to "Archive" (index 1)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onClose).toHaveBeenCalled();
    expect(archiveThread).toHaveBeenCalledWith("acc-1", "thread-1", []);
  });

  it("handles multiple threadIds", async () => {
    render(<MoveToFolderDialog {...defaultProps} threadIds={["thread-1", "thread-2"]} />);

    fireEvent.click(screen.getByText("Archive"));

    await vi.waitFor(() => {
      expect(archiveThread).toHaveBeenCalledTimes(2);
    });
    expect(archiveThread).toHaveBeenCalledWith("acc-1", "thread-1", []);
    expect(archiveThread).toHaveBeenCalledWith("acc-1", "thread-2", []);
  });

  it("closes when clicking the backdrop", () => {
    const { container } = render(<MoveToFolderDialog {...defaultProps} />);

    // The overlay div is the backdrop
    const overlay = container.querySelector(".fixed.inset-0");
    if (overlay) {
      fireEvent.click(overlay);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it("renders keyboard hint footer", () => {
    render(<MoveToFolderDialog {...defaultProps} />);

    expect(screen.getByText("navigate")).toBeInTheDocument();
    expect(screen.getByText("select")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });
});
