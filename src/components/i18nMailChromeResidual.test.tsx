import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { RouteLoadingFallback } from "@/router/routeTree";
import { AuthWarningBanner } from "@/components/email/AuthWarningBanner";
import { InlineAttachmentPreview } from "@/components/email/InlineAttachmentPreview";
import { SnoozeDialog } from "@/components/email/SnoozeDialog";
import { MessageItem } from "@/components/email/MessageItem";
import type { AuthResult } from "@/services/gmail/authParser";
import type { DbAttachment } from "@/services/db/attachments";
import type { DbMessage } from "@/services/db/messages";

vi.mock("@/App", () => ({
  default: () => null,
}));

vi.mock("@/components/layout/MailLayout", () => ({
  MailLayout: () => null,
}));

vi.mock("@/services/email/providerFactory", () => ({
  getEmailProvider: vi.fn(),
}));

vi.mock("@/components/email/EmailRenderer", () => ({
  EmailRenderer: () => <div data-testid="email-renderer" />,
}));

vi.mock("@/components/email/AttachmentList", () => ({
  AttachmentList: () => null,
  getAttachmentsForMessage: vi.fn(async () => []),
}));

vi.mock("@/components/email/AuthBadge", () => ({
  AuthBadge: () => null,
}));

function makeAuthResults(aggregate: AuthResult["aggregate"]): string {
  const result: AuthResult = {
    spf: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    dkim: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    dmarc: { result: aggregate === "pass" ? "pass" : "fail", detail: null },
    aggregate,
  };
  return JSON.stringify(result);
}

function attachment(overrides: Partial<DbAttachment> = {}): DbAttachment {
  return {
    id: "att-1",
    message_id: "msg-1",
    account_id: "account-1",
    filename: null,
    mime_type: "image/png",
    size: 1024,
    gmail_attachment_id: null,
    content_id: null,
    is_inline: 0,
    local_path: null,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "m1",
    account_id: "account-1",
    thread_id: "thread-1",
    from_address: null,
    from_name: null,
    to_addresses: "me@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Subject",
    snippet: "Snippet",
    date: 1_700_000_000,
    is_read: 0,
    is_starred: 0,
    body_html: "<p>Hello</p>",
    body_text: "Hello",
    body_cached: 1,
    raw_size: 100,
    internal_date: null,
    list_unsubscribe: "<https://example.com/unsubscribe>",
    list_unsubscribe_post: null,
    auth_results: null,
    message_id_header: null,
    references_header: null,
    in_reply_to_header: null,
    ...overrides,
  };
}

describe("mail chrome i18n residuals", () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    Object.defineProperty(globalThis, "IntersectionObserver", {
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-CN");
  });

  it("localizes route loading fallbacks", () => {
    render(
      <>
        <RouteLoadingFallback label="settings" />
        <RouteLoadingFallback label="calendar" />
        <RouteLoadingFallback label="help" />
        <RouteLoadingFallback label="attachments" />
        <RouteLoadingFallback label="tasks" />
      </>,
    );

    expect(screen.getByText("正在加载设置...")).toBeInTheDocument();
    expect(screen.getByText("正在加载日历...")).toBeInTheDocument();
    expect(screen.getByText("正在加载帮助...")).toBeInTheDocument();
    expect(screen.getByText("正在加载附件...")).toBeInTheDocument();
    expect(screen.getByText("正在加载任务...")).toBeInTheDocument();
  });

  it("localizes failed authentication warning chrome", () => {
    render(
      <AuthWarningBanner
        authResults={makeAuthResults("fail")}
        senderAddress={null}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("认证失败")).toBeInTheDocument();
    expect(screen.getByText(/此发件人/)).toBeInTheDocument();
    expect(screen.getByText(/谨慎处理其中的链接或附件/)).toBeInTheDocument();
    expect(screen.getByLabelText("关闭警告")).toBeInTheDocument();
  });

  it("localizes inline attachment preview fallbacks", () => {
    render(
      <InlineAttachmentPreview
        accountId="account-1"
        messageId="msg-1"
        attachments={[
          attachment(),
          attachment({ id: "att-2", mime_type: "application/pdf", size: 2048 }),
        ]}
        onAttachmentClick={vi.fn()}
      />,
    );

    expect(screen.getByText("图片")).toBeInTheDocument();
    expect(screen.getByTitle("图片")).toBeInTheDocument();
    expect(screen.getByText("文档.pdf")).toBeInTheDocument();
  });

  it("localizes snooze and custom date picker chrome", () => {
    render(<SnoozeDialog isOpen onSnooze={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("稍后提醒到...")).toBeInTheDocument();
    expect(screen.getByText("稍后")).toBeInTheDocument();
    expect(screen.getByText("明天")).toBeInTheDocument();
    expect(screen.getByText("本周末")).toBeInTheDocument();
    expect(screen.getByText("下周")).toBeInTheDocument();
    expect(screen.getByText("自定义日期和时间")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "稍后提醒" })).toBeInTheDocument();
  });

  it("localizes message item fallback, recipient, loading, and unsubscribe chrome", async () => {
    render(<MessageItem message={makeMessage()} isLast={true} blockImages={null} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "退订" })).toBeInTheDocument();
    });
    expect(screen.getByText("未知")).toBeInTheDocument();
    expect(screen.getByText("收件人：me@example.com")).toBeInTheDocument();
    expect(screen.getByText("正在加载...")).toBeInTheDocument();
  });
});
