import { render, screen, waitFor } from "@testing-library/react";
import { TitleBar } from "./TitleBar";
import i18n from "@/i18n";

const { mockWindow } = vi.hoisted(() => ({
  mockWindow: {
    isMaximized: vi.fn(),
    onResized: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => mockWindow,
}));

describe("TitleBar", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockWindow.isMaximized.mockResolvedValue(false);
    mockWindow.onResized.mockResolvedValue(vi.fn());
    await i18n.changeLanguage("en");
  });

  it("localizes window control titles in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<TitleBar />);

    expect(screen.getByTitle("最小化")).toBeInTheDocument();
    expect(screen.getByTitle("最大化")).toBeInTheDocument();
    expect(screen.getByTitle("关闭")).toBeInTheDocument();
    expect(screen.queryByTitle("Minimize")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Maximize")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
  });

  it("localizes the restore title when the window is maximized", async () => {
    await i18n.changeLanguage("zh-CN");
    mockWindow.isMaximized.mockResolvedValue(true);

    render(<TitleBar />);

    await waitFor(() => {
      expect(screen.getByTitle("还原")).toBeInTheDocument();
    });
    expect(screen.queryByTitle("Restore")).not.toBeInTheDocument();
  });
});
