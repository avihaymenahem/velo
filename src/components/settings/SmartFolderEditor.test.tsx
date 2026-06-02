import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { useSmartFolderStore } from "@/stores/smartFolderStore";
import { SmartFolderEditor } from "./SmartFolderEditor";

vi.mock("@/services/db/smartFolders", () => ({
  getSmartFolders: vi.fn(() => Promise.resolve([])),
  insertSmartFolder: vi.fn(() => Promise.resolve("folder-1")),
  updateSmartFolder: vi.fn(() => Promise.resolve()),
  deleteSmartFolder: vi.fn(() => Promise.resolve()),
}));

describe("SmartFolderEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({ activeAccountId: "acc-1" });
    useSmartFolderStore.setState({ loadFolders: vi.fn() });
  });

  it("renders smart folder editor chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<SmartFolderEditor />);

    fireEvent.click(screen.getByText("+ 添加智能文件夹"));

    expect(screen.getByPlaceholderText("文件夹名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("搜索查询（例如 is:unread from:boss）")).toBeInTheDocument();
    expect(screen.getByText("图标名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例如 Search")).toBeInTheDocument();
    expect(screen.getByText("可用图标：Search、MailOpen、Paperclip、Star、FolderSearch、Inbox、Clock、Tag")).toBeInTheDocument();
    expect(screen.queryByText("Search、MailOpen、Paperclip、Star、FolderSearch、Inbox、Clock、Tag")).not.toBeInTheDocument();
    expect(screen.getByText("颜色（可选）")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeDisabled();
    expect(screen.getByText("取消")).toBeInTheDocument();
  });
});
