import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { InlineReply } from "./InlineReply";
import { useAccountStore } from "@/stores/accountStore";
import type { DbMessage } from "@/services/db/messages";
import type { Thread } from "@/stores/threadStore";

vi.mock("@/services/db/signatures", () => ({
  getDefaultSignature: vi.fn(async () => null),
}));

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(async () => "5"),
}));

vi.mock("@/services/db/contacts", () => ({
  upsertContact: vi.fn(async () => undefined),
}));

vi.mock("@/services/emailActions", () => ({
  sendEmail: vi.fn(async () => undefined),
  archiveThread: vi.fn(async () => undefined),
}));

vi.mock("@/services/ai/writingStyleService", () => ({
  isAutoDraftEnabled: vi.fn(async () => false),
  generateAutoDraft: vi.fn(async () => null),
  regenerateAutoDraft: vi.fn(async () => null),
}));

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    accountId: "account-1",
    subject: "Subject",
    snippet: "Snippet",
    lastMessageAt: 1_700_000_000,
    messageCount: 1,
    isRead: true,
    isStarred: false,
    isPinned: false,
    isMuted: false,
    hasAttachments: false,
    labelIds: ["INBOX"],
    fromName: "Sender",
    fromAddress: "sender@example.com",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "msg-1",
    account_id: "account-1",
    thread_id: "thread-1",
    from_address: "sender@example.com",
    from_name: "Sender",
    to_addresses: "me@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Subject",
    snippet: "Snippet",
    date: 1_700_000_000,
    is_read: 1,
    is_starred: 0,
    body_html: "<p>Hello</p>",
    body_text: "Hello",
    body_cached: 1,
    raw_size: 100,
    internal_date: null,
    list_unsubscribe: null,
    list_unsubscribe_post: null,
    auth_results: null,
    message_id_header: null,
    references_header: null,
    in_reply_to_header: null,
    ...overrides,
  };
}

describe("InlineReply", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    await i18n.changeLanguage("en");
    useAccountStore.setState({
      accounts: [{
        id: "account-1",
        email: "me@example.com",
        displayName: "Me",
        avatarUrl: null,
        isActive: true,
      }],
      activeAccountId: "account-1",
    });
  });

  it("localizes inline reply chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <InlineReply
        thread={makeThread()}
        messages={[makeMessage()]}
        accountId="account-1"
        onSent={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "回复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部回复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转发" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply All" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回复" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    });
    expect(screen.getByText("收件人：sender@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开" })).toBeInTheDocument();
    expect(screen.getByTitle("展开到完整写信窗口")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "回复" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByText("to sender@example.com")).not.toBeInTheDocument();
  });

  it("localizes no-reply tooltip in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <InlineReply
        thread={makeThread()}
        messages={[makeMessage()]}
        accountId="account-1"
        noReply
        onSent={vi.fn()}
      />,
    );

    expect(screen.getAllByTitle("此发件人不接收回复")).toHaveLength(2);
    expect(screen.queryByTitle("This sender does not accept replies")).not.toBeInTheDocument();
  });
});
