import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeDate } from "./date";

describe("formatRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats yesterday using the requested locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));

    const yesterday = new Date("2026-06-01T12:00:00Z").getTime();

    expect(formatRelativeDate(yesterday, "zh-CN")).toBe("昨天");
    expect(formatRelativeDate(yesterday, "en-US")).toBe("yesterday");
  });

  it("formats recent weekdays using the requested locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));

    const lastFriday = new Date("2026-05-29T12:00:00Z").getTime();

    expect(formatRelativeDate(lastFriday, "zh-CN")).toBe("周五");
    expect(formatRelativeDate(lastFriday, "en-US")).toBe("Fri");
  });
});
