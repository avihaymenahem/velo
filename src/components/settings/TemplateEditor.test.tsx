import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { TemplateEditor } from "./TemplateEditor";

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    commands: { setContent: vi.fn() },
    getHTML: vi.fn(() => "<p>template</p>"),
    chain: vi.fn(() => ({
      focus: vi.fn().mockReturnThis(),
      insertContent: vi.fn().mockReturnThis(),
      run: vi.fn(),
    })),
    can: vi.fn(() => ({
      chain: vi.fn(() => ({
        focus: vi.fn().mockReturnThis(),
        undo: vi.fn().mockReturnThis(),
        run: vi.fn(() => true),
      })),
    })),
    isActive: vi.fn(() => false),
  })),
  EditorContent: vi.fn(() => <div data-testid="editor-content">Editor</div>),
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-placeholder", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-image", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@/components/composer/EditorToolbar", () => ({
  EditorToolbar: vi.fn(() => <div data-testid="editor-toolbar">Toolbar</div>),
}));

vi.mock("@/services/db/templates", () => ({
  getTemplatesForAccount: vi.fn(() => Promise.resolve([])),
  insertTemplate: vi.fn(() => Promise.resolve("tmpl-1")),
  updateTemplate: vi.fn(() => Promise.resolve()),
  deleteTemplate: vi.fn(() => Promise.resolve()),
}));

describe("TemplateEditor", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({ activeAccountId: "acc-1" });
  });

  it("renders template editor chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<TemplateEditor />);

    fireEvent.click(screen.getByText("+ 添加模板"));

    expect(screen.getByPlaceholderText("模板名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("主题（可选）")).toBeInTheDocument();
    expect(screen.getByText("插入变量")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("快捷短语（可选，例如 /thanks）")).toBeInTheDocument();
    expect(screen.getByText("保存")).toBeDisabled();
    expect(screen.getByText("取消")).toBeInTheDocument();

    fireEvent.click(screen.getByText("插入变量"));

    expect(screen.getByText("收件人的名字")).toBeInTheDocument();
  });
});
