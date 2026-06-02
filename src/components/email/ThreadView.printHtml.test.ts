import i18n from "@/i18n";
import type { DbMessage } from "@/services/db/messages";
import { buildThreadPrintHtml } from "./ThreadView";

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    account_id: "acc-1",
    gmail_id: "gmail-1",
    subject: null,
    from_address: null,
    from_name: null,
    to_addresses: "founder@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    date: Date.UTC(2026, 5, 2),
    body_text: "Plain body",
    body_html: null,
    snippet: "Plain body",
    is_read: 1,
    is_starred: 0,
    is_important: 0,
    is_draft: 0,
    is_sent: 0,
    is_trash: 0,
    is_spam: 0,
    labels: "[]",
    attachments: "[]",
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe("buildThreadPrintHtml", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("localizes generated print chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "email");

    const html = buildThreadPrintHtml({
      subject: null,
      messages: [makeMessage()],
      t,
      language: "zh-CN",
    });

    expect(html).toContain("<title>邮件</title>");
    expect(html).toContain("<h1>（无主题）</h1>");
    expect(html).toContain("<strong>发件人：</strong> 未知<br/>");
    expect(html).toContain("<strong>收件人：</strong> founder@example.com<br/>");
    expect(html).toContain("<strong>日期：</strong>");
    expect(html).not.toContain("<strong>From:</strong>");
    expect(html).not.toContain("<strong>To:</strong>");
    expect(html).not.toContain("<strong>Date:</strong>");
    expect(html).not.toContain("Unknown");
  });

  it("keeps English generated print chrome by default", () => {
    const t = i18n.getFixedT("en", "email");

    const html = buildThreadPrintHtml({
      subject: "Investor update",
      messages: [makeMessage({ from_address: "alice@example.com" })],
      t,
      language: "en",
    });

    expect(html).toContain("<title>Investor update</title>");
    expect(html).toContain("<h1>Investor update</h1>");
    expect(html).toContain("<strong>From:</strong> alice@example.com<br/>");
    expect(html).toContain("<strong>To:</strong> founder@example.com<br/>");
    expect(html).toContain("<strong>Date:</strong>");
  });
});
