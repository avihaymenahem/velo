import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SettingsPage } from "./SettingsPage";

let routeTab = "shortcuts";

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

vi.mock("@/services/attachments/cacheManager", () => ({
  getCacheSize: vi.fn(() => Promise.resolve(0)),
  clearAllCache: vi.fn(() => Promise.resolve()),
}));

describe("SettingsPage shortcuts surfaces", () => {
  beforeEach(async () => {
    routeTab = "shortcuts";
    await i18n.changeLanguage("en");
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
    });
  });

  it("renders shortcut settings in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("全局快捷键")).toBeInTheDocument();
    expect(screen.getByText("快速写信")).toBeInTheDocument();
    expect(screen.getByText("从任意应用打开写信窗口")).toBeInTheDocument();
    expect(screen.getByText("更改")).toBeInTheDocument();
    expect(screen.getByText("点击快捷键可重新绑定。按任意键或组合键完成设置。")).toBeInTheDocument();

    expect(screen.getByText("导航")).toBeInTheDocument();
    expect(screen.getByText("下一封线程")).toBeInTheDocument();
    expect(screen.getByText("上一封线程")).toBeInTheDocument();
    expect(screen.getByText("前往收件箱")).toBeInTheDocument();
    expect(screen.getByText("前往简报")).toBeInTheDocument();

    expect(screen.getByText("动作")).toBeInTheDocument();
    expect(screen.getByText("写新邮件")).toBeInTheDocument();
    expect(screen.getByText("归档")).toBeInTheDocument();
    expect(screen.getByText("从邮件创建任务（AI）")).toBeInTheDocument();

    expect(screen.getByText("应用")).toBeInTheDocument();
    expect(screen.getByText("命令菜单")).toBeInTheDocument();
    expect(screen.getByText("向 AI 询问收件箱")).toBeInTheDocument();
    expect(screen.getByText("显示键盘快捷键")).toBeInTheDocument();
  });
});
