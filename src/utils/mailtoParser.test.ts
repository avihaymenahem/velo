import { describe, it, expect } from "vitest";
import { parseMailtoUrl } from "./mailtoParser";

describe("parseMailtoUrl", () => {
  it("parses simple mailto with one address", () => {
    const result = parseMailtoUrl("mailto:user@example.com");
    expect(result.to).toEqual(["user@example.com"]);
    expect(result.cc).toEqual([]);
    expect(result.bcc).toEqual([]);
    expect(result.subject).toBe("");
    expect(result.body).toBe("");
  });

  it("parses mailto with multiple to addresses", () => {
    const result = parseMailtoUrl("mailto:a@b.com,c@d.com");
    expect(result.to).toEqual(["a@b.com", "c@d.com"]);
  });

  it("parses mailto with subject and body", () => {
    const result = parseMailtoUrl(
      "mailto:user@example.com?subject=Hello%20World&body=Hi%20there",
    );
    expect(result.to).toEqual(["user@example.com"]);
    expect(result.subject).toBe("Hello World");
    expect(result.body).toBe("Hi there");
  });

  it("parses mailto with cc and bcc", () => {
    const result = parseMailtoUrl(
      "mailto:user@example.com?cc=cc@example.com&bcc=bcc@example.com",
    );
    expect(result.to).toEqual(["user@example.com"]);
    expect(result.cc).toEqual(["cc@example.com"]);
    expect(result.bcc).toEqual(["bcc@example.com"]);
  });

  it("parses mailto with multiple cc addresses", () => {
    const result = parseMailtoUrl(
      "mailto:user@example.com?cc=a@b.com,c@d.com",
    );
    expect(result.cc).toEqual(["a@b.com", "c@d.com"]);
  });

  it("parses mailto with no address", () => {
    const result = parseMailtoUrl("mailto:?subject=Test");
    expect(result.to).toEqual([]);
    expect(result.subject).toBe("Test");
  });

  it("merges to from address part and query param", () => {
    const result = parseMailtoUrl("mailto:a@b.com?to=c@d.com");
    expect(result.to).toEqual(["a@b.com", "c@d.com"]);
  });

  it("handles encoded characters", () => {
    const result = parseMailtoUrl(
      "mailto:user%40example.com?subject=Re%3A%20Meeting&body=Let%27s%20meet",
    );
    expect(result.to).toEqual(["user@example.com"]);
    expect(result.subject).toBe("Re: Meeting");
    expect(result.body).toBe("Let's meet");
  });

  it("returns empty fields for non-mailto URL", () => {
    const result = parseMailtoUrl("https://example.com");
    expect(result.to).toEqual([]);
    expect(result.cc).toEqual([]);
    expect(result.bcc).toEqual([]);
    expect(result.subject).toBe("");
    expect(result.body).toBe("");
  });

  it("handles empty mailto URL", () => {
    const result = parseMailtoUrl("mailto:");
    expect(result.to).toEqual([]);
  });
});
