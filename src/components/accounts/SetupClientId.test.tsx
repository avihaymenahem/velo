import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SetupClientId } from "./SetupClientId";
import i18n from "@/i18n";

vi.mock("@/services/db/settings", () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
  setSecureSetting: vi.fn().mockResolvedValue(undefined),
}));

describe("SetupClientId", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("disables Save button when both fields are empty", () => {
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);
    const saveButton = screen.getByText("Save & Continue");
    expect(saveButton).toBeDisabled();
  });

  it("disables Save button when only client ID is provided", () => {
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);
    const inputs = screen.getAllByRole("textbox");
    // Client ID is the text input; secret is password (not a textbox role)
    const clientIdInput = screen.getByPlaceholderText(
      "Paste your Client ID here...",
    );
    fireEvent.change(clientIdInput, { target: { value: "my-client-id" } });

    const saveButton = screen.getByText("Save & Continue");
    expect(saveButton).toBeDisabled();
  });

  it("disables Save button when only client secret is provided", () => {
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);
    const secretInput = screen.getByPlaceholderText(
      "Paste your Client Secret here...",
    );
    fireEvent.change(secretInput, { target: { value: "my-secret" } });

    const saveButton = screen.getByText("Save & Continue");
    expect(saveButton).toBeDisabled();
  });

  it("enables Save button when both fields are filled", () => {
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);
    const clientIdInput = screen.getByPlaceholderText(
      "Paste your Client ID here...",
    );
    const secretInput = screen.getByPlaceholderText(
      "Paste your Client Secret here...",
    );

    fireEvent.change(clientIdInput, { target: { value: "my-client-id" } });
    fireEvent.change(secretInput, { target: { value: "my-secret" } });

    const saveButton = screen.getByText("Save & Continue");
    expect(saveButton).not.toBeDisabled();
  });

  it("shows helper text about client secret being required", () => {
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);
    expect(
      screen.getByText("Required for Web application credentials"),
    ).toBeInTheDocument();
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(<SetupClientId onComplete={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders Google API setup instructions in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    render(<SetupClientId onComplete={() => {}} onCancel={() => {}} />);

    expect(screen.getByText("Google API 设置")).toBeInTheDocument();
    expect(screen.getByText("连接 Gmail 账户需要 Google Cloud OAuth 客户端 ID。")).toBeInTheDocument();
    expect(screen.getByText("创建 OAuth 2.0 凭据，类型选择 Web 应用")).toBeInTheDocument();
    expect(screen.getByText("复制下方的客户端 ID 和客户端密钥")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("在这里粘贴客户端 ID...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("在这里粘贴客户端密钥...")).toBeInTheDocument();
    expect(screen.getByText("Web 应用凭据必须填写客户端密钥。")).toBeInTheDocument();
    expect(screen.queryByText("Web application 凭据必须填写客户端密钥。")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("在这里粘贴 Client ID...")).not.toBeInTheDocument();
    expect(screen.getByText("保存并继续")).toBeDisabled();
  });
});
