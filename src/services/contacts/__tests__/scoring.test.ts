import { describe, it, expect } from "vitest";
import { computeEngagementScore, getHealthStatus } from "../scoring";

describe("computeEngagementScore", () => {
  it("returns ~0 for a new contact never contacted", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 999,
      contactsLast30d: 0,
      repliesSent: 0,
      emailsReceived: 0,
    });
    expect(score).toBeCloseTo(0.0, 1);
  });

  it("returns ~1.0 for a highly engaged contact", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 1,
      contactsLast30d: 10,
      repliesSent: 5,
      emailsReceived: 5,
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns expected value for moderately engaged contact", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 15,
      contactsLast30d: 5,
      repliesSent: 2,
      emailsReceived: 5,
    });
    const recencyFactor = Math.min(1.0, 30 / 15);
    const frequencyFactor = Math.min(1.0, 5 / 10);
    const replyRate = Math.min(1.0, 2 / 5);
    const expected = 0.4 * recencyFactor + 0.3 * frequencyFactor + 0.3 * replyRate;
    expect(score).toBeCloseTo(expected, 5);
  });

  it("handles zero emails received without division by zero", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 5,
      contactsLast30d: 3,
      repliesSent: 0,
      emailsReceived: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles daysSinceLastContact = 0", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 0,
      contactsLast30d: 8,
      repliesSent: 3,
      emailsReceived: 3,
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("caps recency factor at 1.0 when contacted today", () => {
    const score = computeEngagementScore({
      daysSinceLastContact: 0,
      contactsLast30d: 0,
      repliesSent: 0,
      emailsReceived: 0,
    });
    const recencyFactor = Math.min(1.0, 30 / 1);
    const expected = 0.4 * recencyFactor + 0.3 * 0 + 0.3 * 0;
    expect(score).toBeCloseTo(expected, 5);
  });
});

describe("getHealthStatus", () => {
  it("returns 'cold' for score < 0.2", () => {
    expect(getHealthStatus(0)).toBe("cold");
    expect(getHealthStatus(0.19)).toBe("cold");
  });

  it("returns 'lukewarm' for score >= 0.2 and < 0.4", () => {
    expect(getHealthStatus(0.2)).toBe("lukewarm");
    expect(getHealthStatus(0.39)).toBe("lukewarm");
  });

  it("returns 'warm' for score >= 0.4 and < 0.7", () => {
    expect(getHealthStatus(0.4)).toBe("warm");
    expect(getHealthStatus(0.69)).toBe("warm");
  });

  it("returns 'hot' for score >= 0.7", () => {
    expect(getHealthStatus(0.7)).toBe("hot");
    expect(getHealthStatus(1.0)).toBe("hot");
  });
});
