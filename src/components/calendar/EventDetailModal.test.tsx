import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import i18n from "@/i18n";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import type { DbCalendar } from "@/services/db/calendars";
import { EventDetailModal } from "./EventDetailModal";

vi.mock("@/services/calendar/providerFactory", () => ({
  getCalendarProvider: vi.fn(),
}));

vi.mock("@/services/db/calendarEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/calendarEvents")>();
  return {
    ...actual,
    deleteCalendarEvent: vi.fn(),
  };
});

function makeEvent(overrides: Partial<DbCalendarEvent> = {}): DbCalendarEvent {
  return {
    id: "event-1",
    account_id: "acc-1",
    google_event_id: "google-event-1",
    summary: null,
    description: "Bring metrics",
    location: "Board room",
    start_time: 1_704_067_200,
    end_time: 1_704_070_800,
    is_all_day: 0,
    status: "confirmed",
    organizer_email: "founder@example.com",
    attendees_json: JSON.stringify([{ email: "investor@example.com", displayName: "Investor" }]),
    html_link: null,
    updated_at: 1_704_067_200,
    calendar_id: "cal-1",
    remote_event_id: "remote-event-1",
    etag: null,
    ical_data: null,
    uid: null,
    ...overrides,
  };
}

function makeCalendar(overrides: Partial<DbCalendar> = {}): DbCalendar {
  return {
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
    created_at: 1_704_067_200,
    updated_at: 1_704_067_200,
    ...overrides,
  };
}

describe("EventDetailModal i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("renders event details and delete confirmation in Simplified Chinese", () => {
    render(
      <EventDetailModal
        event={makeEvent()}
        calendars={[makeCalendar()]}
        accountId="acc-1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "日程" })).toBeInTheDocument();
    expect(screen.getByText("参与者")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /删除/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /编辑/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /删除/ }));

    expect(screen.getByText("删除此日程？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("renders edit controls in Simplified Chinese", () => {
    render(
      <EventDetailModal
        event={makeEvent({ summary: "Board sync" })}
        calendars={[makeCalendar()]}
        accountId="acc-1"
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /编辑/ }));

    expect(screen.getByRole("heading", { name: "编辑日程" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toBeInTheDocument();
    expect(screen.getByLabelText("开始")).toBeInTheDocument();
    expect(screen.getByLabelText("结束")).toBeInTheDocument();
    expect(screen.getByLabelText("地点")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("添加地点")).toBeInTheDocument();
    expect(screen.getByText("描述")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("添加描述")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });
});
