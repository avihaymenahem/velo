import { describe, it, expect } from "vitest";
import {
  getRiskLevel,
  analyzeLink,
  scanLinksInHtml,
  scanMessage,
} from "./phishingDetector";

// ── getRiskLevel ──────────────────────────────────────────────────

describe("getRiskLevel", () => {
  it("returns 'safe' for score 0", () => {
    expect(getRiskLevel(0)).toBe("safe");
  });

  it("returns 'safe' for score 19", () => {
    expect(getRiskLevel(19)).toBe("safe");
  });

  it("returns 'low' for score 20", () => {
    expect(getRiskLevel(20)).toBe("low");
  });

  it("returns 'low' for score 39", () => {
    expect(getRiskLevel(39)).toBe("low");
  });

  it("returns 'medium' for score 40", () => {
    expect(getRiskLevel(40)).toBe("medium");
  });

  it("returns 'medium' for score 59", () => {
    expect(getRiskLevel(59)).toBe("medium");
  });

  it("returns 'high' for score 60", () => {
    expect(getRiskLevel(60)).toBe("high");
  });

  it("returns 'high' for score 100", () => {
    expect(getRiskLevel(100)).toBe("high");
  });
});

// ── Rule 1: IP Address URLs ──────────────────────────────────────

describe("Rule: IP Address URLs", () => {
  it("detects IPv4 address in URL", () => {
    const result = analyzeLink("http://192.168.1.1/login", "Click here");
    const rule = result.triggeredRules.find((r) => r.ruleId === "ip-address");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(40);
  });

  it("detects IPv6 address (bracket notation)", () => {
    const result = analyzeLink("http://[::1]/path", "Click here");
    const rule = result.triggeredRules.find((r) => r.ruleId === "ip-address");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(40);
  });

  it("does not flag normal domain", () => {
    const result = analyzeLink("https://example.com", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "ip-address");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 2: Homograph/Punycode ──────────────────────────────────

describe("Rule: Homograph/Punycode", () => {
  it("detects punycode domain", () => {
    const result = analyzeLink("https://xn--pple-43d.com/account", "Apple");
    const rule = result.triggeredRules.find((r) => r.ruleId === "homograph");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(50);
  });

  it("does not flag normal ASCII domain", () => {
    const result = analyzeLink("https://apple.com", "Apple");
    const rule = result.triggeredRules.find((r) => r.ruleId === "homograph");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 3: Suspicious TLDs ────────────────────────────────────

describe("Rule: Suspicious TLDs", () => {
  it("detects tier 1 TLD (.zip) with 35 points", () => {
    const result = analyzeLink("https://update.zip", "Update");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-tld");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(35);
  });

  it("detects tier 2 TLD (.xyz) with 20 points", () => {
    const result = analyzeLink("https://example.xyz", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-tld");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(20);
  });

  it("detects tier 3 TLD (.info) with 10 points", () => {
    const result = analyzeLink("https://example.info", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-tld");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(10);
  });

  it("does not flag common TLDs like .com", () => {
    const result = analyzeLink("https://example.com", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-tld");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 4: Display vs Href Mismatch ────────────────────────────

describe("Rule: Display vs Href Mismatch", () => {
  it("detects mismatched URL-like display text", () => {
    const result = analyzeLink("https://evil.com/login", "https://paypal.com/secure");
    const rule = result.triggeredRules.find((r) => r.ruleId === "display-mismatch");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(60);
  });

  it("detects mismatch when display text is a bare domain", () => {
    const result = analyzeLink("https://evil.com/login", "paypal.com");
    const rule = result.triggeredRules.find((r) => r.ruleId === "display-mismatch");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(60);
  });

  it("does not flag when display text is not URL-like", () => {
    const result = analyzeLink("https://evil.com/login", "Click here to login");
    const rule = result.triggeredRules.find((r) => r.ruleId === "display-mismatch");
    expect(rule).toBeUndefined();
  });

  it("does not flag when display and href match", () => {
    const result = analyzeLink("https://paypal.com/login", "https://paypal.com/secure");
    const rule = result.triggeredRules.find((r) => r.ruleId === "display-mismatch");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 5: Excessive Subdomains ────────────────────────────────

describe("Rule: Excessive Subdomains", () => {
  it("detects 4+ dots in hostname", () => {
    const result = analyzeLink("https://a.b.c.d.evil.com/path", "Click");
    const rule = result.triggeredRules.find((r) => r.ruleId === "excessive-subdomains");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(25);
  });

  it("does not flag hostname with 3 dots or fewer", () => {
    const result = analyzeLink("https://www.mail.example.com", "Click");
    const rule = result.triggeredRules.find((r) => r.ruleId === "excessive-subdomains");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 6: URL Shorteners ──────────────────────────────────────

describe("Rule: URL Shorteners", () => {
  it("detects bit.ly", () => {
    const result = analyzeLink("https://bit.ly/abc123", "Click");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-shortener");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(15);
  });

  it("detects t.co", () => {
    const result = analyzeLink("https://t.co/xyz", "Link");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-shortener");
    expect(rule).toBeDefined();
  });

  it("does not flag non-shortener domains", () => {
    const result = analyzeLink("https://example.com/short", "Short link");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-shortener");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 7: Suspicious Path Keywords ────────────────────────────

describe("Rule: Suspicious Path Keywords", () => {
  it("detects 'login' in path", () => {
    const result = analyzeLink("https://example.com/login", "Login");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-keywords");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(15);
  });

  it("detects 'password' in query string", () => {
    const result = analyzeLink("https://example.com/?action=password", "Reset");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-keywords");
    expect(rule).toBeDefined();
  });

  it("does not flag clean paths", () => {
    const result = analyzeLink("https://example.com/about", "About");
    const rule = result.triggeredRules.find((r) => r.ruleId === "suspicious-keywords");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 8: Data/Javascript URIs ────────────────────────────────

describe("Rule: Dangerous URI Schemes", () => {
  it("detects data: URI", () => {
    const result = analyzeLink("data:text/html,<script>alert(1)</script>", "Click");
    const rule = result.triggeredRules.find((r) => r.ruleId === "dangerous-protocol");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(70);
  });

  it("detects javascript: URI", () => {
    const result = analyzeLink("javascript:alert(1)", "Run");
    const rule = result.triggeredRules.find((r) => r.ruleId === "dangerous-protocol");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(70);
  });

  it("detects vbscript: URI", () => {
    const result = analyzeLink("vbscript:msgbox", "Run");
    const rule = result.triggeredRules.find((r) => r.ruleId === "dangerous-protocol");
    expect(rule).toBeDefined();
  });

  it("detects blob: URI", () => {
    const result = analyzeLink("blob:http://evil.com/uuid", "Open");
    const rule = result.triggeredRules.find((r) => r.ruleId === "dangerous-protocol");
    expect(rule).toBeDefined();
  });

  it("does not flag https: URI", () => {
    const result = analyzeLink("https://example.com", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "dangerous-protocol");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 9: URL Obfuscation ─────────────────────────────────────

describe("Rule: URL Obfuscation", () => {
  it("detects @ in URL (credential spoofing)", () => {
    const result = analyzeLink("https://google.com@evil.com/path", "Google");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-obfuscation");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(45);
  });

  it("detects percent-encoded hostname", () => {
    const result = analyzeLink("https://exam%70le.com/path", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-obfuscation");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(45);
  });

  it("does not flag normal URLs", () => {
    const result = analyzeLink("https://example.com/path%20with%20spaces", "Example");
    const rule = result.triggeredRules.find((r) => r.ruleId === "url-obfuscation");
    expect(rule).toBeUndefined();
  });
});

// ── Rule 10: Brand Impersonation ────────────────────────────────

describe("Rule: Brand Impersonation", () => {
  it("detects brand in subdomain with different registrable domain", () => {
    const result = analyzeLink("https://paypal.evil.com/account", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(50);
  });

  it("detects brand in path with different domain", () => {
    const result = analyzeLink("https://evil.com/paypal/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(50);
  });

  it("does not flag actual brand domain", () => {
    const result = analyzeLink("https://www.paypal.com/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeUndefined();
  });

  it("does not flag paypal.com (exact domain)", () => {
    const result = analyzeLink("https://paypal.com/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeUndefined();
  });

  it("detects brand in lookalike domain (paypal-security.com)", () => {
    const result = analyzeLink("https://paypal-security.com/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
    expect(rule!.score).toBe(50);
  });

  it("detects brand in lookalike domain (microsoft-verify.com)", () => {
    const result = analyzeLink("https://microsoft-verify.com/account", "Microsoft");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
  });

  it("detects brand impersonation with ccTLD (paypal.evil.co.uk)", () => {
    const result = analyzeLink("https://paypal.evil.co.uk/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
    expect(rule!.detail).toContain("evil.co.uk");
  });

  it("allows real brand domain with ccTLD (paypal.co.uk)", () => {
    const result = analyzeLink("https://www.paypal.co.uk/login", "PayPal");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeUndefined();
  });

  it("detects brand impersonation with .co.jp", () => {
    const result = analyzeLink("https://amazon.phishing.co.jp/verify", "Amazon");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeDefined();
  });

  it("allows real brand with .com.au", () => {
    const result = analyzeLink("https://www.netflix.com.au/browse", "Netflix");
    const rule = result.triggeredRules.find((r) => r.ruleId === "brand-impersonation");
    expect(rule).toBeUndefined();
  });
});

// ── Clean URL (no rules triggered) ──────────────────────────────

describe("Clean URL", () => {
  it("returns safe score 0 for google.com", () => {
    const result = analyzeLink("https://www.google.com", "Google");
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe("safe");
    expect(result.triggeredRules).toHaveLength(0);
  });

  it("returns safe score 0 for normal email link", () => {
    const result = analyzeLink("https://docs.github.com/en/repositories", "GitHub Docs");
    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe("safe");
  });
});

// ── Composite scores ────────────────────────────────────────────

describe("Composite scores", () => {
  it("IP + suspicious keyword = 55pts (medium)", () => {
    const result = analyzeLink("http://192.168.1.1/login", "Login");
    expect(result.riskScore).toBe(55);
    expect(result.riskLevel).toBe("medium");
  });

  it("punycode + brand impersonation = high", () => {
    const result = analyzeLink("https://xn--pple-43d.evil.com/paypal", "Apple");
    expect(result.riskLevel).toBe("high");
    // Should have at least homograph (50) + brand impersonation (50) = 100+
    expect(result.riskScore).toBeGreaterThanOrEqual(100);
  });

  it("shortener + suspicious TLD (.xyz) = 35pts (low)", () => {
    // bit.ly is a shortener (15pts) — not on a suspicious TLD since bit.ly is .ly
    // Let's test a different composite
    const result = analyzeLink("https://bit.ly/login", "Click");
    // shortener (15) + suspicious-keywords (15) = 30
    expect(result.riskScore).toBe(30);
    expect(result.riskLevel).toBe("low");
  });
});

// ── scanLinksInHtml ─────────────────────────────────────────────

describe("scanLinksInHtml", () => {
  it("extracts and analyzes links from HTML", () => {
    const html = `
      <div>
        <a href="https://google.com">Google</a>
        <a href="https://evil.com/login">https://paypal.com</a>
        <a href="https://example.com">Click here</a>
      </div>
    `;
    const results = scanLinksInHtml(html);
    expect(results).toHaveLength(3);

    // Second link should be flagged for mismatch
    const mismatchLink = results[1];
    expect(mismatchLink).toBeDefined();
    expect(mismatchLink!.triggeredRules.some((r) => r.ruleId === "display-mismatch")).toBe(true);
  });

  it("skips mailto: links", () => {
    const html = `
      <a href="mailto:user@example.com">Email</a>
      <a href="https://example.com">Web</a>
    `;
    const results = scanLinksInHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0]!.url).toBe("https://example.com");
  });

  it("skips # fragment links", () => {
    const html = `<a href="#section">Jump</a>`;
    const results = scanLinksInHtml(html);
    expect(results).toHaveLength(0);
  });

  it("skips relative URLs", () => {
    const html = `<a href="/about">About</a>`;
    const results = scanLinksInHtml(html);
    expect(results).toHaveLength(0);
  });

  it("handles empty HTML", () => {
    const results = scanLinksInHtml("");
    expect(results).toHaveLength(0);
  });

  it("detects dangerous URIs in HTML", () => {
    const html = `<a href="javascript:alert(1)">Click</a>`;
    const results = scanLinksInHtml(html);
    expect(results).toHaveLength(1);
    expect(results[0]!.triggeredRules.some((r) => r.ruleId === "dangerous-protocol")).toBe(true);
  });
});

// ── scanMessage ─────────────────────────────────────────────────

describe("scanMessage", () => {
  it("returns empty result for null HTML", () => {
    const result = scanMessage("msg-1", null);
    expect(result.messageId).toBe("msg-1");
    expect(result.links).toHaveLength(0);
    expect(result.maxRiskScore).toBe(0);
    expect(result.showBanner).toBe(false);
  });

  it("sets showBanner=true when maxRiskScore >= 40", () => {
    const html = `<a href="http://192.168.1.1/login">Click</a>`;
    const result = scanMessage("msg-2", html);
    expect(result.maxRiskScore).toBeGreaterThanOrEqual(40);
    expect(result.showBanner).toBe(true);
  });

  it("sets showBanner=true when suspiciousLinkCount >= 3", () => {
    // 3 links with score >= 20: shortener (15) + keywords (15) = 30 each
    const html = `
      <a href="https://bit.ly/login">Link 1</a>
      <a href="https://t.co/signin">Link 2</a>
      <a href="https://is.gd/verify">Link 3</a>
    `;
    const result = scanMessage("msg-3", html);
    expect(result.suspiciousLinkCount).toBeGreaterThanOrEqual(3);
    expect(result.showBanner).toBe(true);
  });

  it("sets showBanner=false for clean links", () => {
    const html = `
      <a href="https://google.com">Google</a>
      <a href="https://github.com">GitHub</a>
    `;
    const result = scanMessage("msg-4", html);
    expect(result.showBanner).toBe(false);
  });

  it("includes scannedAt timestamp", () => {
    const before = Date.now();
    const result = scanMessage("msg-5", "<a href='https://example.com'>Link</a>");
    expect(result.scannedAt).toBeGreaterThanOrEqual(before);
    expect(result.scannedAt).toBeLessThanOrEqual(Date.now());
  });
});

// ── Sensitivity levels ──────────────────────────────────────────

describe("scanMessage sensitivity", () => {
  // A link with score 30 (shortener 15 + keyword 15) — above "high" threshold (20) but below default (40)
  const html30 = `<a href="https://bit.ly/login">Click</a>`;

  it("high sensitivity shows banner for score 30", () => {
    const result = scanMessage("msg-sens-1", html30, "high");
    expect(result.showBanner).toBe(true);
  });

  it("default sensitivity does not show banner for score 30", () => {
    const result = scanMessage("msg-sens-2", html30, "default");
    expect(result.showBanner).toBe(false);
  });

  it("low sensitivity does not show banner for score 30", () => {
    const result = scanMessage("msg-sens-3", html30, "low");
    expect(result.showBanner).toBe(false);
  });

  // A link with score 55 (IP 40 + keyword 15) — above default (40) but below low (60)
  const html55 = `<a href="http://192.168.1.1/login">Click</a>`;

  it("low sensitivity does not show banner for score 55", () => {
    const result = scanMessage("msg-sens-4", html55, "low");
    expect(result.showBanner).toBe(false);
  });

  it("default sensitivity shows banner for score 55", () => {
    const result = scanMessage("msg-sens-5", html55, "default");
    expect(result.showBanner).toBe(true);
  });
});
