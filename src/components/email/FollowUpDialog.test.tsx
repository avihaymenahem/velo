import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { FollowUpDialog } from "./FollowUpDialog";

describe("FollowUpDialog", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders follow-up reminder chrome in Simplified Chinese without changing preset timestamps", async () => {
    await i18n.changeLanguage("zh-CN");
    const onSetReminder = vi.fn();

    render(<FollowUpDialog onSetReminder={onSetReminder} onClose={vi.fn()} />);

    expect(screen.getByText("未回复时提醒我...")).toBeInTheDocument();
    expect(screen.getByText("1 天后")).toBeInTheDocument();
    expect(screen.getByText("2 天后")).toBeInTheDocument();
    expect(screen.getByText("3 天后")).toBeInTheDocument();
    expect(screen.getByText("1 周后")).toBeInTheDocument();
    expect(screen.getByText("设置提醒")).toBeInTheDocument();
    expect(screen.queryByText("Remind me if no reply...")).not.toBeInTheDocument();
    expect(screen.queryByText("Set reminder")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("2 天后"));

    const expected = new Date(2025, 0, 17, 9, 0, 0);
    expect(onSetReminder).toHaveBeenCalledWith(Math.floor(expected.getTime() / 1000));
  });
});
