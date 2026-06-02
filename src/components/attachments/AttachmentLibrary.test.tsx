import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentLibrary } from "./AttachmentLibrary";
import type { AttachmentWithContext, AttachmentSender } from "@/services/db/attachments";
import i18n from "@/i18n";

// Mock dependencies
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: vi.fn((selector: (s: { accounts: { id: string; isActive: boolean }[] }) => unknown) =>
    selector({ accounts: [{ id: "acc-1", isActive: true }] }),
  ),
}));

vi.mock("@/services/db/attachments", () => ({
  getAttachmentsForAccount: vi.fn(() => Promise.resolve([])),
  getAttachmentSenders: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/components/email/AttachmentList", () => ({
  AttachmentPreview: vi.fn(() => null),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
}));

vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
}));

import { getAttachmentsForAccount, getAttachmentSenders } from "@/services/db/attachments";

const mockAttachments: AttachmentWithContext[] = [
  {
    id: "att-1",
    message_id: "msg-1",
    account_id: "acc-1",
    filename: "report.pdf",
    mime_type: "application/pdf",
    size: 2_000_000,
    gmail_attachment_id: "gid-1",
    content_id: null,
    is_inline: 0,
    local_path: null,
    from_address: "alice@example.com",
    from_name: "Alice",
    date: Date.now() - 3600000,
    subject: "Q4 Report",
    thread_id: "thread-1",
  },
  {
    id: "att-2",
    message_id: "msg-2",
    account_id: "acc-1",
    filename: "photo.png",
    mime_type: "image/png",
    size: 500_000,
    gmail_attachment_id: "gid-2",
    content_id: null,
    is_inline: 0,
    local_path: null,
    from_address: "bob@example.com",
    from_name: "Bob",
    date: Date.now() - 86400000,
    subject: "Photos",
    thread_id: "thread-2",
  },
];

const mockSenders: AttachmentSender[] = [
  { from_address: "alice@example.com", from_name: "Alice", count: 3 },
  { from_address: "bob@example.com", from_name: "Bob", count: 1 },
];

describe("AttachmentLibrary", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders empty state when no attachments", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue([]);
    vi.mocked(getAttachmentSenders).mockResolvedValue([]);

    render(<AttachmentLibrary />);

    expect(await screen.findByText("No attachments yet")).toBeInTheDocument();
  });

  it("renders attachments in grid view", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue(mockAttachments);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);

    expect(await screen.findByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("switches to list view", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue(mockAttachments);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);
    await screen.findByText("report.pdf");

    fireEvent.click(screen.getByTitle("List view"));

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("filters by search query", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue(mockAttachments);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);
    await screen.findByText("report.pdf");

    fireEvent.change(screen.getByPlaceholderText("Search attachments..."), {
      target: { value: "report" },
    });

    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.queryByText("photo.png")).not.toBeInTheDocument();
  });

  it("filters by type", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue(mockAttachments);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);
    await screen.findByText("report.pdf");

    // Select "Images" type filter
    const typeSelect = screen.getByDisplayValue("All types");
    fireEvent.change(typeSelect, { target: { value: "images" } });

    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("photo.png")).toBeInTheDocument();
  });

  it("shows correct count", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue(mockAttachments);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);
    await screen.findByText("report.pdf");

    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("renders header with title", async () => {
    vi.mocked(getAttachmentsForAccount).mockResolvedValue([]);
    vi.mocked(getAttachmentSenders).mockResolvedValue([]);

    render(<AttachmentLibrary />);

    expect(await screen.findByText("Attachments")).toBeInTheDocument();
  });

  it("renders library chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(getAttachmentsForAccount).mockResolvedValue([]);
    vi.mocked(getAttachmentSenders).mockResolvedValue([]);

    render(<AttachmentLibrary />);

    expect(await screen.findByText("附件")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索附件...")).toBeInTheDocument();
  });

  it("renders grid relative dates in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const now = new Date("2026-06-02T12:00:00Z").getTime();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now);
    vi.mocked(getAttachmentsForAccount).mockResolvedValue([
      {
        ...mockAttachments[0],
        date: new Date("2026-06-02T11:00:00Z").getTime(),
      },
    ]);
    vi.mocked(getAttachmentSenders).mockResolvedValue(mockSenders);

    render(<AttachmentLibrary />);

    try {
      expect(await screen.findByText("report.pdf")).toBeInTheDocument();
      expect(screen.getByText("1小时前")).toBeInTheDocument();
      expect(screen.queryByText("1h ago")).not.toBeInTheDocument();
    } finally {
      dateNow.mockRestore();
    }
  });
});
