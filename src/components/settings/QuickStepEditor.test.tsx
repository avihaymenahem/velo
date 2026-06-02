import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { QuickStepEditor } from "./QuickStepEditor";

vi.mock("@/services/db/labels", () => ({
  getLabelsForAccount: vi.fn(() =>
    Promise.resolve([
      { id: "label-work", name: "Work", type: "user", account_id: "acc-1" },
    ]),
  ),
}));

vi.mock("@/services/db/quickSteps", () => ({
  getQuickStepsForAccount: vi.fn(() => Promise.resolve([])),
  insertQuickStep: vi.fn(() => Promise.resolve("quick-step-1")),
  updateQuickStep: vi.fn(() => Promise.resolve()),
  deleteQuickStep: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/quickSteps/defaults", () => ({
  seedDefaultQuickSteps: vi.fn(() => Promise.resolve()),
}));

describe("QuickStepEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({ activeAccountId: "acc-1" });
  });

  it("renders quick step editor chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<QuickStepEditor />);

    fireEvent.click(await screen.findByText("+ 添加快捷步骤"));

    expect(screen.getByPlaceholderText("快捷步骤名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("描述（可选）")).toBeInTheDocument();
    expect(screen.getByText("快捷键（可选）")).toBeInTheDocument();
    expect(screen.getByText("图标（可选）")).toBeInTheDocument();
    expect(screen.getByText("动作链")).toBeInTheDocument();
    expect(screen.getByText("添加动作")).toBeInTheDocument();
    expect(screen.getByText("遇到错误继续执行（即使某个动作失败也继续运行后续动作）")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeDisabled();
    expect(screen.getByText("取消")).toBeInTheDocument();

    fireEvent.click(screen.getByText("添加动作"));

    expect(screen.getByText("归档")).toBeInTheDocument();
  });
});
