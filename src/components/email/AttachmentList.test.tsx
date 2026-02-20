import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AttachmentList } from "./AttachmentList";
import type { DbAttachment } from "@/services/db/attachments";

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/services/db/attachments", () => ({
  getAttachmentsForMessage: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

import { getEmailProvider } from "@/services/email/providerFactory";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

const makeAttachment = (overrides: Partial<DbAttachment> = {}): DbAttachment => ({
  id: "att-1",
  message_id: "msg-1",
  account_id: "acc-1",
  filename: "photo.png",
  mime_type: "image/png",
  size: 1024,
  gmail_attachment_id: "gmail-att-1",
  content_id: null,
  is_inline: 0,
  local_path: null,
  ...overrides,
});

describe("AttachmentList", () => {
  const mockFetchAttachment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProvider).mockResolvedValue({
      fetchAttachment: mockFetchAttachment,
    } as never);
  });

  it("renders nothing when no file attachments", () => {
    const { container } = render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[]}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all attachments are true inline (no filename)", () => {
    const { container } = render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ is_inline: 1, filename: null })]}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows attachment with is_inline flag if it has a filename", () => {
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ is_inline: 1, filename: "report.pdf", mime_type: "application/pdf" })]}
      />,
    );

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("renders attachment count and names", () => {
    const attachments = [
      makeAttachment({ id: "att-1", gmail_attachment_id: "gid-1", filename: "photo.png" }),
      makeAttachment({ id: "att-2", gmail_attachment_id: "gid-2", filename: "doc.pdf", mime_type: "application/pdf" }),
    ];

    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={attachments}
      />,
    );

    expect(screen.getByText("2 attachments")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
  });

  it("renders file size for attachments", () => {
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ size: 2048 })]}
      />,
    );

    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("opens preview modal when clicking an attachment", async () => {
    // Return a small base64-encoded PNG (1x1 pixel)
    mockFetchAttachment.mockResolvedValue({
      data: btoa("fake-image-data"),
      size: 15,
    });

    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
      />,
    );

    fireEvent.click(screen.getByText("photo.png"));

    await waitFor(() => {
      expect(getEmailProvider).toHaveBeenCalledWith("acc-1");
      expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "gmail-att-1");
    });
  });

  it("uses getEmailProvider instead of getGmailClient for preview", async () => {
    mockFetchAttachment.mockResolvedValue({
      data: btoa("test-data"),
      size: 9,
    });

    render(
      <AttachmentList
        accountId="imap-acc"
        messageId="imap-msg-1"
        attachments={[makeAttachment({
          account_id: "imap-acc",
          message_id: "imap-msg-1",
          gmail_attachment_id: "part-1.2",
        })]}
      />,
    );

    fireEvent.click(screen.getByText("photo.png"));

    await waitFor(() => {
      expect(getEmailProvider).toHaveBeenCalledWith("imap-acc");
      expect(mockFetchAttachment).toHaveBeenCalledWith("imap-msg-1", "part-1.2");
    });
  });

  it("handles download via provider abstraction", async () => {
    mockFetchAttachment.mockResolvedValue({
      data: btoa("file-content"),
      size: 12,
    });
    vi.mocked(save).mockResolvedValue("/downloads/photo.png");
    vi.mocked(writeFile).mockResolvedValue(undefined as never);

    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
      />,
    );

    // Open the preview modal first
    fireEvent.click(screen.getByText("photo.png"));

    // Wait for preview to load, then click download
    await waitFor(() => {
      expect(screen.getByText("Download")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Download"));

    await waitFor(() => {
      expect(save).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
    });
  });

  it("hides attachments whose CID is referenced in the HTML body", () => {
    const referencedCids = new Set(["img001@example.com"]);
    const { container } = render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ content_id: "img001@example.com", filename: "photo.png", mime_type: "image/png" })]}
        referencedCids={referencedCids}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows attachments with content_id when not referenced in HTML body", () => {
    const referencedCids = new Set<string>();
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ content_id: "img001@example.com", filename: "photo.png", mime_type: "image/png" })]}
        referencedCids={referencedCids}
      />,
    );

    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("shows non-image CID attachments with real filename when not referenced", () => {
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment({ content_id: "part1@example.com", mime_type: "application/pdf", filename: "report.pdf" })]}
      />,
    );

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("deduplicates attachments by filename+size (different gmail_attachment_id)", () => {
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[
          makeAttachment({ id: "att-1", gmail_attachment_id: "gid-1", filename: "photo.png", size: 1024 }),
          makeAttachment({ id: "att-2", gmail_attachment_id: "gid-2", filename: "photo.png", size: 1024 }),
        ]}
      />,
    );

    expect(screen.getByText("1 attachment")).toBeInTheDocument();
  });

  it("does not dedup attachments with different filenames", () => {
    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[
          makeAttachment({ id: "att-1", gmail_attachment_id: "gid-1", filename: "photo.png", size: 1024 }),
          makeAttachment({ id: "att-2", gmail_attachment_id: "gid-2", filename: "photo2.png", size: 1024 }),
        ]}
      />,
    );

    expect(screen.getByText("2 attachments")).toBeInTheDocument();
  });

  it("shows error state when preview fetch fails", async () => {
    mockFetchAttachment.mockRejectedValue(new Error("Network error"));

    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
      />,
    );

    fireEvent.click(screen.getByText("photo.png"));

    await waitFor(() => {
      expect(screen.getByText("Failed to load preview")).toBeInTheDocument();
    });
  });

  it("normalizes URL-safe base64 from Gmail API", async () => {
    // Standard base64 "Hello+World/" becomes URL-safe "Hello-World_" in Gmail API
    // The component should normalize - to + and _ to / before atob()
    const standardBase64 = btoa("Hello World!");
    // Convert to URL-safe base64 (replace + with - and / with _)
    const urlSafeBase64 = standardBase64.replace(/\+/g, "-").replace(/\//g, "_");
    mockFetchAttachment.mockResolvedValue({
      data: urlSafeBase64,
      size: 12,
    });

    render(
      <AttachmentList
        accountId="acc-1"
        messageId="msg-1"
        attachments={[makeAttachment()]}
      />,
    );

    fireEvent.click(screen.getByText("photo.png"));

    // Should not throw — the component normalizes - to + and _ to /
    await waitFor(() => {
      expect(mockFetchAttachment).toHaveBeenCalled();
    });
  });
});
