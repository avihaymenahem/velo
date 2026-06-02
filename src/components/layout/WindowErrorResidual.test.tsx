import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import ThreadWindow from "@/ThreadWindow";
import ComposerWindow from "@/ComposerWindow";
import { runMigrations } from "@/services/db/migrations";
import { getAllAccounts } from "@/services/db/accounts";
import { getSetting } from "@/services/db/settings";
import { initializeClients } from "@/services/gmail/tokenManager";
import { getThreadById, getThreadLabelIds } from "@/services/db/threads";

vi.mock("@/components/email/ThreadView", () => ({
  ThreadView: () => <div data-testid="thread-view" />,
}));

vi.mock("@/components/composer/Composer", () => ({
  Composer: () => <div data-testid="composer" />,
}));

vi.mock("@/components/composer/UndoSendToast", () => ({
  UndoSendToast: () => null,
}));

vi.mock("@/services/db/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/services/db/accounts", () => ({
  getAllAccounts: vi.fn(),
}));

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  initializeClients: vi.fn(),
}));

vi.mock("@/services/db/threads", () => ({
  getThreadById: vi.fn(),
  getThreadLabelIds: vi.fn(),
}));

describe("independent window error i18n", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.mocked(runMigrations).mockResolvedValue(undefined);
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getAllAccounts).mockResolvedValue([]);
    vi.mocked(initializeClients).mockResolvedValue(undefined);
    vi.mocked(getThreadById).mockResolvedValue(null);
    vi.mocked(getThreadLabelIds).mockResolvedValue([]);
    await i18n.changeLanguage("zh-CN");
  });

  it("localizes missing thread window URL parameters", () => {
    window.history.replaceState(null, "", "/");

    render(<ThreadWindow />);

    expect(screen.getByText("缺少线程或账户参数")).toBeInTheDocument();
    expect(screen.queryByText("Missing thread or account parameter")).not.toBeInTheDocument();
  });

  it("localizes missing thread data", async () => {
    window.history.replaceState(null, "", "/?thread=thread-1&account=account-1");

    render(<ThreadWindow />);

    expect(await screen.findByText("未找到线程")).toBeInTheDocument();
    expect(screen.queryByText("Thread not found")).not.toBeInTheDocument();
  });

  it("localizes thread window initialization failures", async () => {
    vi.mocked(runMigrations).mockRejectedValueOnce(new Error("migration failed"));
    window.history.replaceState(null, "", "/?thread=thread-1&account=account-1");

    render(<ThreadWindow />);

    expect(await screen.findByText("无法加载线程")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load thread")).not.toBeInTheDocument();
  });

  it("localizes composer window initialization failures", async () => {
    vi.mocked(runMigrations).mockRejectedValueOnce(new Error("migration failed"));
    window.history.replaceState(null, "", "/?compose=1");

    render(<ComposerWindow />);

    expect(await screen.findByText("无法加载写信窗口")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load composer")).not.toBeInTheDocument();
  });
});
