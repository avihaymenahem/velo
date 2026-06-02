import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { LinkConfirmDialog } from "@/components/email/LinkConfirmDialog";
import type { LinkAnalysis } from "@/utils/phishingDetector";

function renderDialog(overrides: Partial<LinkAnalysis> = {}) {
  const linkAnalysis: LinkAnalysis = {
    url: "https://evil.com/login",
    displayText: "paypal.com",
    riskScore: 150,
    riskLevel: "high",
    triggeredRules: [
      {
        ruleId: "ip-address",
        name: "IP Address URL",
        score: 40,
        detail: "URL points to raw IP address: 192.168.1.1",
      },
      {
        ruleId: "display-mismatch",
        name: "Display vs URL Mismatch",
        score: 60,
        detail: 'Link text shows "paypal.com" but points to "evil.com"',
      },
      {
        ruleId: "brand-impersonation",
        name: "Brand Impersonation",
        score: 50,
        detail: '"paypal" appears in URL but domain is evil.com',
      },
      ...(overrides.triggeredRules ?? []),
    ],
    ...overrides,
  };

  render(
    <LinkConfirmDialog
      linkAnalysis={linkAnalysis}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
}

describe("phishing rule i18n residuals", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("localizes known phishing rule names and details", () => {
    renderDialog();

    expect(screen.getByText("原始 IP 地址 URL")).toBeInTheDocument();
    expect(screen.getByText("URL 指向原始 IP 地址：192.168.1.1")).toBeInTheDocument();
    expect(screen.getByText("显示文本与实际 URL 不一致")).toBeInTheDocument();
    expect(screen.getByText('链接文本显示 "paypal.com"，但实际指向 "evil.com"')).toBeInTheDocument();
    expect(screen.getByText("品牌仿冒")).toBeInTheDocument();
    expect(screen.getByText('"paypal" 出现在 URL 中，但实际域名是 evil.com')).toBeInTheDocument();

    expect(screen.queryByText("IP Address URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Display vs URL Mismatch")).not.toBeInTheDocument();
    expect(screen.queryByText("Brand Impersonation")).not.toBeInTheDocument();
  });

  it("preserves custom phishing rule fallback text", () => {
    renderDialog({
      triggeredRules: [
        {
          ruleId: "custom-rule",
          name: "Custom Rule",
          score: 20,
          detail: "Custom detail from detector",
        },
      ],
      riskScore: 20,
      riskLevel: "low",
    });

    expect(screen.getByText("Custom Rule")).toBeInTheDocument();
    expect(screen.getByText("Custom detail from detector")).toBeInTheDocument();
  });
});
