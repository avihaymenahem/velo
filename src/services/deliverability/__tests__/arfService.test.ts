import { describe, it, expect } from "vitest";

describe("arfService - parseARF", () => {
  it("parses a valid ARF report", async () => {
    const { parseARF } = await import("@/services/deliverability/arfService");

    const rawBody = [
      "Content-Type: message/feedback-report",
      "",
      "Feedback-Type: abuse",
      "User-Agent: SomeGenerator/1.0",
      "Original-Recipient: rfc822; victim@example.com",
      "Original-Mail-From: rfc822; sender@example.com",
      "Reported-Domain: example.com",
      "Source-IP: 1.2.3.4",
      "Arrival-Date: 2025-01-15T12:00:00Z",
    ].join("\r\n");

    const result = parseARF(rawBody);
    expect(result).not.toBeNull();
    expect(result!.feedbackType).toBe("abuse");
    expect(result!.userAgent).toBe("SomeGenerator/1.0");
    expect(result!.originalRecipient).toBe("victim@example.com");
    expect(result!.originalMailFrom).toBe("sender@example.com");
    expect(result!.reportedDomain).toBe("example.com");
    expect(result!.sourceIP).toBe("1.2.3.4");
    expect(result!.arrivalDate).toBe("2025-01-15T12:00:00Z");
  });

  it("returns null for non-ARF body", async () => {
    const { parseARF } = await import("@/services/deliverability/arfService");
    const result = parseARF("This is just a regular email");
    expect(result).toBeNull();
  });

  it("handles missing fields gracefully", async () => {
    const { parseARF } = await import("@/services/deliverability/arfService");
    const rawBody = [
      "Content-Type: message/feedback-report",
      "",
      "Feedback-Type: abuse",
    ].join("\r\n");

    const result = parseARF(rawBody);
    expect(result).not.toBeNull();
    expect(result!.feedbackType).toBe("abuse");
    expect(result!.userAgent).toBe("");
    expect(result!.originalRecipient).toBe("");
    expect(result!.sourceIP).toBeNull();
  });
});
