import { fireEvent, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SettingsPage } from "./SettingsPage";

let routeTab = "ai";

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

vi.mock("@/services/attachments/cacheManager", () => ({
  getCacheSize: vi.fn(() => Promise.resolve(0)),
  clearAllCache: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/bundleRules", () => ({
  getBundleRules: vi.fn(() => Promise.resolve([])),
  setBundleRule: vi.fn(() => Promise.resolve()),
}));

describe("SettingsPage AI surfaces", () => {
  beforeEach(async () => {
    routeTab = "ai";
    await i18n.changeLanguage("en");
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
      ],
      activeAccountId: "acc-1",
    });
  });

  it("renders AI settings in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<SettingsPage />);

    expect(await screen.findByText("提供商")).toBeInTheDocument();
    expect(screen.getByText("选择用于总结、写信辅助和智能分类的 AI 服务商。")).toBeInTheDocument();
    expect(screen.getByText("AI 服务商")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "本地 AI（Ollama / LMStudio）" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Local AI (Ollama / LMStudio)" })).not.toBeInTheDocument();
    expect(screen.getByText(/当前使用/)).toBeInTheDocument();

    expect(screen.getByText("API 密钥")).toBeInTheDocument();
    expect(screen.getByText("Anthropic API 密钥")).toBeInTheDocument();
    expect(screen.queryByText("Anthropic API Key")).not.toBeInTheDocument();
    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("保存密钥")).toBeDisabled();
    expect(screen.getByText("测试连接")).toBeDisabled();

    const providerSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(providerSelect).toHaveValue("claude");
    fireEvent.change(providerSelect, { target: { value: "copilot" } });

    expect(await screen.findByText("GitHub 个人访问令牌")).toBeInTheDocument();
    expect(screen.queryByText("GitHub Personal Access Token")).not.toBeInTheDocument();

    expect(screen.getByText("功能")).toBeInTheDocument();
    expect(screen.getByText("启用 AI 功能")).toBeInTheDocument();
    expect(screen.getByText("所有 AI 功能的总开关")).toBeInTheDocument();
    expect(screen.getByText("收件箱自动分类")).toBeInTheDocument();
    expect(screen.getByText("使用 AI 优化基于规则的分类结果")).toBeInTheDocument();
    expect(screen.getByText("自动总结线程")).toBeInTheDocument();
    expect(screen.getByText("在多封邮件线程中显示 AI 摘要")).toBeInTheDocument();

    expect(screen.getAllByText("自动草拟回复").length).toBeGreaterThan(0);
    expect(screen.getByText("用 AI 生成的草稿预填回复编辑器")).toBeInTheDocument();
    expect(screen.getByText("学习写作风格")).toBeInTheDocument();
    expect(screen.getByText("分析已发送邮件，以匹配你的语气和表达方式")).toBeInTheDocument();
    expect(screen.getByText("写作风格画像")).toBeInTheDocument();
    expect(screen.getByText("根据最近已发送邮件重新分析你的写作风格")).toBeInTheDocument();
    expect(screen.getByText("重新分析")).toBeInTheDocument();

    expect(screen.getByText("分类")).toBeInTheDocument();
    expect(screen.getByText(/收到的邮件会先通过规则启发式分类/)).toBeInTheDocument();
    expect(screen.getByText("启用自动归档后，指定分类会跳过收件箱。")).toBeInTheDocument();
    expect(screen.getByText("自动归档更新")).toBeInTheDocument();
    expect(screen.getByText("让更新类邮件跳过收件箱")).toBeInTheDocument();
    expect(screen.getByText("自动归档简报")).toBeInTheDocument();

    expect(screen.getByText("捆绑与投递计划")).toBeInTheDocument();
    expect(screen.getByText("把分类折叠成收件箱中的单行。也可以设置投递计划来批量接收邮件。")).toBeInTheDocument();
  });
});
