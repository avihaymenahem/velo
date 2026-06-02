import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: "Delete item?",
    message: "This action cannot be undone.",
  };

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  it("renders title and message when open", () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.getByText("Delete item?")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<ConfirmDialog {...baseProps} isOpen={false} />);
    expect(screen.queryByText("Delete item?")).not.toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when cancel button is clicked", () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("localizes default labels in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<ConfirmDialog {...baseProps} />);

    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("calls onClose when Escape key is pressed", () => {
    render(<ConfirmDialog {...baseProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(baseProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("uses custom confirm and cancel labels", () => {
    render(<ConfirmDialog {...baseProps} confirmLabel="Yes, delete" cancelLabel="No, keep" />);
    expect(screen.getByRole("button", { name: "Yes, delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No, keep" })).toBeInTheDocument();
  });

  it("applies danger variant to confirm button", () => {
    render(<ConfirmDialog {...baseProps} variant="danger" confirmLabel="Delete" />);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-danger");
  });

  it("applies primary variant to confirm button by default", () => {
    render(<ConfirmDialog {...baseProps} />);
    const btn = screen.getByRole("button", { name: "Confirm" });
    expect(btn.className).toContain("bg-accent");
  });

  it("disables buttons when loading", () => {
    render(<ConfirmDialog {...baseProps} loading />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
  });

  it("renders ReactNode message", () => {
    render(
      <ConfirmDialog
        {...baseProps}
        message={<span data-testid="custom-msg">Rich content</span>}
      />,
    );
    expect(screen.getByTestId("custom-msg")).toBeInTheDocument();
  });
});
