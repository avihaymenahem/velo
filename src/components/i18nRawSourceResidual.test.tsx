import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { RawMessageModal } from "@/components/email/RawMessageModal";

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

import { getEmailProvider } from "@/services/email/providerFactory";

describe("raw message source i18n residuals", () => {
  const mockFetchRawMessage = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-CN");
    vi.mocked(getEmailProvider).mockResolvedValue({
      fetchRawMessage: mockFetchRawMessage,
    } as never);
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes loading chrome", () => {
    mockFetchRawMessage.mockReturnValue(new Promise(() => {}));

    render(
      <RawMessageModal
        isOpen
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    expect(screen.getByText("邮件源码")).toBeInTheDocument();
    expect(screen.getByText("正在加载邮件源码...")).toBeInTheDocument();
  });

  it("localizes copy chrome without translating raw source content", async () => {
    const rawSource = "From: test@example.com\r\nSubject: Hello\r\n\r\nBody text";
    mockFetchRawMessage.mockResolvedValue(rawSource);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(
      <RawMessageModal
        isOpen
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("复制")).toBeInTheDocument();
    });
    expect(screen.getByTitle("复制到剪贴板")).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toBe(rawSource);

    fireEvent.click(screen.getByText("复制"));

    expect(writeTextMock).toHaveBeenCalledWith(rawSource);
    expect(await screen.findByText("已复制")).toBeInTheDocument();
  });

  it("localizes error prefix while preserving provider error detail", async () => {
    mockFetchRawMessage.mockRejectedValue(new Error("Network error"));

    render(
      <RawMessageModal
        isOpen
        onClose={vi.fn()}
        messageId="msg-1"
        accountId="acc-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/邮件源码加载失败：Network error/)).toBeInTheDocument();
    });
  });
});
