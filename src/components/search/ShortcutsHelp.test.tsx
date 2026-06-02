import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import { getDefaultKeyMap } from "@/constants/shortcuts";
import { useShortcutStore } from "@/stores/shortcutStore";
import { ShortcutsHelp } from "./ShortcutsHelp";

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(() => Promise.resolve(null)),
  setSetting: vi.fn(() => Promise.resolve()),
}));

describe("ShortcutsHelp", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useShortcutStore.setState({ keyMap: getDefaultKeyMap() });
  });

  it("renders shortcuts help in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<ShortcutsHelp isOpen onClose={vi.fn()} />);

    expect(screen.getByText("键盘快捷键")).toBeInTheDocument();
    expect(screen.getByText("导航")).toBeInTheDocument();
    expect(screen.getByText("下一封线程")).toBeInTheDocument();
    expect(screen.getByText("写新邮件")).toBeInTheDocument();
    expect(screen.queryByText("Keyboard Shortcuts")).not.toBeInTheDocument();
    expect(screen.queryByText("Navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Next thread")).not.toBeInTheDocument();
  });
});
