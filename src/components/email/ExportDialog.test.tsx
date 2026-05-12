import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExportDialog } from "./ExportDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(() => Promise.resolve("/mock/path/export.mbox")),
}));

vi.mock("@/services/export/exportService", () => ({
  exportMessages: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));

describe("ExportDialog", () => {
  const defaultProps = {
    accountId: "acc-1",
    isOpen: true,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders format selection step by default", () => {
    render(<ExportDialog {...defaultProps} />);
    expect(screen.getByText("Choose export format")).toBeTruthy();
  });

  it("shows three format options", () => {
    render(<ExportDialog {...defaultProps} />);
    expect(screen.getByText("Mbox")).toBeTruthy();
    expect(screen.getByText("EML")).toBeTruthy();
    expect(screen.getByText("ZIP")).toBeTruthy();
  });

  it("transitions from format to filter step on Next", () => {
    render(<ExportDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Filter messages (optional)")).toBeTruthy();
  });

  it("shows date filter inputs after transitioning to filter step", () => {
    render(<ExportDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("From date")).toBeTruthy();
    expect(screen.getByText("To date")).toBeTruthy();
  });

  it("can navigate back from filter to format step", () => {
    render(<ExportDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Choose export format")).toBeTruthy();
  });

  it("shows done screen on successful export", async () => {
    render(<ExportDialog {...defaultProps} />);
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));
    const browseBtn = screen.getByText("Browse");
    fireEvent.click(browseBtn);
    await waitFor(() => {
      expect(screen.getByText("Next")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText("Next"));
    const exportBtn = await screen.findByText("Export");
    fireEvent.click(exportBtn);
    expect(await screen.findByText("Export Complete")).toBeTruthy();
  });
});
