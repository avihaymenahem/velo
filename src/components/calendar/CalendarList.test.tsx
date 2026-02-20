import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { CalendarList } from "./CalendarList";
import type { DbCalendar } from "@/services/db/calendars";

function makeCalendar(overrides: Partial<DbCalendar> = {}): DbCalendar {
  return {
    id: "cal-1",
    account_id: "acc-1",
    provider: "google",
    remote_id: "remote-1",
    display_name: "Work",
    color: "#4285f4",
    is_primary: 0,
    is_visible: 1,
    sync_token: null,
    ctag: null,
    created_at: 1700000000,
    updated_at: 1700000000,
    ...overrides,
  };
}

describe("CalendarList", () => {
  it("renders all calendar names", () => {
    const calendars = [
      makeCalendar({ id: "cal-1", display_name: "Work" }),
      makeCalendar({ id: "cal-2", display_name: "Personal" }),
      makeCalendar({ id: "cal-3", display_name: "Holidays" }),
    ];

    render(
      <CalendarList calendars={calendars} onVisibilityChange={vi.fn()} />,
    );

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Holidays")).toBeInTheDocument();
  });

  it('shows "Primary" badge for primary calendar', () => {
    const calendars = [
      makeCalendar({ id: "cal-1", display_name: "Main", is_primary: 1 }),
      makeCalendar({ id: "cal-2", display_name: "Secondary", is_primary: 0 }),
    ];

    render(
      <CalendarList calendars={calendars} onVisibilityChange={vi.fn()} />,
    );

    expect(screen.getByText("Primary")).toBeInTheDocument();
    // Only one Primary badge
    expect(screen.getAllByText("Primary")).toHaveLength(1);
  });

  it("checkboxes reflect is_visible state", () => {
    const calendars = [
      makeCalendar({ id: "cal-1", display_name: "Visible", is_visible: 1 }),
      makeCalendar({
        id: "cal-2",
        display_name: "Hidden",
        is_visible: 0,
      }),
    ];

    render(
      <CalendarList calendars={calendars} onVisibilityChange={vi.fn()} />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("clicking checkbox calls onVisibilityChange with correct calendarId and new state", () => {
    const onVisibilityChange = vi.fn();
    const calendars = [
      makeCalendar({ id: "cal-1", display_name: "Work", is_visible: 1 }),
      makeCalendar({ id: "cal-2", display_name: "Personal", is_visible: 0 }),
    ];

    render(
      <CalendarList
        calendars={calendars}
        onVisibilityChange={onVisibilityChange}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");

    // Uncheck the visible calendar
    fireEvent.click(checkboxes[0]);
    expect(onVisibilityChange).toHaveBeenCalledWith("cal-1", false);

    // Check the hidden calendar
    fireEvent.click(checkboxes[1]);
    expect(onVisibilityChange).toHaveBeenCalledWith("cal-2", true);
  });

  it("calendar color is applied to the checkbox indicator", () => {
    const calendars = [
      makeCalendar({
        id: "cal-1",
        display_name: "Work",
        color: "#e63946",
        is_visible: 1,
      }),
    ];

    render(
      <CalendarList calendars={calendars} onVisibilityChange={vi.fn()} />,
    );

    // The color indicator span is the sibling after the sr-only checkbox
    const checkbox = screen.getByRole("checkbox");
    const indicator = checkbox.nextElementSibling as HTMLElement;
    expect(indicator.style.backgroundColor).toBe("rgb(230, 57, 70)");
  });

  it('handles null display_name by showing "Calendar" fallback', () => {
    const calendars = [
      makeCalendar({ id: "cal-1", display_name: null }),
    ];

    render(
      <CalendarList calendars={calendars} onVisibilityChange={vi.fn()} />,
    );

    expect(screen.getByText("Calendar")).toBeInTheDocument();
  });
});
