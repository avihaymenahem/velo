import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useComposerStore } from "@/stores/composerStore";
import { ContactSidebar } from "@/components/email/ContactSidebar";
import { AttachmentList } from "@/components/email/AttachmentList";
import { LinkConfirmDialog } from "@/components/email/LinkConfirmDialog";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { AttachmentPicker } from "@/components/composer/AttachmentPicker";
import { SignatureSelector } from "@/components/composer/SignatureSelector";
import { UndoSendToast } from "@/components/composer/UndoSendToast";
import type { DbAttachment } from "@/services/db/attachments";
import type { DbContact } from "@/services/db/contacts";

vi.mock("@/services/db/contacts", () => ({
  getContactByEmail: vi.fn(),
  getContactStats: vi.fn(),
  getRecentThreadsWithContact: vi.fn(),
  upsertContact: vi.fn(() => Promise.resolve()),
  updateContact: vi.fn(() => Promise.resolve()),
  updateContactNotes: vi.fn(() => Promise.resolve()),
  getAttachmentsFromContact: vi.fn(),
  getContactsFromSameDomain: vi.fn(),
  getLatestAuthResult: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/services/db/notificationVips", () => ({
  isVipSender: vi.fn(() => Promise.resolve(false)),
  addVipSender: vi.fn(() => Promise.resolve()),
  removeVipSender: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/contacts/gravatar", () => ({
  fetchAndCacheGravatarUrl: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/services/db/threads", () => ({
  getThreadById: vi.fn(),
  getThreadLabelIds: vi.fn(),
}));

vi.mock("@/router/navigate", () => ({
  navigateToThread: vi.fn(),
}));

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
  BaseDirectory: { AppData: "AppData" },
  exists: vi.fn(() => Promise.resolve(false)),
  mkdir: vi.fn(() => Promise.resolve()),
  readTextFile: vi.fn(() => Promise.resolve("")),
  writeTextFile: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(),
}));

vi.mock("@/services/db/signatures", () => ({
  getSignaturesForAccount: vi.fn(),
}));

import {
  getContactByEmail,
  getContactStats,
  getRecentThreadsWithContact,
  getAttachmentsFromContact,
  getContactsFromSameDomain,
} from "@/services/db/contacts";
import { getSignaturesForAccount } from "@/services/db/signatures";

const contact: DbContact = {
  id: "contact-1",
  email: "alice@company.com",
  display_name: "Alice",
  avatar_url: null,
  frequency: 3,
  last_contacted_at: 1700000000000,
  notes: "Important client",
};

const attachment = (overrides: Partial<DbAttachment> = {}): DbAttachment => ({
  id: "att-1",
  message_id: "msg-1",
  account_id: "account-1",
  filename: "archive.zip",
  mime_type: "application/zip",
  size: 1024,
  gmail_attachment_id: "part-1",
  content_id: null,
  is_inline: 0,
  local_path: null,
  ...overrides,
});

function ThrowingComponent() {
  throw new Error("测试错误");
}

