import { render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { OfflineBanner } from "./ui/OfflineBanner";
import { ThreadSummary } from "./email/ThreadSummary";
import { SmartReplySuggestions } from "./email/SmartReplySuggestions";
import { AskInbox } from "./search/AskInbox";
import { AiAssistPanel } from "./composer/AiAssistPanel";
import { AiTaskExtractDialog } from "./tasks/AiTaskExtractDialog";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import type { DbMessage } from "@/services/db/messages";

vi.mock("@/services/ai/providerManager", () => ({
  isAiAvailable: vi.fn(async () => true),
}));

vi.mock("@/services/ai/aiService", () => ({
  summarizeThread: vi.fn(async () => "摘要内容"),
  generateSmartReplies: vi.fn(async () => ["我会处理"]),
  composeFromPrompt: vi.fn(async () => "<p>草稿</p>"),
  generateReply: vi.fn(async () => "<p>回复</p>"),
  transformText: vi.fn(async () => "<p>改写</p>"),
}));

vi.mock("@/services/db/aiCache", () => ({
  deleteAiCache: vi.fn(async () => undefined),
}));

vi.mock("@/services/ai/askInbox", () => ({
  askMyInbox: vi.fn(async () => ({
    answer: "回答内容",
    sourceMessages: [],
  })),
}));

vi.mock("@/services/ai/taskExtraction", () => ({
  extractTask: vi.fn(async () => ({
    title: "跟进客户",
    description: "确认下一步",
    priority: "medium",
    dueDate: null,
  })),
}));

vi.mock("@/services/db/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/services/db/tasks")>("@/services/db/tasks");
  return {
    ...actual,
    insertTask: vi.fn(async () => "task-1"),
    getIncompleteTaskCount: vi.fn(async () => 1),
  };
});

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "m1",
    thread_id: "thread-1",
    account_id: "account-1",
    gmail_id: "gmail-1",
    subject: "Subject",
    from_address: "sender@example.com",
    from_name: "Sender",
    to_addresses: "me@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    date: 1_700_000_000,
    body_text: "Body",
    body_html: null,
    snippet: "Body",
    is_read: 0,
    is_starred: 0,
    is_important: 0,
    is_draft: 0,
    is_sent: 0,
    is_trash: 0,
    is_spam: 0,
    labels: "[]",
    attachments: "[]",
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
    ...overrides,
  };
}

describe("residual i18n coverage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    useUIStore.setState({ isOnline: true });
    useAccountStore.setState({ activeAccountId: "account-1" });
  });

  it("localizes offline banner in Simplified Chinese", () => {
    useUIStore.setState({ isOnline: false });

    render(<OfflineBanner />);

    expect(screen.getByText("你已离线，变更会在重新连接后同步")).toBeInTheDocument();
  });

  it("localizes thread briefing and smart reply chrome", async () => {
    const messages = [
      makeMessage({ id: "m1" }),
      makeMessage({ id: "m2", gmail_id: "gmail-2" }),
    ];

    render(
      <>
        <ThreadSummary threadId="thread-1" accountId="account-1" messages={messages} />
        <SmartReplySuggestions threadId="thread-1" accountId="account-1" messages={messages} />
      </>,
    );

    expect(await screen.findByText("线程简报")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTitle("刷新简报")).toBeInTheDocument();
    });
    expect(await screen.findByText("快捷回复")).toBeInTheDocument();
    expect(screen.getByTitle("刷新建议")).toBeInTheDocument();
  });

  it("localizes Ask Inbox chrome and empty state", () => {
    render(<AskInbox isOpen onClose={vi.fn()} />);

    expect(screen.getByText("Ask Inbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("询问你的邮件...")).toBeInTheDocument();
    expect(screen.getByText("可以询问邮件中的会议、对话、附件等内容。")).toBeInTheDocument();
  });

  it("localizes composer AI assist chrome", async () => {
    render(<AiAssistPanel editor={null} isReplyMode={false} />);

    expect(await screen.findByText("AI 辅助")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("描述你想写什么...")).toBeInTheDocument();
    expect(screen.getByText("生成")).toBeInTheDocument();
    expect(screen.getByText("转换：")).toBeInTheDocument();
    expect(screen.getByText("改进")).toBeInTheDocument();
    expect(screen.getByText("更短")).toBeInTheDocument();
    expect(screen.getByText("正式")).toBeInTheDocument();
  });

  it("localizes AI task extraction dialog", async () => {
    render(
      <AiTaskExtractDialog
        threadId="thread-1"
        accountId="account-1"
        messages={[makeMessage()]}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("从邮件创建任务")).toBeInTheDocument();
    expect(screen.getByText("正在从邮件中提取任务...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("标题")).toHaveValue("跟进客户");
    });
    expect(screen.getByLabelText("描述")).toHaveValue("确认下一步");
    expect(screen.getByLabelText("优先级")).toBeInTheDocument();
    expect(screen.getByLabelText("截止日期")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建任务" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });
});
