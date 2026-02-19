import { render, screen, waitFor } from "@testing-library/react";
import { InlineAttachmentPreview } from "./InlineAttachmentPreview";
import type { DbAttachment } from "@/services/db/attachments";

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

import { getEmailProvider } from "@/services/email/providerFactory";

// Mock IntersectionObserver to trigger immediately
beforeAll(() => {
  class MockIntersectionObserver {
    constructor(callback: IntersectionObserverCallback) {
      // Trigger immediately with isIntersecting: true
      setTimeout(() => {
        callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }, 0);
    }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }
  window.IntersectionObserver = MockIntersectionObserver as never;
});

const makeAttachment = (overrides: Partial<DbAttachment> = {}): DbAttachment => ({
  id: "att-1",
  message_id: "msg-1",
  account_id: "acc-1",
  filename: "photo.png",
  mime_type: "image/png",
  size: 2048,
  gmail_attachment_id: "gmail-att-1",
  content_id: null,
  is_inline: 0,
  local_path: null,
  ...overrides,
});

describe("InlineAttachmentPreview", () => {
  const mockFetchAttachment = vi.fn();
  const onAttachmentClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProvider).mockResolvedValue({
      fetchAttachment: mockFetchAttachment,
    } as never);
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("renders nothing when no previewable attachments", () => {
    const { container } = render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ mime_type: "application/zip", filename: "archive.zip" })]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all attachments are inline", () => {
    const { container } = render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ is_inline: 1 })]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders image thumbnails for image attachments", () => {
    render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    // Should have an image button (thumbnail container)
    expect(screen.getByTitle("photo.png")).toBeInTheDocument();
  });

  it("renders PDF cards for PDF attachments", () => {
    render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({
          mime_type: "application/pdf",
          filename: "report.pdf",
        })]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("uses getEmailProvider for thumbnail loading", async () => {
    mockFetchAttachment.mockResolvedValue({
      data: btoa("fake-image-bytes"),
      size: 15,
    });

    render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    await waitFor(() => {
      expect(getEmailProvider).toHaveBeenCalledWith("acc-1");
      expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "gmail-att-1");
    });
  });

  it("works with IMAP account attachments", async () => {
    mockFetchAttachment.mockResolvedValue({
      data: btoa("imap-image-data"),
      size: 14,
    });

    render(
      <InlineAttachmentPreview
        accountId="imap-acc"
        messageId="imap-inbox-42"
        attachments={[makeAttachment({
          account_id: "imap-acc",
          message_id: "imap-inbox-42",
          gmail_attachment_id: "1.2",
        })]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    await waitFor(() => {
      expect(getEmailProvider).toHaveBeenCalledWith("imap-acc");
      expect(mockFetchAttachment).toHaveBeenCalledWith("imap-inbox-42", "1.2");
    });
  });

  it("calls onAttachmentClick when image thumbnail is clicked", async () => {
    mockFetchAttachment.mockResolvedValue({
      data: btoa("image-data"),
      size: 10,
    });

    const att = makeAttachment();

    render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[att]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    await waitFor(() => {
      const thumbnail = screen.getByTitle("photo.png");
      thumbnail.click();
    });

    expect(onAttachmentClick).toHaveBeenCalledWith(att);
  });

  it("calls onAttachmentClick when PDF card is clicked", () => {
    const att = makeAttachment({
      mime_type: "application/pdf",
      filename: "report.pdf",
    });

    render(
      <InlineAttachmentPreview
        accountId="acc-1"
        messageId="msg-1"
        attachments={[att]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    screen.getByText("report.pdf").click();

    expect(onAttachmentClick).toHaveBeenCalledWith(att);
  });
});