describe("i18n high-frequency chrome residuals", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-CN");
    useAccountStore.setState({ activeAccountId: "account-1" });
    useComposerStore.setState({
      isOpen: true,
      attachments: [],
      signatureId: null,
      undoSendVisible: false,
      undoSendTimer: null,
    });
    vi.mocked(getContactByEmail).mockResolvedValue(null);
    vi.mocked(getContactStats).mockResolvedValue({
      emailCount: 2,
      firstEmail: 1700000000000,
      lastEmail: 1700100000000,
    });
    vi.mocked(getRecentThreadsWithContact).mockResolvedValue([]);
    vi.mocked(getAttachmentsFromContact).mockResolvedValue([]);
    vi.mocked(getContactsFromSameDomain).mockResolvedValue([]);
    vi.mocked(getSignaturesForAccount).mockResolvedValue([]);
  });

  it("localizes contact sidebar chrome", async () => {
    vi.mocked(getContactByEmail).mockResolvedValue(contact);
    vi.mocked(getAttachmentsFromContact).mockResolvedValue([
      { filename: "report.pdf", mime_type: "application/pdf", size: 2048, date: 1700200000000 },
    ]);
    vi.mocked(getContactsFromSameDomain).mockResolvedValue([
      { email: "bob@company.com", display_name: "Bob", avatar_url: null },
    ]);
    vi.mocked(getRecentThreadsWithContact).mockResolvedValue([
      { thread_id: "thread-1", subject: null, last_message_at: 1700300000000 },
    ]);

    render(<ContactSidebar email="alice@company.com" name="Alice" accountId="account-1" onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTitle("发送邮件")).toBeInTheDocument();
      expect(screen.getByTitle("复制邮箱")).toBeInTheDocument();
      expect(screen.getByTitle("标记为 VIP")).toBeInTheDocument();
      expect(screen.getByText("编辑姓名")).toBeInTheDocument();
      expect(screen.getByText("2 封邮件")).toBeInTheDocument();
      expect(screen.getByText(/^第一封邮件：/)).toBeInTheDocument();
      expect(screen.getByText(/^最近邮件：/)).toBeInTheDocument();
      expect(screen.getByText("备注")).toBeInTheDocument();
      expect(screen.getByText("共享文件")).toBeInTheDocument();
      expect(screen.getByText("同域联系人 @company.com")).toBeInTheDocument();
      expect(screen.getByText("最近会话")).toBeInTheDocument();
      expect(screen.getByText("（无主题）")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("备注"));
    expect(screen.getByPlaceholderText("添加备注...")).toBeInTheDocument();
  });

  it("localizes attachment list and preview chrome", async () => {
    render(
      <AttachmentList
        accountId="account-1"
        messageId="msg-1"
        attachments={[attachment({ filename: null, mime_type: null })]}
      />,
    );

    expect(screen.getByText("1 个附件")).toBeInTheDocument();
    expect(screen.getByText("未命名")).toBeInTheDocument();

    fireEvent.click(screen.getByText("未命名"));

    expect(await screen.findByText("下载")).toBeInTheDocument();
    expect(screen.getByText("此文件类型不可预览")).toBeInTheDocument();
    expect(screen.getByText("未知类型")).toBeInTheDocument();
  });

  it("localizes suspicious link confirmation chrome", () => {
    render(
      <LinkConfirmDialog
        linkAnalysis={{
          url: "https://example.com",
          displayText: "Open",
          riskLevel: "high",
          score: 80,
          triggeredRules: [
            { ruleId: "r1", name: "Suspicious path", detail: "Path looks suspicious", score: 50 },
          ],
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("高风险链接")).toBeInTheDocument();
    expect(screen.getByText("完整 URL")).toBeInTheDocument();
    expect(screen.getByText("链接文本")).toBeInTheDocument();
    expect(screen.getByText("检测到的问题（1）")).toBeInTheDocument();
    expect(screen.getByText("(50 分)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "仍然打开" })).toBeInTheDocument();
  });

  it("localizes default error boundary chrome", () => {
    const originalError = console.error;
    console.error = vi.fn();
    try {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>,
      );

      expect(screen.getByText("出了点问题")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    } finally {
      console.error = originalError;
    }
  });

  it("localizes composer attachment, signature, and undo-send chrome", async () => {
    vi.mocked(getSignaturesForAccount).mockResolvedValue([
      {
        id: "sig-1",
        account_id: "account-1",
        name: "Work",
        body_html: "<p>Work</p>",
        is_default: 0,
        created_at: 1700000000000,
        updated_at: 1700000000000,
      },
    ]);
    useComposerStore.setState({
      attachments: [{
        id: "composer-att-1",
        file: new File(["hello"], "hello.txt", { type: "text/plain" }),
        filename: "hello.txt",
        mimeType: "text/plain",
        size: 5,
        content: "aGVsbG8=",
      }],
      undoSendVisible: true,
    });

    render(
      <>
        <AttachmentPicker />
        <SignatureSelector />
        <UndoSendToast />
      </>,
    );

    expect(screen.getByTitle("添加附件")).toBeInTheDocument();
    expect(screen.getByText("添加附件")).toBeInTheDocument();
    expect(screen.getByText(/总计$/)).toBeInTheDocument();
    expect(screen.getByText("正在发送邮件...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();

    expect(await screen.findByRole("option", { name: "无签名" })).toBeInTheDocument();
  });
});
