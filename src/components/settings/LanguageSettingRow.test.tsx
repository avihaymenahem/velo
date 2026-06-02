import i18n from "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageSettingRow } from "./SettingsPage";
import type { LanguagePreference } from "@/i18n/language";

describe("LanguageSettingRow", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders language options and emits the selected preference", () => {
    const onChange = vi.fn();

    render(<LanguageSettingRow value="system" onChange={onChange} />);

    const select = screen.getByLabelText("Language");
    expect(select).toHaveValue("system");
    expect(screen.getByRole("option", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Simplified Chinese" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "zh-CN" satisfies LanguagePreference } });

    expect(onChange).toHaveBeenCalledWith("zh-CN");
  });

  it("renders Chinese labels when the active app language is Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<LanguageSettingRow value="zh-CN" onChange={vi.fn()} />);

    expect(screen.getByLabelText("语言")).toHaveValue("zh-CN");
    expect(screen.getByRole("option", { name: "跟随系统" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeInTheDocument();
  });
});
