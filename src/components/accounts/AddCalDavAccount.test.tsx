import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { AddCalDavAccount } from "./AddCalDavAccount";
import { discoverCalDavSettings, testCalDavConnection } from "@/services/calendar/autoDiscovery";
import { insertCalDavAccount } from "@/services/db/accounts";

vi.mock("@/services/db/accounts", () => ({
  insertCalDavAccount: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: vi.fn((selector: (state: { addAccount: () => void }) => unknown) =>
    selector({ addAccount: vi.fn() }),
  ),
}));

vi.mock("@/services/calendar/autoDiscovery", () => ({
  discoverCalDavSettings: vi.fn(() =>
    Promise.resolve({
      providerName: "Fastmail",
      caldavUrl: "https://caldav.fastmail.com/",
      authMethod: "basic",
      needsAppPassword: false,
    }),
  ),
  testCalDavConnection: vi.fn(() =>
    Promise.resolve({
      success: true,
      message: "Connected — found 2 calendars",
      calendarCount: 2,
    }),
  ),
}));

describe("AddCalDavAccount", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
  });

  it("localizes CalDAV test results in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(
      <AddCalDavAccount
        onClose={() => {}}
        onSuccess={() => {}}
        onBack={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@fastmail.com" },
    });
    fireEvent.click(screen.getByText("下一步"));

    expect(await screen.findByText("已识别：Fastmail")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "app-password" },
    });
    fireEvent.click(screen.getByText("测试并连接"));

    expect(await screen.findByText("连接成功")).toBeInTheDocument();
    expect(screen.getByText("找到 2 个日历")).toBeInTheDocument();
    expect(screen.queryByText("Connected — found 2 calendars")).not.toBeInTheDocument();

    expect(discoverCalDavSettings).toHaveBeenCalledWith("user@fastmail.com");
    expect(testCalDavConnection).toHaveBeenCalledWith(
      "https://caldav.fastmail.com/",
      "user@fastmail.com",
      "app-password",
    );
  });

  it("localizes CalDAV account save failures in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(insertCalDavAccount).mockRejectedValueOnce(new Error("DB error"));

    render(
      <AddCalDavAccount
        onClose={() => {}}
        onSuccess={() => {}}
        onBack={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("邮箱"), {
      target: { value: "user@fastmail.com" },
    });
    fireEvent.click(screen.getByText("下一步"));

    expect(await screen.findByText("已识别：Fastmail")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "app-password" },
    });
    fireEvent.click(screen.getByText("测试并连接"));

    expect(await screen.findByText("连接成功")).toBeInTheDocument();
    fireEvent.click(screen.getByText("添加账户"));

    expect(await screen.findByText("无法保存账户")).toBeInTheDocument();
    expect(screen.queryByText("Failed to save account")).not.toBeInTheDocument();
  });
});
