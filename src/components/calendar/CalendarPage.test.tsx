import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { CalendarPage } from "./CalendarPage";

vi.mock("@/services/calendar/providerFactory", () => ({
  hasCalendarSupport: vi.fn(() => Promise.resolve(true)),
  getCalendarProvider: vi.fn(),
}));

vi.mock("@/services/db/calendars", () => ({
  getVisibleCalendars: vi.fn(() => Promise.resolve([
    {
      id: "cal-1",
      account_id: "acc-1",
      provider: "google",
      remote_id: "primary",
      display_name: "Work",
      color: "#4285f4",
      is_primary: 1,
      is_visible: 1,
      sync_token: null,
      ctag: null,
      created_at: 1,
      updated_at: 1,
    },
  ])),
  getCalendarsForAccount: vi.fn(() => Promise.resolve([])),
  upsertCalendar: vi.fn(() => Promise.resolve()),
  setCalendarVisibility: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/calendarEvents", () => ({
  getCalendarEventsInRangeMulti: vi.fn(() => Promise.resolve([])),
  upsertCalendarEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  reauthorizeAccount: vi.fn(() => Promise.resolve()),
}));

import { getCalendarProvider } from "@/services/calendar/providerFactory";

describe("CalendarPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
    useAccountStore.setState({
      activeAccountId: "acc-1",
      accounts: [{
        id: "acc-1",
        email: "alice@example.com",
        displayName: "Alice",
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: null,
        provider: "gmail_api",
        imapHost: null,
        imapPort: null,
        imapSecurity: null,
        smtpHost: null,
        smtpPort: null,
        smtpSecurity: null,
        authMethod: null,
        imapUsername: null,
        createdAt: 1,
        updatedAt: 1,
      }],
    });
  });

  it("renders repeated calendar authorization failure in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(getCalendarProvider).mockResolvedValue({
      type: "google",
      listCalendars: vi.fn(() => Promise.reject(new Error("403 insufficient permissions"))),
      fetchEvents: vi.fn(),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
    });

    render(<CalendarPage />);

    fireEvent.click(await screen.findByText("重新授权"));

    expect(await screen.findByText("日历访问错误")).toBeInTheDocument();
    expect(screen.getByText("重新授权后仍无法访问日历。请确认你的 Google Cloud 项目已启用 Google Calendar API。打开 console.cloud.google.com → API 和服务 → 启用 API 和服务，然后启用 “Google Calendar API”。")).toBeInTheDocument();
    expect(screen.queryByText(/Calendar access is still denied/)).not.toBeInTheDocument();
  });
});
