import { render, screen, waitFor } from "@testing-library/react";
import { EmailRenderer } from "./EmailRenderer";
import type { DbAttachment } from "@/services/db/attachments";
import i18n from "@/i18n";

// Mock dependencies
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("@/utils/sanitize", () => ({
  sanitizeHtml: (html: string) => html,
  escapeHtml: (text: string) => text,
}));

vi.mock("@/services/db/imageAllowlist", () => ({
  addToAllowlist: vi.fn(),
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: (selector: (s: { theme: string }) => string) =>
    selector({ theme: "light" }),
}));

const mockFetchAttachment = vi.fn();

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn().mockResolvedValue({
    fetchAttachment: (...args: unknown[]) => mockFetchAttachment(...args),
  }),
}));

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function makeAttachment(overrides: Partial<DbAttachment> = {}): DbAttachment {
  return {
    id: "att-1",
    message_id: "msg-1",
    account_id: "acc-1",
    filename: "icon.png",
    mime_type: "image/png",
    size: 1024,
    gmail_attachment_id: "gmail-att-1",
    content_id: "icon@example.com",
    is_inline: 1,
    local_path: null,
    ...overrides,
  };
}

describe("EmailRenderer", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
  });

  it("renders plain text when no html provided", () => {
    const { container } = render(
      <EmailRenderer html={null} text="Hello world" />,
    );
    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("renders html content in iframe", () => {
    const { container } = render(
      <EmailRenderer html="<p>Hello</p>" text={null} />,
    );
    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("resolves cid: references by fetching inline attachment data", async () => {
    const base64Data = btoa("fake-image-data");
    mockFetchAttachment.mockResolvedValue({ data: base64Data, size: 100 });

    const inlineAttachments = [makeAttachment()];

    const { container } = render(
      <EmailRenderer
        html='<img src="cid:icon@example.com" />'
        text={null}
        accountId="acc-1"
        messageId="msg-1"
        inlineAttachments={inlineAttachments}
      />,
    );

    await waitFor(() => {
      expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "gmail-att-1");
    });

    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("skips cid resolution when no inline attachments", () => {
    render(
      <EmailRenderer
        html='<img src="cid:missing@example.com" />'
        text={null}
        accountId="acc-1"
        messageId="msg-1"
        inlineAttachments={[]}
      />,
    );

    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });

  it("skips cid resolution when accountId or messageId missing", () => {
    const inlineAttachments = [makeAttachment()];

    render(
      <EmailRenderer
        html='<img src="cid:icon@example.com" />'
        text={null}
        inlineAttachments={inlineAttachments}
      />,
    );

    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });

  it("handles fetch failure gracefully", async () => {
    mockFetchAttachment.mockRejectedValue(new Error("Network error"));

    const inlineAttachments = [makeAttachment()];

    const { container } = render(
      <EmailRenderer
        html='<img src="cid:icon@example.com" />'
        text={null}
        accountId="acc-1"
        messageId="msg-1"
        inlineAttachments={inlineAttachments}
      />,
    );

    await waitFor(() => {
      expect(mockFetchAttachment).toHaveBeenCalled();
    });

    expect(container.querySelector("iframe")).toBeTruthy();
  });

  it("resolves multiple cid references", async () => {
    mockFetchAttachment
      .mockResolvedValueOnce({ data: btoa("img1"), size: 50 })
      .mockResolvedValueOnce({ data: btoa("img2"), size: 60 });

    const inlineAttachments = [
      makeAttachment({ id: "att-1", content_id: "img1@ex.com", gmail_attachment_id: "g1" }),
      makeAttachment({ id: "att-2", content_id: "img2@ex.com", gmail_attachment_id: "g2", mime_type: "image/jpeg" }),
    ];

    render(
      <EmailRenderer
        html='<img src="cid:img1@ex.com" /><img src="cid:img2@ex.com" />'
        text={null}
        accountId="acc-1"
        messageId="msg-1"
        inlineAttachments={inlineAttachments}
      />,
    );

    await waitFor(() => {
      expect(mockFetchAttachment).toHaveBeenCalledTimes(2);
      expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "g1");
      expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "g2");
    });
  });

  it("ignores attachments without content_id or gmail_attachment_id", () => {
    const inlineAttachments = [
      makeAttachment({ content_id: null }),
      makeAttachment({ id: "att-2", gmail_attachment_id: null }),
    ];

    render(
      <EmailRenderer
        html='<img src="cid:icon@example.com" />'
        text={null}
        accountId="acc-1"
        messageId="msg-1"
        inlineAttachments={inlineAttachments}
      />,
    );

    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });

  it("localizes the email body frame and blocked image privacy controls", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <EmailRenderer
        html='<p>Hello</p><img src="https://example.com/pixel.png" />'
        text={null}
        blockImages
        senderAddress="sender@example.com"
        accountId="acc-1"
      />,
    );

    expect(screen.getByTitle("邮件正文")).toBeInTheDocument();
    expect(screen.getByText("已隐藏远程图片以保护你的隐私。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载图片" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "始终加载此发件人的图片" })).toBeInTheDocument();
    expect(screen.queryByTitle("Email content")).not.toBeInTheDocument();
    expect(screen.queryByText("Images hidden to protect your privacy.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load images" })).not.toBeInTheDocument();
  });
});
