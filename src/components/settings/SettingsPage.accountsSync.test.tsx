import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SettingsPage } from "./SettingsPage";

let routeTab = "accounts";

vi.mock("@tanstack/react-router", () => ({
  useParams: vi.fn(() => ({ tab: routeTab })),
}));

vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
  navigateToSettings: vi.fn(),
}));

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(() => Promise.resolve(null)),
  setSetting: vi.fn(() => Promise.resolve()),
  getSecureSetting: vi.fn(() => Promise.resolve(null)),
  setSecureSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/accounts", () => ({
  deleteAccount: vi.fn(() => Promise.resolve()),
  getAccount: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  removeClient: vi.fn(),
  reauthorizeAccount: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/syncManager", () => ({
  triggerSync: vi.fn(() => Promise.resolve()),
  forceFullSync: vi.fn(() => Promise.resolve()),
  resyncAccount: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/sendAsAliases", async () => {
  const actual = await vi.importActual<typeof import("@/services/db/sendAsAliases")>(
    "@/services/db/sendAsAliases",
  );

  return {
    ...actual,
    getAliasesForAccount: vi.fn(() =>
      Promise.resolve([
        {
          id: "alias-1",
          account_id: "acc-1",
          email: "founder@example.com",
          display_name: "Founder",
          reply_to: null,
          is_default: 1,
          is_primary: 1,
          verification_status: "accepted",
          signature: null,
          synced_at: "2026-06-01T00:00:00.000Z",
        },
      ]),
    ),
    setDefaultAlias: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("@/services/db/pendingOperations", () => ({
  getPendingOpsCount: vi.fn(() => Promise.resolve(2)),
  getFailedOpsCount: vi.fn(() => Promise.resolve(1)),
  retryFailedOperations: vi.fn(() => Promise.resolve()),
  clearFailedOperations: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/attachments/cacheManager", () => ({
  getCacheSize: vi.fn(() => Promise.resolve(0)),
  clearAllCache: vi.fn(() => Promise.resolve()),
}));

describe("SettingsPage accounts and sync surfaces", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    routeTab = "accounts";
    useAccountStore.setState({
      accounts: [
        {
          id: "acc-1",
          email: "founder@example.com",
          displayName: "Founder",
          avatarUrl: null,
          isActive: true,
          provider: "gmail_api",
        },
        {
          id: "cal-1",
          email: "calendar@example.com",
          displayName: "Calendar",
          avatarUrl: null,
          isActive: false,
          provider: "caldav",
        },
      ],
      activeAccountId: "acc-1",
    });
  });

  it("renders accounts and sync settings in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("邮箱账户")).toBeInTheDocument();
    expect(screen.getByText("重新授权")).toBeInTheDocument();
    expect(screen.getAllByText("移除").length).toBeGreaterThan(0);
    expect(screen.getByText("日历账户")).toBeInTheDocument();

    expect(screen.getByText("Google API")).toBeInTheDocument();
    expect(screen.getByLabelText("客户端 ID")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Google OAuth 客户端 ID")).toBeInTheDocument();
    expect(screen.getByLabelText("客户端密钥")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Google OAuth 客户端密钥")).toBeInTheDocument();
    expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Google OAuth Client Secret")).not.toBeInTheDocument();
    expect(screen.getByText("保存")).toBeDisabled();

    expect(screen.getByText("同步")).toBeInTheDocument();
    expect(screen.getByText("检查新邮件")).toBeInTheDocument();
    expect(screen.getByText("立即同步")).toBeInTheDocument();
    expect(screen.getAllByText("完整重新同步").length).toBeGreaterThan(0);
    expect(screen.getByText("从头重新下载所有邮件")).toBeInTheDocument();

    expect(screen.getByText("同步范围")).toBeInTheDocument();
    expect(screen.getByText("同步邮件范围")).toBeInTheDocument();
    expect(screen.getByText("最近 30 天")).toBeInTheDocument();
    expect(screen.getByText("最近 1 年")).toBeInTheDocument();
    expect(screen.getByText("更改会在下一次完整重新同步时生效。")).toBeInTheDocument();

    expect(screen.getByText("发件别名")).toBeInTheDocument();
    expect(screen.getByText("这些别名会从 Gmail 设置同步。你可以选择默认发件人。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("主地址")).toBeInTheDocument();
      expect(screen.getByText("默认")).toBeInTheDocument();
    });

    expect(screen.getByText("同步与离线")).toBeInTheDocument();
    expect(screen.getByText("待同步操作")).toBeInTheDocument();
    expect(screen.getByText("等待同步到服务器的变更")).toBeInTheDocument();
    expect(screen.getByText("失败操作")).toBeInTheDocument();
    expect(screen.getByText("多次重试后仍无法同步的变更")).toBeInTheDocument();
    expect(screen.getByText("重试")).toBeInTheDocument();
    expect(screen.getByText("清除")).toBeInTheDocument();
  });
});
