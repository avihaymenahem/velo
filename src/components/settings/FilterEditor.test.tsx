import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { FilterEditor } from "./FilterEditor";

vi.mock("@/services/db/labels", () => ({
  getLabelsForAccount: vi.fn(() =>
    Promise.resolve([
      { id: "label-work", name: "Work", type: "user", account_id: "acc-1" },
    ]),
  ),
}));

vi.mock("@/services/db/filters", () => ({
  getFiltersForAccount: vi.fn(() => Promise.resolve([])),
  insertFilter: vi.fn(() => Promise.resolve("filter-1")),
  updateFilter: vi.fn(() => Promise.resolve()),
  deleteFilter: vi.fn(() => Promise.resolve()),
}));

describe("FilterEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({ activeAccountId: "acc-1" });
  });

  it("renders filter editor chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<FilterEditor />);

    fireEvent.click(screen.getByText("+ 添加过滤器"));

    expect(screen.getByPlaceholderText("过滤器名称")).toBeInTheDocument();
    expect(screen.getByText("匹配条件")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("发件人包含...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("主题包含...")).toBeInTheDocument();
    expect(screen.getByText("包含附件")).toBeInTheDocument();
    expect(screen.getByText("动作")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("应用标签")).toBeInTheDocument();
    });

    expect(screen.getByText("无")).toBeInTheDocument();
    expect(screen.getByText("归档")).toBeInTheDocument();
    expect(screen.getByText("标星")).toBeInTheDocument();
    expect(screen.getByText("标记为已读")).toBeInTheDocument();
    expect(screen.getByText("移到废纸篓")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeDisabled();
    expect(screen.getByText("取消")).toBeInTheDocument();
  });
});
