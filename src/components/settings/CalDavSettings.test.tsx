import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { CalDavSettings } from "./CalDavSettings";
import type { DbAccount } from "@/services/db/accounts";
import { testCalDavConnection } from "@/services/calendar/autoDiscovery";

vi.mock("@/services/calendar/autoDiscovery", () => ({
  discoverCalDavSettings: vi.fn(() => Promise.resolve({ caldavUrl: null })),
  testCalDavConnection: vi.fn(() => Promise.resolve({ success: true, message: "OK" })),
}));

vi.mock("@/services/db/accounts", () => ({
  updateAccountCalDav: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/calendar/providerFactory", () => ({
  removeCalendarProvider: vi.fn(),
}));

const account = {
  id: "acc-1",
  email: "test@example.com",
  display_name: "Test",
  avatar_url: null,
  is_active: 1,
  provider: "imap",
  caldav_url: "",
  caldav_username: null,
  caldav_password: null,
} as unknown as DbAccount;

describe("CalDavSettings", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders CalDAV settings chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<CalDavSettings account={account} onSaved={vi.fn()} />);

    expect(screen.getByText("日历（CalDAV）")).toBeInTheDocument();
    expect(screen.getByText("连接 CalDAV 日历服务器，为此 IMAP 账户启用日历功能。")).toBeInTheDocument();
    expect(screen.getByLabelText("CalDAV 服务器 URL")).toBeInTheDocument();
    expect(screen.getByLabelText("用户名")).toBeInTheDocument();
    expect(screen.getByLabelText("密码 / 应用专用密码")).toBeInTheDocument();
    expect(screen.getByText("测试连接")).toBeDisabled();
    expect(screen.getByText("保存")).toBeDisabled();
  });

  it("localizes CalDAV connection test results in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(testCalDavConnection).mockResolvedValueOnce({
      success: true,
      message: "Connected — found 2 calendars",
      calendarCount: 2,
    });

    render(
      <CalDavSettings
        account={{
          ...account,
          caldav_url: "https://caldav.example.com/",
          caldav_password: "app-password",
        } as DbAccount}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("测试连接"));

    expect(await screen.findByText("连接成功")).toBeInTheDocument();
    expect(screen.queryByText("Connected — found 2 calendars")).not.toBeInTheDocument();
  });

  it("localizes generic CalDAV connection failures in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(testCalDavConnection).mockResolvedValueOnce({
      success: false,
      message: "Connection failed",
    });

    render(
      <CalDavSettings
        account={{
          ...account,
          caldav_url: "https://caldav.example.com/",
          caldav_password: "app-password",
        } as DbAccount}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("测试连接"));

    expect(await screen.findByText("连接失败")).toBeInTheDocument();
    expect(screen.queryByText("Connection failed")).not.toBeInTheDocument();
  });
});
