import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useComposerStore } from "@/stores/composerStore";
import { getTemplatesForAccount } from "@/services/db/templates";
import { TemplatePicker } from "./TemplatePicker";

vi.mock("@/services/db/templates", () => ({
  getTemplatesForAccount: vi.fn(() => Promise.resolve([])),
}));

describe("TemplatePicker", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    vi.clearAllMocks();
    useAccountStore.setState({ activeAccountId: "acc-1" });
    useComposerStore.setState({
      mode: "new",
      subject: "",
    });
  });

  it("renders template picker chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    vi.mocked(getTemplatesForAccount).mockResolvedValue([
      {
        id: "tmpl-1",
        account_id: "acc-1",
        name: "跟进",
        subject: null,
        body_html: "<p>你好</p>",
        shortcut: null,
        sort_order: 0,
        created_at: 1,
        updated_at: 1,
      },
    ]);

    render(<TemplatePicker editor={null} />);

    expect(await screen.findByText("模板")).toBeInTheDocument();
    expect(screen.queryByText("Templates")).not.toBeInTheDocument();
  });

  it("inserts template variables with the active locale", async () => {
    await i18n.changeLanguage("zh-CN");
    const now = new Date();
    const expectedDay = now.toLocaleDateString("zh-CN", { weekday: "long" });
    const expectedDate = now.toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const insertContent = vi.fn();
    vi.mocked(getTemplatesForAccount).mockResolvedValue([
      {
        id: "tmpl-1",
        account_id: "acc-1",
        name: "日期模板",
        subject: null,
        body_html: "<p>{{day}} {{date}}</p>",
        shortcut: null,
        sort_order: 0,
        created_at: 1,
        updated_at: 1,
      },
    ]);

    render(<TemplatePicker editor={{ commands: { insertContent } } as never} />);

    fireEvent.click(await screen.findByText("模板"));
    fireEvent.click(screen.getByText("日期模板"));

    await waitFor(() => {
      expect(insertContent).toHaveBeenCalledWith(`<p>${expectedDay} ${expectedDate}</p>`);
    });
    expect(insertContent).not.toHaveBeenCalledWith(expect.stringContaining("Tuesday"));
    expect(insertContent).not.toHaveBeenCalledWith(expect.stringContaining("June"));
  });
});
