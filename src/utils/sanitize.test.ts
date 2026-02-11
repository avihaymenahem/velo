import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeHtml } from "./sanitize";

describe("escapeHtml", () => {
  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;",
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });

  it("escapes complex XSS payload", () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const result = escapeHtml(payload);
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
    expect(result).toContain("&quot;&gt;");
  });
});

describe("sanitizeHtml", () => {
  it("strips script tags", () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<script");
    expect(result).toContain("<p>Hello</p>");
  });

  it("strips style tags", () => {
    const html = '<style>body{display:none}</style><p>Content</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<style");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips iframe tags", () => {
    const html = '<iframe src="https://evil.com"></iframe><p>Safe</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>Safe</p>");
  });

  it("strips event handler attributes", () => {
    const html = '<img src="test.jpg" onerror="alert(1)" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onerror");
  });

  it("strips onmouseover and other on* attributes", () => {
    const html = '<div onmouseover="alert(1)" onfocus="alert(2)">text</div>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("onmouseover");
    expect(result).not.toContain("onfocus");
  });

  it("preserves allowed attributes", () => {
    const html = '<a href="https://example.com" title="link">Click</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('title="link"');
  });

  it("preserves data-blocked-src attribute", () => {
    const html = '<img data-blocked-src="https://example.com/img.png" src="" />';
    const result = sanitizeHtml(html);
    expect(result).toContain("data-blocked-src");
  });

  it("strips object and embed tags", () => {
    const html = '<object data="evil.swf"></object><embed src="evil.swf" />';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
  });

  it("strips form tags", () => {
    const html = '<form action="https://evil.com"><input type="password" /></form>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain("<form");
  });

  it("preserves basic email HTML structure", () => {
    const html = '<div><p>Hello <strong>World</strong></p><br><a href="https://example.com">Link</a></div>';
    const result = sanitizeHtml(html);
    expect(result).toContain("<p>Hello <strong>World</strong></p>");
    expect(result).toContain("<br>");
    expect(result).toContain('<a href="https://example.com">Link</a>');
  });

  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});
