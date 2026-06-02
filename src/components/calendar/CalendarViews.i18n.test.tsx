import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import i18n from "@/i18n";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import { DayView } from "./DayView";
import { EventCard } from "./EventCard";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

function makeEvent(overrides: Partial<DbCalendarEvent> = {}): DbCalendarEvent {
  return {
    id: "event-1",
    account_id: "acc-1",
    google_event_id: "google-event-1",
    summary: null,
    description: null,
    location: null,
    start_time: new Date(2024, 0, 15, 9, 0).getTime() / 1000,
    end_time: new Date(2024, 0, 15, 10, 0).getTime() / 1000,
    is_all_day: 0,
    status: "confirmed",
    organizer_email: null,
    attendees_json: null,
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

describe("calendar view i18n", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("renders day view chrome and fallback event names in Simplified Chinese", () => {
    render(
      <DayView
        currentDate={new Date(2024, 0, 15)}
        events={[makeEvent({ is_all_day: 1 })]}
        onEventClick={vi.fn()}
      />,
    );

    expect(screen.getByText("星期一")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日程 · 全天" })).toBeInTheDocument();
    expect(screen.getByText("上午9点")).toBeInTheDocument();
  });

  it("renders week view day names and event fallbacks in Simplified Chinese", () => {
    render(
      <WeekView
        currentDate={new Date(2024, 0, 15)}
        events={[makeEvent()]}
        onEventClick={vi.fn()}
      />,
    );

    expect(screen.getByText("日")).toBeInTheDocument();
    expect(screen.getByText("一")).toBeInTheDocument();
    expect(screen.getByText("全天")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日程" })).toBeInTheDocument();
    expect(screen.getByText("上午9点")).toBeInTheDocument();
  });

  it("renders month view day names and overflow text in Simplified Chinese", () => {
    const events = Array.from({ length: 4 }, (_, index) =>
      makeEvent({
        id: `event-${index}`,
        google_event_id: `google-event-${index}`,
        summary: `事件 ${index + 1}`,
      }),
    );

    render(
      <MonthView
        currentDate={new Date(2024, 0, 15)}
        events={events}
        onEventClick={vi.fn()}
      />,
    );

    expect(screen.getByText("日")).toBeInTheDocument();
    expect(screen.getByText("一")).toBeInTheDocument();
    expect(screen.getByText("还有 1 个")).toBeInTheDocument();
  });

  it("renders standalone event cards in Simplified Chinese", () => {
    render(<EventCard event={makeEvent({ is_all_day: 1 })} />);

    expect(screen.getByText("（无标题）")).toBeInTheDocument();
    expect(screen.getByText("全天")).toBeInTheDocument();
  });
});
