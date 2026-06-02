import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { PhishingBanner } from "@/components/email/PhishingBanner";
import { MoveToFolderDialog } from "@/components/email/MoveToFolderDialog";
import type { MessageScanResult } from "@/utils/phishingDetector";

vi.mock("@/stores/labelStore", () => ({
  useLabelStore: vi.fn((selector: (state: {
    labels: Array<{
      id: string;
      name: string;
      accountId: string;
      type: string;
      colorBg: string | null;
      colorFg: string | null;
      sortOrder: number;
    }>;
  }) => unknown) =>
    selector({
      labels: [
        { id: "label-1", name: "Work", accountId: "acc-1", type: "user", colorBg: null, colorFg: null, sortOrder: 0 },
      ],
    }),
  ),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: vi.fn((selector: (state: {
    activeAccountId: string;
    accounts: Array<{ id: string; provider?: string }>;
  }) => unknown) =>
    selector({
      activeAccountId: "acc-1",
      accounts: [{ id: "acc-1", provider: "gmail_api" }],
    }),
  ),
}));

vi.mock("@/stores/threadStore", () => ({
  useThreadStore: Object.assign(vi.fn(() => ({})), {
    getState: () => ({
      threads: [{ id: "thread-1", labelIds: ["INBOX"] }],
    }),
  }),
}));

vi.mock("@/services/emailActions", () => ({
  archiveThread: vi.fn(async () => ({ success: true })),
  trashThread: vi.fn(async () => ({ success: true })),
  spamThread: vi.fn(async () => ({ success: true })),
  addThreadLabel: vi.fn(async () => ({ success: true })),
  removeThreadLabel: vi.fn(async () => ({ success: true })),
  moveThread: vi.fn(async () => ({ success: true })),
}));

vi.mock("react-transition-group", () => ({
  CSSTransition: ({ in: inProp, children, unmountOnExit, onEntered }: {
    in: boolean;
    children: React.ReactNode;
    unmountOnExit?: boolean;
    onEntered?: () => void;
  }) => {
    if (!inProp && unmountOnExit) return null;
    if (inProp && onEntered) setTimeout(onEntered, 0);
    return <>{children}</>;
  },
}));

function makeScan(overrides: Partial<MessageScanResult> = {}): MessageScanResult {
  return {
    links: [],
    suspiciousLinks: [],
    suspiciousLinkCount: 2,
    maxRiskScore: 80,
    hasHighRiskLinks: true,
    ...overrides,
  };
}

describe("security and move chrome i18n residuals", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes phishing warning chrome", () => {
    render(<PhishingBanner scanResult={makeScan()} onTrustSender={vi.fn()} />);

    expect(screen.getByText("检测到高风险链接")).toBeInTheDocument();
    expect(screen.getByText("此邮件中发现 2 个可疑链接。点击任何链接前请谨慎。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "信任此发件人" })).toBeInTheDocument();
  });

  it("localizes singular suspicious phishing warning chrome", () => {
    render(
      <PhishingBanner
        scanResult={makeScan({ suspiciousLinkCount: 1, maxRiskScore: 30, hasHighRiskLinks: false })}
        onTrustSender={vi.fn()}
      />,
    );

    expect(screen.getByText("检测到可疑链接")).toBeInTheDocument();
    expect(screen.getByText("此邮件中发现 1 个可疑链接。点击任何链接前请谨慎。")).toBeInTheDocument();
  });

  it("localizes move dialog system destinations, hints, and empty state", () => {
    render(<MoveToFolderDialog isOpen threadIds={["thread-1"]} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText("移动到...")).toBeInTheDocument();
    expect(screen.getByText("收件箱")).toBeInTheDocument();
    expect(screen.getByText("归档")).toBeInTheDocument();
    expect(screen.getByText("废纸篓")).toBeInTheDocument();
    expect(screen.getByText("垃圾邮件")).toBeInTheDocument();
    expect(screen.getAllByText("系统")).toHaveLength(4);
    expect(screen.getByText("导航")).toBeInTheDocument();
    expect(screen.getByText("选择")).toBeInTheDocument();
    expect(screen.getByText("关闭")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("移动到..."), {
      target: { value: "missing" },
    });

    expect(screen.getByText("没有匹配的文件夹或标签")).toBeInTheDocument();
  });
});
