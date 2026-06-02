import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import ThreadWindow from "@/ThreadWindow";
import ComposerWindow from "@/ComposerWindow";

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
  runMigrations: vi.fn(() => new Promise(() => undefined)),
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

describe("independent window loading i18n", () => {
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
    await i18n.changeLanguage("zh-CN");
    window.history.replaceState(null, "", "/?thread=thread-1&account=account-1");
  });

  it("localizes thread pop-out loading copy", () => {
    render(<ThreadWindow />);

    expect(screen.getByText("正在加载线程...")).toBeInTheDocument();
    expect(screen.queryByText("Loading thread...")).not.toBeInTheDocument();
  });

  it("localizes composer pop-out loading copy", () => {
    window.history.replaceState(null, "", "/?compose=1");

    render(<ComposerWindow />);

    expect(screen.getByText("正在加载写信窗口...")).toBeInTheDocument();
    expect(screen.queryByText("Loading composer...")).not.toBeInTheDocument();
  });
});
