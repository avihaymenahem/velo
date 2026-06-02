import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import i18n from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { SubscriptionManager } from "./SubscriptionManager";

vi.mock("@/services/unsubscribe/unsubscribeManager", () => ({
  getSubscriptions: vi.fn(() => Promise.resolve([])),
  executeUnsubscribe: vi.fn(() => Promise.resolve({ method: "http_post", success: true })),
  parseUnsubscribeHeaders: vi.fn(() => ({
    httpUrl: null,
    mailtoAddress: null,
    hasOneClick: false,
  })),
}));

describe("SubscriptionManager", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useAccountStore.setState({ activeAccountId: "acc-1" });
  });

  it("renders subscription manager chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    render(<SubscriptionManager />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("搜索发件人...")).toBeInTheDocument();
    });

    expect(screen.getByText("检测到 0 个带退订头的发件人。")).toBeInTheDocument();
    expect(screen.getByText("还没有检测到订阅。同步邮件后，带退订信息的发件人会显示在这里。")).toBeInTheDocument();
  });
});
