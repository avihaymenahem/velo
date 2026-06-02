import { cleanup, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SettingsPage } from "./SettingsPage";

let routeTab = "notifications";

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

vi.mock("@/services/globalShortcut", () => ({
  DEFAULT_SHORTCUT: "CmdOrCtrl+Shift+M",
  getCurrentShortcut: vi.fn(() => "CmdOrCtrl+Shift+M"),
  registerComposeShortcut: vi.fn(() => Promise.resolve()),
}));

vi.mock("./SignatureEditor", () => ({
  SignatureEditor: () => <div data-testid="signature-editor" />,
}));

vi.mock("./TemplateEditor", () => ({
  TemplateEditor: () => <div data-testid="template-editor" />,
}));

vi.mock("./FilterEditor", () => ({
  FilterEditor: () => <div data-testid="filter-editor" />,
}));

vi.mock("./LabelEditor", () => ({
  LabelEditor: () => <div data-testid="label-editor" />,
}));

vi.mock("./ContactEditor", () => ({
  ContactEditor: () => <div data-testid="contact-editor" />,
}));

vi.mock("./SubscriptionManager", () => ({
  SubscriptionManager: () => <div data-testid="subscription-manager" />,
}));

vi.mock("./SmartFolderEditor", () => ({
  SmartFolderEditor: () => <div data-testid="smart-folder-editor" />,
}));

vi.mock("./QuickStepEditor", () => ({
  QuickStepEditor: () => <div data-testid="quick-step-editor" />,
}));

vi.mock("./SmartLabelEditor", () => ({
  SmartLabelEditor: () => <div data-testid="smart-label-editor" />,
}));

vi.mock("@/services/attachments/cacheManager", () => ({
  getCacheSize: vi.fn(() => Promise.resolve(0)),
  clearAllCache: vi.fn(() => Promise.resolve()),
}));

describe("SettingsPage preference surfaces", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
    });
  });

  it("renders notification preferences in Simplified Chinese", async () => {
    routeTab = "notifications";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect((await screen.findAllByText("通知")).length).toBeGreaterThan(0);
    expect(screen.getByText("启用通知")).toBeInTheDocument();
    expect(screen.getByText("智能通知")).toBeInTheDocument();
    expect(screen.getByText("只通知所选分类和 VIP 发件人")).toBeInTheDocument();
    expect(screen.getByText("分类过滤")).toBeInTheDocument();
    expect(screen.getByText("通知这些分类")).toBeInTheDocument();
    expect(screen.getByText("主要")).toBeInTheDocument();
    expect(screen.getByText("VIP 发件人")).toBeInTheDocument();
    expect(screen.getByText("这些发件人始终触发通知，不受分类限制")).toBeInTheDocument();
    expect(screen.getByText("添加")).toBeDisabled();
  });

  it("renders accent color names in Simplified Chinese", async () => {
    routeTab = "appearance";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("强调色")).toBeInTheDocument();
    expect(screen.getByTitle("靛蓝")).toBeInTheDocument();
    expect(screen.getByTitle("玫瑰")).toBeInTheDocument();
    expect(screen.queryByTitle("Indigo")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Rose")).not.toBeInTheDocument();
  });

  it("renders composing preferences in Simplified Chinese", async () => {
    routeTab = "composing";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("发送")).toBeInTheDocument();
    expect(screen.getByText("撤销发送延迟")).toBeInTheDocument();
    expect(screen.getByText("5 秒")).toBeInTheDocument();
    expect(screen.getByText("发送并归档")).toBeInTheDocument();
    expect(screen.getByText("回复后自动归档线程")).toBeInTheDocument();
    expect(screen.getByText("行为")).toBeInTheDocument();
    expect(screen.getByText("默认回复动作")).toBeInTheDocument();
    expect(screen.getByText("回复")).toBeInTheDocument();
    expect(screen.getByText("标记为已读")).toBeInTheDocument();
    expect(screen.getByText("立即")).toBeInTheDocument();
    expect(screen.getByText("签名")).toBeInTheDocument();
    expect(screen.getByText("模板")).toBeInTheDocument();
  });

  it("renders mail rule and people section copy in Simplified Chinese", async () => {
    routeTab = "mail-rules";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("标签")).toBeInTheDocument();
    expect(screen.getByText("创建、重命名、换色、删除或重新排序 Gmail 标签。")).toBeInTheDocument();
    expect(screen.getByText("过滤器")).toBeInTheDocument();
    expect(screen.getByText("过滤器会在同步期间自动对新收到的邮件应用动作。")).toBeInTheDocument();
    expect(screen.getByText("智能标签")).toBeInTheDocument();
    expect(screen.getByText("用自然语言描述哪些邮件应被打上标签。AI 会在同步期间自动标记匹配邮件。")).toBeInTheDocument();
    expect(screen.getByText("智能文件夹")).toBeInTheDocument();
    expect(screen.getByText(/智能文件夹是保存的搜索/)).toBeInTheDocument();
    expect(screen.getByText("快捷步骤")).toBeInTheDocument();
    expect(screen.getByText(/快捷步骤可以把多个动作串成一次点击/)).toBeInTheDocument();

    cleanup();
    routeTab = "people";
    render(<SettingsPage />);

    expect((await screen.findAllByText("联系人")).length).toBeGreaterThan(0);
    expect(screen.getByText("联系人会在你收发邮件时自动添加。可在下方编辑显示名称或移除联系人。")).toBeInTheDocument();
    expect(screen.getByText("订阅")).toBeInTheDocument();
    expect(screen.getByText("检测含有退订链接的营销邮件，并从一个地方管理订阅。")).toBeInTheDocument();
  });
});
