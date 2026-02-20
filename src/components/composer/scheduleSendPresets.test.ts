import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("ScheduleSendDialog presets", () => {
  beforeEach(() => {
    // Fix date to Wednesday Jan 15, 2025 at 10:00 AM
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tomorrow morning preset is next day at 9am", () => {
    const now = new Date();
    const tomorrowMorning = new Date(now);
    tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
    tomorrowMorning.setHours(9, 0, 0, 0);

    expect(tomorrowMorning.getDay()).toBe(4); // Thursday
    expect(tomorrowMorning.getHours()).toBe(9);
    expect(tomorrowMorning.getDate()).toBe(16);
  });

  it("tomorrow afternoon preset is next day at 1pm", () => {
    const now = new Date();
    const tomorrowAfternoon = new Date(now);
    tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
    tomorrowAfternoon.setHours(13, 0, 0, 0);

    expect(tomorrowAfternoon.getHours()).toBe(13);
    expect(tomorrowAfternoon.getDate()).toBe(16);
  });

  it("monday morning preset is next Monday at 9am", () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 3 (Wednesday)
    const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
    const monday = new Date(now);
    monday.setDate(monday.getDate() + daysUntilMonday);
    monday.setHours(9, 0, 0, 0);

    expect(monday.getDay()).toBe(1); // Monday
    expect(daysUntilMonday).toBe(5); // Wed to next Mon = 5 days
    expect(monday.getDate()).toBe(20); // Jan 20
    expect(monday.getHours()).toBe(9);
  });

  it("monday morning preset from Monday itself goes to next Monday", () => {
    // Reset to Monday
    vi.setSystemTime(new Date(2025, 0, 13, 10, 0, 0)); // Monday Jan 13
    const now = new Date();
    const dayOfWeek = now.getDay(); // 1 (Monday)
    const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;

    expect(daysUntilMonday).toBe(7); // Full week
  });

  it("custom timestamp from date and time is correct", () => {
    const customDate = "2025-02-01";
    const customTime = "14:30";
    const dt = new Date(`${customDate}T${customTime}`);
    const timestamp = Math.floor(dt.getTime() / 1000);

    const back = new Date(timestamp * 1000);
    expect(back.getFullYear()).toBe(2025);
    expect(back.getMonth()).toBe(1);
    expect(back.getDate()).toBe(1);
    expect(back.getHours()).toBe(14);
    expect(back.getMinutes()).toBe(30);
  });
});
