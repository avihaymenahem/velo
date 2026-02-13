import { describe, it, expect } from "vitest";
import { parseAuthenticationResults } from "./authParser";

function makeHeaders(
  ...entries: { name: string; value: string }[]
): { name: string; value: string }[] {
  return entries;
}

describe("parseAuthenticationResults", () => {
  it("should parse full pass (spf=pass, dkim=pass, dmarc=pass)", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value:
        "mx.google.com; spf=pass (google.com: domain of sender@example.com) smtp.mailfrom=sender@example.com; dkim=pass header.d=example.com; dmarc=pass (p=REJECT) header.from=example.com",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("pass");
    expect(result!.dkim.result).toBe("pass");
    expect(result!.dmarc.result).toBe("pass");
    expect(result!.aggregate).toBe("pass");
  });

  it("should return aggregate fail when DMARC fails", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; spf=pass; dkim=pass; dmarc=fail (p=REJECT)",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.dmarc.result).toBe("fail");
    expect(result!.aggregate).toBe("fail");
  });

  it("should return aggregate fail when both SPF and DKIM fail", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; spf=fail; dkim=fail",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("fail");
    expect(result!.dkim.result).toBe("fail");
    expect(result!.aggregate).toBe("fail");
  });

  it("should return aggregate warning for SPF softfail with others pass", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; spf=softfail; dkim=pass; dmarc=none",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("softfail");
    expect(result!.dkim.result).toBe("pass");
    expect(result!.aggregate).toBe("warning");
  });

  it("should return aggregate warning for mixed results", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; spf=pass; dkim=fail; dmarc=none",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.aggregate).toBe("warning");
  });

  it("should fallback to ARC-Authentication-Results", () => {
    const headers = makeHeaders({
      name: "ARC-Authentication-Results",
      value:
        "i=1; mx.google.com; spf=pass; dkim=pass; dmarc=pass",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("pass");
    expect(result!.dkim.result).toBe("pass");
    expect(result!.dmarc.result).toBe("pass");
    expect(result!.aggregate).toBe("pass");
  });

  it("should fallback to Received-SPF for SPF only", () => {
    const headers = makeHeaders({
      name: "Received-SPF",
      value: "pass (google.com: domain of user@example.com designates 1.2.3.4 as permitted sender)",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("pass");
    expect(result!.spf.detail).toContain("google.com");
    expect(result!.dkim.result).toBe("unknown");
    expect(result!.dmarc.result).toBe("unknown");
  });

  it("should return null when no auth headers exist", () => {
    const headers = makeHeaders(
      { name: "From", value: "sender@example.com" },
      { name: "Subject", value: "Hello" },
    );

    const result = parseAuthenticationResults(headers);
    expect(result).toBeNull();
  });

  it("should handle multiple DKIM entries (one pass, one fail) as pass", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value:
        "mx.google.com; spf=pass; dkim=fail (wrong key) header.d=other.com; dkim=pass header.d=example.com; dmarc=pass",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.dkim.result).toBe("pass");
    expect(result!.aggregate).toBe("pass");
  });

  it("should handle malformed header gracefully", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "garbage; not-a-real-header; @@##$$",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    // All should be unknown since nothing could be parsed
    expect(result!.spf.result).toBe("unknown");
    expect(result!.dkim.result).toBe("unknown");
    expect(result!.dmarc.result).toBe("unknown");
    expect(result!.aggregate).toBe("unknown");
  });

  it("should return aggregate pass when DMARC passes alone", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; dmarc=pass (p=NONE)",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.dmarc.result).toBe("pass");
    expect(result!.aggregate).toBe("pass");
  });

  it("should handle headers with extra whitespace and newlines", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value:
        "mx.google.com;\r\n   spf=pass (google.com);\r\n   dkim=pass\r\n   header.d=example.com;\r\n   dmarc=pass (p=REJECT)",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("pass");
    expect(result!.dkim.result).toBe("pass");
    expect(result!.dmarc.result).toBe("pass");
    expect(result!.aggregate).toBe("pass");
  });

  it("should extract parenthetical detail for SPF", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value:
        "mx.google.com; spf=pass (domain of sender@example.com designates 1.2.3.4); dkim=pass; dmarc=pass",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.detail).toContain("domain of sender@example.com");
  });

  it("should prefer Authentication-Results over ARC-Authentication-Results", () => {
    const headers = makeHeaders(
      {
        name: "Authentication-Results",
        value: "mx.google.com; spf=pass; dkim=pass; dmarc=pass",
      },
      {
        name: "ARC-Authentication-Results",
        value: "i=1; mx.google.com; spf=fail; dkim=fail; dmarc=fail",
      },
    );

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.aggregate).toBe("pass");
  });

  it("should return aggregate pass when SPF and DKIM both pass but DMARC is unknown", () => {
    const headers = makeHeaders({
      name: "Authentication-Results",
      value: "mx.google.com; spf=pass; dkim=pass",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("pass");
    expect(result!.dkim.result).toBe("pass");
    expect(result!.dmarc.result).toBe("unknown");
    expect(result!.aggregate).toBe("pass");
  });

  it("should handle Received-SPF with softfail result", () => {
    const headers = makeHeaders({
      name: "Received-SPF",
      value: "softfail (transitioning domain)",
    });

    const result = parseAuthenticationResults(headers);
    expect(result).not.toBeNull();
    expect(result!.spf.result).toBe("softfail");
    expect(result!.spf.detail).toBe("transitioning domain");
  });
});
