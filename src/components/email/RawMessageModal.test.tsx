import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { RawMessageModal } from "./RawMessageModal";

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

import { getEmailProvider } from "@/services/email/providerFactory";

describe("RawMessageModal", () => {
  const mockFetchRawMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProvider).mockResolvedValue({
      fetchRawMessage: mockFetchRawMessage,
    } as never);
  });

  it("shows loading state initially", () => {
    mockFetchRawMessage.mockReturnValue(new Promise(() => {})); // never resolves
    render(
      <RawMessageModal
        isOpen={true}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    expect(screen.getByText("Loading message source...")).toBeInTheDocument();
  });

  it("displays raw message content after loading", async () => {
    const rawSource = "From: test@example.com\r\nSubject: Hello\r\n\r\nBody text";
    mockFetchRawMessage.mockResolvedValue(rawSource);

    render(
      <RawMessageModal
        isOpen={true}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      const pre = document.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre!.textContent).toBe(rawSource);
    });
  });

  it("displays error state on failure", async () => {
    mockFetchRawMessage.mockRejectedValue(new Error("Network error"));

    render(
      <RawMessageModal
        isOpen={true}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load message source: Network error/),
      ).toBeInTheDocument();
    });
  });

  it("shows copy button after content loads", async () => {
    mockFetchRawMessage.mockResolvedValue("raw content");

    render(
      <RawMessageModal
        isOpen={true}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });
  });

  it("copies content to clipboard on button click", async () => {
    const rawSource = "raw email content";
    mockFetchRawMessage.mockResolvedValue(rawSource);

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <RawMessageModal
        isOpen={true}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Copy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Copy"));

    expect(writeTextMock).toHaveBeenCalledWith(rawSource);
    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("does not render content when closed", () => {
    render(
      <RawMessageModal
        isOpen={false}
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    expect(screen.queryByText("Message Source")).not.toBeInTheDocument();
    expect(mockFetchRawMessage).not.toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    mockFetchRawMessage.mockResolvedValue("content");
    const onClose = vi.fn();

    render(
      <RawMessageModal
        isOpen={true}
        onClose={onClose}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("content")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("\u00d7"));

    expect(onClose).toHaveBeenCalled();
  });
});
