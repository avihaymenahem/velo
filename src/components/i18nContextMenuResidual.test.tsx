import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { ContextMenuPortal } from "@/components/ui/ContextMenuPortal";
import { useAccountStore } from "@/stores/accountStore";
import { useContextMenuStore } from "@/stores/contextMenuStore";
import { useLabelStore } from "@/stores/labelStore";
import { useThreadStore, type Thread } from "@/stores/threadStore";

const routerState = vi.hoisted(() => ({ activeLabel: "inbox" }));
const setThreadCategoryMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const webviewWindowMock = vi.hoisted(() => ({
  getByLabel: vi.fn(() => Promise.resolve(null)),
  constructor: vi.fn(),
}));

vi.mock("@/router/navigate", () => ({
  getActiveLabel: () => routerState.activeLabel,
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

vi.mock("@/services/db/quickSteps", () => ({
  getEnabledQuickStepsForAccount: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/services/quickSteps/executor", () => ({
  executeQuickStep: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/syncManager", () => ({
  triggerSync: vi.fn(),
}));

vi.mock("@/services/db/threadCategories", () => ({
  ALL_CATEGORIES: ["Primary", "Updates", "Promotions", "Social", "Newsletters"],
  setThreadCategory: (...args: unknown[]) => setThreadCategoryMock(...args),
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: Object.assign(
    vi.fn(function WebviewWindowMock(...args: unknown[]) {
      webviewWindowMock.constructor(...args);
      return { once: vi.fn() };
    }),
    { getByLabel: webviewWindowMock.getByLabel },
  ),
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
  labelIds: ["label-client"],
  fromName: "Alice",
  fromAddress: "alice@example.com",
};

describe("context menu i18n residuals", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    routerState.activeLabel = "inbox";
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
    useLabelStore.setState({
      labels: [{
        id: "label-client",
        accountId: "account-1",
        name: "Client",
        type: "user",
        colorBg: null,
        colorFg: null,
        sortOrder: 0,
      }],
    });
    useContextMenuStore.setState({ menuType: null, position: { x: 0, y: 0 }, data: {} });
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes sidebar label and nav context menu labels", () => {
    act(() => {
      useContextMenuStore.getState().openMenu("sidebarLabel", { x: 10, y: 10 }, { labelId: "label-client" });
    });
    const { rerender } = render(<ContextMenuPortal />);

    expect(screen.getByText("同步此文件夹")).toBeInTheDocument();
    expect(screen.getByText("编辑标签")).toBeInTheDocument();
    expect(screen.getByText("删除标签")).toBeInTheDocument();
    expect(screen.queryByText("Sync this folder")).not.toBeInTheDocument();

    act(() => {
      useContextMenuStore.getState().openMenu("sidebarNav", { x: 10, y: 10 }, { navId: "inbox" });
    });
    rerender(<ContextMenuPortal />);

    expect(screen.getByText("同步此文件夹")).toBeInTheDocument();
  });

  it("localizes thread context menu labels and preserves user labels", () => {
    act(() => {
      useContextMenuStore.getState().openMenu("thread", { x: 10, y: 10 }, { threadId: "thread-1" });
    });
    render(<ContextMenuPortal />);

    expect(screen.getByText("回复")).toBeInTheDocument();
    expect(screen.getByText("全部回复")).toBeInTheDocument();
    expect(screen.getByText("转发")).toBeInTheDocument();
    expect(screen.getByText("归档")).toBeInTheDocument();
    expect(screen.getByText("删除")).toBeInTheDocument();
    expect(screen.getByText("标记为未读")).toBeInTheDocument();
    expect(screen.getByText("加星标")).toBeInTheDocument();
    expect(screen.getByText("稍后提醒...")).toBeInTheDocument();
    expect(screen.getByText("置顶")).toBeInTheDocument();
    expect(screen.getByText("静音")).toBeInTheDocument();
    expect(screen.getByText("标记为垃圾邮件")).toBeInTheDocument();
    expect(screen.getByText("应用标签")).toBeInTheDocument();
    expect(screen.getByText("移动到文件夹")).toBeInTheDocument();
    expect(screen.getByText("移动到分类")).toBeInTheDocument();
    expect(screen.getByText("在新窗口打开")).toBeInTheDocument();
    expect(screen.queryByText("Reply")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("应用标签"));
    expect(screen.getByText("Client")).toBeInTheDocument();
  });

  it("localizes category submenu display while preserving category action IDs", async () => {
    act(() => {
      useContextMenuStore.getState().openMenu("thread", { x: 10, y: 10 }, { threadId: "thread-1" });
    });
    render(<ContextMenuPortal />);

    fireEvent.click(screen.getByText("移动到分类"));
    fireEvent.click(screen.getByText("主要"));

    expect(setThreadCategoryMock).toHaveBeenCalledWith("account-1", "thread-1", "Primary", true);
  });

  it("uses a localized thread pop-out window title fallback", async () => {
    const threadWithoutSubject = { ...thread, subject: null };
    useThreadStore.setState({
      threads: [threadWithoutSubject],
      threadMap: new Map([[threadWithoutSubject.id, threadWithoutSubject]]),
      selectedThreadId: null,
      selectedThreadIds: new Set(),
    });

    act(() => {
      useContextMenuStore.getState().openMenu("thread", { x: 10, y: 10 }, { threadId: "thread-1" });
    });
    render(<ContextMenuPortal />);

    fireEvent.click(screen.getByText("在新窗口打开"));

    await waitFor(() => {
      expect(webviewWindowMock.constructor).toHaveBeenCalledWith(
        "thread-thread-1",
        expect.objectContaining({ title: "线程" }),
      );
    });
  });

  it("localizes message context menu labels", () => {
    act(() => {
      useContextMenuStore.getState().openMenu("message", { x: 10, y: 10 }, {
        messageId: "message-1",
        threadId: "thread-1",
        accountId: "account-1",
        fromAddress: "alice@example.com",
        fromName: "Alice",
        replyTo: null,
        toAddresses: "me@example.com",
        ccAddresses: null,
        subject: "Project update",
        date: 1736937000000,
        bodyHtml: "<p>Hello</p>",
        bodyText: "Hello",
      });
    });
    render(<ContextMenuPortal />);

    expect(screen.getByText("回复")).toBeInTheDocument();
    expect(screen.getByText("全部回复")).toBeInTheDocument();
    expect(screen.getByText("转发")).toBeInTheDocument();
    expect(screen.getByText("复制邮件正文")).toBeInTheDocument();
    expect(screen.getByText("查看源码")).toBeInTheDocument();
    expect(screen.queryByText("Copy Message Text")).not.toBeInTheDocument();
    expect(screen.queryByText("View Source")).not.toBeInTheDocument();
  });
});
