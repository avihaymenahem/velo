import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import i18n from "@/i18n";
import { AddressInput } from "@/components/composer/AddressInput";
import { EditorToolbar } from "@/components/composer/EditorToolbar";
import { ScheduleSendDialog } from "@/components/composer/ScheduleSendDialog";

vi.mock("@/services/db/contacts", () => ({
  searchContacts: vi.fn(async () => []),
}));

function makeEditor(): Editor {
  const run = vi.fn();
  const command = { run };
  const focused = {
    toggleBold: () => command,
    toggleItalic: () => command,
    toggleUnderline: () => command,
    toggleStrike: () => command,
    toggleHeading: () => command,
    toggleBulletList: () => command,
    toggleOrderedList: () => command,
    toggleBlockquote: () => command,
    toggleCodeBlock: () => command,
    setHorizontalRule: () => command,
    unsetLink: () => command,
    setLink: () => command,
    setImage: () => command,
    undo: () => command,
    redo: () => command,
  };

  return {
    isActive: vi.fn(() => false),
    chain: () => ({
      focus: () => focused,
    }),
  } as unknown as Editor;
}

describe("composer chrome i18n residuals", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-CN");
  });

  it("localizes address input default placeholder", () => {
    render(<AddressInput label="收件人" addresses={[]} onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText("添加收件人...")).toBeInTheDocument();
  });

  it("localizes editor toolbar titles and insert-link dialog chrome", () => {
    render(
      <EditorToolbar
        editor={makeEditor()}
        onToggleAiAssist={vi.fn()}
        aiAssistOpen={false}
      />,
    );

    expect(screen.getByTitle("加粗 (Ctrl+B)")).toBeInTheDocument();
    expect(screen.getByTitle("斜体 (Ctrl+I)")).toBeInTheDocument();
    expect(screen.getByTitle("下划线 (Ctrl+U)")).toBeInTheDocument();
    expect(screen.getByTitle("删除线")).toBeInTheDocument();
    expect(screen.getByTitle("一级标题")).toBeInTheDocument();
    expect(screen.getByTitle("项目符号列表")).toBeInTheDocument();
    expect(screen.getByTitle("编号列表")).toBeInTheDocument();
    expect(screen.getByTitle("引用")).toBeInTheDocument();
    expect(screen.getByTitle("代码块")).toBeInTheDocument();
    expect(screen.getByTitle("分割线")).toBeInTheDocument();
    expect(screen.getByTitle("插入图片")).toBeInTheDocument();
    expect(screen.getByTitle("AI 辅助")).toBeInTheDocument();
    expect(screen.getByTitle("撤销")).toBeInTheDocument();
    expect(screen.getByTitle("重做")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("插入链接"));

    expect(screen.getByText("插入链接")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "插入" })).toBeInTheDocument();
  });

  it("localizes schedule send dialog chrome", () => {
    render(<ScheduleSendDialog onSchedule={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "定时发送" })).toBeInTheDocument();
    expect(screen.getByText("明天上午")).toBeInTheDocument();
    expect(screen.getByText("明天下午")).toBeInTheDocument();
    expect(screen.getByText("周一上午")).toBeInTheDocument();
    expect(screen.getByText("自定义日期和时间")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "定时发送" })).toBeInTheDocument();
  });
});
