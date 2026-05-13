import { describe, it, expect } from "vitest";

describe("bounceService - classifyBounce", () => {
  it("classifies 5xx as hard", async () => {
    const { classifyBounce } = await import("@/services/deliverability/bounceService");
    expect(classifyBounce("550", "user unknown")).toBe("hard");
    expect(classifyBounce("554", "")).toBe("hard");
    expect(classifyBounce("551", "")).toBe("hard");
  });

  it("classifies 'user unknown' as hard", async () => {
    const { classifyBounce } = await import("@/services/deliverability/bounceService");
    expect(classifyBounce(null, "User unknown")).toBe("hard");
    expect(classifyBounce(null, "does not exist")).toBe("hard");
  });

  it("classifies 4xx as soft", async () => {
    const { classifyBounce } = await import("@/services/deliverability/bounceService");
    expect(classifyBounce("450", "")).toBe("soft");
    expect(classifyBounce("452", "")).toBe("soft");
    expect(classifyBounce("451", "temporarily rejected")).toBe("soft");
  });

  it("classifies 'mailbox full' as soft", async () => {
    const { classifyBounce } = await import("@/services/deliverability/bounceService");
    expect(classifyBounce(null, "Mailbox full")).toBe("soft");
    expect(classifyBounce(null, "over quota")).toBe("soft");
  });

  it("classifies policy violations", async () => {
    const { classifyBounce } = await import("@/services/deliverability/bounceService");
    expect(classifyBounce(null, "blocked")).toBe("policy");
    expect(classifyBounce(null, "rejected due to policy")).toBe("policy");
    expect(classifyBounce(null, "suspected spam")).toBe("policy");
  });
});

describe("bounceService - processBounce", () => {
  it("should return correct bounce type", async () => {
    const { processBounce } = await import("@/services/deliverability/bounceService");
    const result = await processBounce(null, null, "test@example.com", "550", "user unknown");
    expect(result).toBe("hard");
  });

  it("should return soft for temporary failures", async () => {
    const { processBounce } = await import("@/services/deliverability/bounceService");
    const result = await processBounce(null, null, "test@example.com", "450", "try again later");
    expect(result).toBe("soft");
  });
});
