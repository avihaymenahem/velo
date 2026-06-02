import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { QuickStepEditor } from "@/components/settings/QuickStepEditor";
import { ContextMenuPortal } from "@/components/ui/ContextMenuPortal";
import { useAccountStore } from "@/stores/accountStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useLabelStore } from "@/stores/labelStore";
import { useThreadStore, type Thread } from "@/stores/threadStore";

vi.mock("@/components/ui/ContextMenu", () => {
  const renderItems = (items: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }>) => (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.children ? renderItems(item.children) : null}
        </li>
      ))}
    </ul>
  );

  return {
    ContextMenu: ({ items }: { items: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }> }) => (
      <nav>{renderItems(items)}</nav>
    ),
  };
});

const defaultQuickSteps = [
  {
    id: "qs-reply-archive",
    account_id: "account-1",
    name: "Reply & Archive",
    description: null,
    shortcut: null,
    actions_json: JSON.stringify([{ type: "reply" }, { type: "archive" }]),
    icon: "Reply",
    is_enabled: 1,
    continue_on_error: 0,
    sort_order: 0,
    created_at: 1,
  },
  {
    id: "qs-mark-read-archive",
    account_id: "account-1",
    name: "Mark Read & Archive",
    description: null,
    shortcut: null,
    actions_json: JSON.stringify([{ type: "markRead" }, { type: "archive" }]),
    icon: "MailOpen",
    is_enabled: 1,
    continue_on_error: 0,
    sort_order: 1,
    created_at: 2,
  },
  {
    id: "qs-star-pin",
    account_id: "account-1",
    name: "Star & Pin",
    description: null,
    shortcut: null,
    actions_json: JSON.stringify([{ type: "star" }, { type: "pin" }]),
    icon: "Star",
    is_enabled: 1,
    continue_on_error: 0,
    sort_order: 2,
    created_at: 3,
  },
  {
    id: "qs-custom",
    account_id: "account-1",
    name: "Investor follow-up",
    description: null,
    shortcut: null,
    actions_json: JSON.stringify([{ type: "star" }, { type: "pin" }]),
    icon: "Star",
    is_enabled: 1,
    continue_on_error: 0,
    sort_order: 3,
    created_at: 4,
  },
];

vi.mock("@/services/db/labels", () => ({
  getLabelsForAccount: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/services/db/quickSteps", () => ({
  getQuickStepsForAccount: vi.fn(() => Promise.resolve(defaultQuickSteps)),
  getEnabledQuickStepsForAccount: vi.fn(() => Promise.resolve(defaultQuickSteps)),
  insertQuickStep: vi.fn(() => Promise.resolve("quick-step-1")),
  updateQuickStep: vi.fn(() => Promise.resolve()),
  deleteQuickStep: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/quickSteps/defaults", () => ({
  seedDefaultQuickSteps: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/router/navigate", () => ({
  getActiveLabel: () => "inbox",
}));

vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(() => Promise.resolve()),
  trashThread: vi.fn(() => Promise.resolve()),
  permanentDeleteThread: vi.fn(() => Promise.resolve()),
  markThreadRead: vi.fn(() => Promise.resolve()),
  starThread: vi.fn(() => Promise.resolve()),
  spamThread: vi.fn(() => Promise.resolve()),
  addThreadLabel: vi.fn(() => Promise.resolve()),
  removeThreadLabel: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/threads", () => ({
  deleteThread: vi.fn(() => Promise.resolve()),
  pinThread: vi.fn(() => Promise.resolve()),
  unpinThread: vi.fn(() => Promise.resolve()),
  muteThread: vi.fn(() => Promise.resolve()),
  unmuteThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/draftDeletion", () => ({
  deleteDraftsForThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/services/db/messages", () => ({
  getMessagesForThread: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/services/snooze/snoozeManager", () => ({
  snoozeThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/quickSteps/executor", () => ({
  executeQuickStep: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/syncManager", () => ({
  triggerSync: vi.fn(),
}));

vi.mock("@/services/db/threadCategories", () => ({
  ALL_CATEGORIES: ["Primary", "Updates", "Promotions", "Social", "Newsletters"],
  setThreadCategory: vi.fn(() => Promise.resolve()),
}));

const thread: Thread = {
  id: "thread-1",
  accountId: "account-1",
  subject: "Project update",
  snippet: "Hello",
  lastMessageAt: 1736937000000,
  messageCount: 1,
  isRead: true,
  isStarred: false,
  isPinned: false,
  isMuted: false,
  hasAttachments: false,
  labelIds: [],
  fromName: "Alice",
  fromAddress: "alice@example.com",
};

describe("quick step i18n residuals", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    useAccountStore.setState({
      activeAccountId: "account-1",
      accounts: [{ id: "account-1", email: "me@example.com", displayName: null, avatarUrl: null, isActive: true }],
    });
    useThreadStore.setState({
      threads: [thread],
      threadMap: new Map([[thread.id, thread]]),
      selectedThreadId: null,
      selectedThreadIds: new Set(),
    });
    useLabelStore.setState({ labels: [] });
    useContextMenuStore.setState({ menuType: null, position: { x: 0, y: 0 }, data: {} });
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes seeded default quick step names in settings while preserving custom names", async () => {
    render(<QuickStepEditor />);

    expect(await screen.findByText("回复并归档")).toBeInTheDocument();
    expect(screen.getByText("标记已读并归档")).toBeInTheDocument();
    expect(screen.getByText("标星并置顶")).toBeInTheDocument();
    expect(screen.getByText("Investor follow-up")).toBeInTheDocument();
    expect(screen.queryByText("Reply & Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Mark Read & Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("Star & Pin")).not.toBeInTheDocument();
  });

  it("localizes seeded default quick step names in the thread context menu", async () => {
    act(() => {
      useContextMenuStore.getState().openMenu("thread", { x: 10, y: 10 }, { threadId: "thread-1" });
    });
    render(<ContextMenuPortal />);

    expect(await screen.findByText("快捷步骤")).toBeInTheDocument();
    expect(screen.getByText("回复并归档")).toBeInTheDocument();
    expect(screen.getByText("标记已读并归档")).toBeInTheDocument();
    expect(screen.getByText("标星并置顶")).toBeInTheDocument();
    expect(screen.getByText("Investor follow-up")).toBeInTheDocument();
    expect(screen.queryByText("Reply & Archive")).not.toBeInTheDocument();
  });
});
