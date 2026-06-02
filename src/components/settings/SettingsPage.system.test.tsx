import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SettingsPage, getWebviewVersionLabel } from "./SettingsPage";

let routeTab = "about";
const originalConsoleError = console.error.bind(console);

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

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.4.21")),
  getTauriVersion: vi.fn(() => Promise.resolve("2.0.0")),
}));

vi.mock("@tauri-apps/api/app.js", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.4.21")),
  getTauriVersion: vi.fn(() => Promise.resolve("2.0.0")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve("")),
}));

vi.mock("@tauri-apps/api/core.js", () => ({
  invoke: vi.fn(() => Promise.resolve("")),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
  arch: vi.fn(() => "aarch64"),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@/services/updateManager", () => ({
  getAvailableUpdate: vi.fn(() => null),
  checkForUpdateNow: vi.fn(() => Promise.resolve(null)),
  installUpdate: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/attachments/cacheManager", () => ({
  getCacheSize: vi.fn(() => Promise.resolve(0)),
  clearAllCache: vi.fn(() => Promise.resolve()),
}));

describe("SettingsPage system surfaces", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({
      accounts: [],
      activeAccountId: null,
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      if (String(args[0]).startsWith("Failed to load app version:")) return;
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders About and update surfaces in Simplified Chinese", async () => {
    routeTab = "about";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("应用信息")).toBeInTheDocument();
    expect(screen.getByText("应用版本")).toBeInTheDocument();
    expect(screen.getAllByText("软件更新").length).toBeGreaterThan(0);
    expect(screen.getByText("检查更新")).toBeInTheDocument();
    expect(screen.getByText("开发者工具")).toBeInTheDocument();
    expect(screen.getAllByText("打开 DevTools").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByText("正在加载...")).toBeInTheDocument();
    });

    expect(screen.getByText("链接")).toBeInTheDocument();
    expect(screen.getByText("网站")).toBeInTheDocument();
    expect(screen.getByText("GitHub 仓库")).toBeInTheDocument();
    expect(screen.getByText("联系方式")).toBeInTheDocument();
    expect(screen.getByText("许可证")).toBeInTheDocument();
  });

  it("renders sidebar customization in Simplified Chinese", async () => {
    routeTab = "general";
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("侧边栏")).toBeInTheDocument();
    expect(screen.getByText("收件箱")).toBeInTheDocument();
    expect(screen.getByText("已加星标")).toBeInTheDocument();
    expect(screen.getAllByTitle("上移")[0]).toBeInTheDocument();
    expect(screen.getAllByTitle("下移")[0]).toBeInTheDocument();
    expect(screen.getByTitle("收件箱始终可见")).toBeInTheDocument();
  });

  it("localizes the unknown WebView version fallback", async () => {
    await i18n.changeLanguage("zh-CN");
    const t = i18n.getFixedT("zh-CN", "settings");

    expect(getWebviewVersionLabel("Kirje Test Agent", t)).toBe("未知");
    expect(getWebviewVersionLabel("Mozilla/5.0 Chrome/120.0.0.0", t)).toBe("120.0.0.0");
  });
});
