import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddImapAccount } from "./AddImapAccount";
import i18n from "@/i18n";

vi.mock("@/services/db/accounts", () => ({
  insertImapAccount: vi.fn().mockResolvedValue(undefined),
  insertOAuthImapAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("AddImapAccount", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders the IMAP setup flow in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <AddImapAccount
        onClose={() => {}}
        onSuccess={() => {}}
        onBack={() => {}}
      />,
    );

    expect(screen.getByText("添加 IMAP/SMTP 账户")).toBeInTheDocument();
    expect(screen.getByText("账户")).toBeInTheDocument();
    expect(screen.getByLabelText("邮箱地址")).toBeInTheDocument();
    expect(screen.getByLabelText("显示名称（可选）")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名（可选）")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByText("下一步")).toBeDisabled();
  });

  it("renders the IMAP, SMTP, and verification steps in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <AddImapAccount
        onClose={() => {}}
        onSuccess={() => {}}
        onBack={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱地址"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "app-password" },
    });
    fireEvent.click(screen.getByText("下一步"));

    expect(screen.getByLabelText("IMAP 服务器")).toBeInTheDocument();
    expect(screen.getByLabelText("端口")).toBeInTheDocument();
    expect(screen.getByLabelText("安全性")).toBeInTheDocument();
    expect(screen.getByLabelText("接受自签名证书")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("IMAP 服务器"), {
      target: { value: "imap.example.com" },
    });
    fireEvent.click(screen.getByText("下一步"));

    expect(screen.getByLabelText("SMTP 服务器")).toBeInTheDocument();
    expect(screen.getByLabelText("使用与 IMAP 相同的密码")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("SMTP 服务器"), {
      target: { value: "smtp.example.com" },
    });
    fireEvent.click(screen.getByText("下一步"));

    expect(screen.getByText("添加账户前先测试连接设置。")).toBeInTheDocument();
    expect(screen.getByText("IMAP 连接")).toBeInTheDocument();
    expect(screen.getByText("SMTP 连接")).toBeInTheDocument();
    expect(screen.getByText("测试连接")).toBeInTheDocument();
  });

  it("localizes IMAP OAuth credential setup in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <AddImapAccount
        onClose={() => {}}
        onSuccess={() => {}}
        onBack={() => {}}
      />,
    );

    const emailInput = screen.getByLabelText("邮箱地址");
    fireEvent.change(emailInput, {
      target: { value: "user@outlook.com" },
    });
    fireEvent.blur(emailInput);

    expect(await screen.findByLabelText("客户端 ID")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Microsoft 应用客户端 ID")).toBeInTheDocument();
    expect(screen.getByLabelText("客户端密钥（可选）")).toBeInTheDocument();
    expect(screen.getByText(/你需要在 Microsoft 注册应用以获取客户端 ID。/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
    expect(screen.queryByText("You need to register an app with Microsoft to get a Client ID.")).not.toBeInTheDocument();
  });
});
