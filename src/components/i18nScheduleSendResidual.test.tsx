import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ScheduleSendDialog } from "@/components/composer/ScheduleSendDialog";

describe("schedule send i18n residuals", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await i18n.changeLanguage("en");
  });

  it("localizes preset detail dates without AM/PM in Simplified Chinese", () => {
    render(<ScheduleSendDialog onSchedule={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("1月16日周四 9:00")).toBeInTheDocument();
    expect(screen.getByText("1月16日周四 13:00")).toBeInTheDocument();
    expect(screen.getByText("1月20日周一 9:00")).toBeInTheDocument();
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();
  });
});
