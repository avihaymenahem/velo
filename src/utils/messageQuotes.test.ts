import { describe, expect, it } from "vitest";
import { buildForwardQuote, buildReplyQuote } from "./messageQuotes";

const baseMessage = {
  from_name: "Alice",
  from_address: "alice@example.com",
  date: 1736937000000,
  subject: "Project update",
  to_addresses: "bob@example.com",
  body_html: "<p>Hello</p><script>bad()</script>",
  body_text: null,
};

describe("message quote builders", () => {
  it("localizes reply quote chrome in Simplified Chinese without translating message content", () => {
    const html = buildReplyQuote(baseMessage, { language: "zh-CN" });

    expect(html).toContain("Alice &lt;alice@example.com&gt;");
    expect(html).toContain("写道：");
    expect(html).toContain("<p>Hello</p>");
    expect(html).not.toContain("On ");
    expect(html).not.toContain("wrote:");
    expect(html).not.toContain("<script>");
  });

  it("localizes forwarded quote chrome in Simplified Chinese", () => {
    const html = buildForwardQuote(baseMessage, { language: "zh-CN" });

    expect(html).toContain("---------- 转发邮件 ---------");
    expect(html).toContain("发件人：Alice &lt;alice@example.com&gt;");
    expect(html).toContain("日期：");
    expect(html).toContain("主题：Project update");
    expect(html).toContain("收件人：bob@example.com");
    expect(html).not.toContain("Forwarded message");
    expect(html).not.toContain("From:");
    expect(html).not.toContain("Subject:");
    expect(html).not.toContain("<script>");
  });

  it("preserves English quote chrome by default", () => {
    const reply = buildReplyQuote(baseMessage, { language: "en" });
    const forward = buildForwardQuote(baseMessage, { language: "en" });

    expect(reply).toContain("On ");
    expect(reply).toContain("Alice &lt;alice@example.com&gt; wrote:");
    expect(forward).toContain("---------- Forwarded message ---------");
    expect(forward).toContain("From: Alice &lt;alice@example.com&gt;");
    expect(forward).toContain("Subject: Project update");
  });

  it("escapes text bodies and fallback sender values", () => {
    const html = buildReplyQuote(
      {
        ...baseMessage,
        from_name: null,
        from_address: null,
        body_html: null,
        body_text: "<plain text>",
      },
      { language: "zh-CN" },
    );

    expect(html).toContain("未知");
    expect(html).toContain("&lt;plain text&gt;");
    expect(html).not.toContain("<plain text>");
  });
});
