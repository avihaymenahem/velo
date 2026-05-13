import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(),
  close: vi.fn(),
};

vi.mock("@/services/db/connection", () => ({
  queryWithRetry: vi.fn(async (fn: (db: typeof mockDb) => Promise<unknown>) => fn(mockDb)),
}));

vi.mock("@/services/db/campaignRecipients", () => ({
  getEngagementTimeSeries: vi.fn(async () => [
    { date: "2026-05-01", opens: 5, clicks: 2 },
    { date: "2026-05-02", opens: 3, clicks: 1 },
  ]),
}));

import { getCampaignAnalytics, getOverview } from "../analyticsService";
import { exportCampaignToCSV } from "@/services/export/csvExport";

describe("getCampaignAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes analytics from campaign data", async () => {
    mockDb.select
      .mockResolvedValueOnce([
        { total: 200, sent: 180, opened: 60, clicked: 25, bounced: 10 },
      ])
      .mockResolvedValueOnce([
        { url: "https://example.com", click_count: 5 },
        { url: "https://test.com", click_count: 3 },
      ]);

    const result = await getCampaignAnalytics("campaign-1");
    expect(result.totalSent).toBe(180);
    expect(result.uniqueOpens).toBe(60);
    expect(result.totalClicks).toBe(25);
    expect(result.bouncedCount).toBe(10);
    expect(result.openRate).toBeCloseTo(0.3, 5);
    expect(result.clickRate).toBeCloseTo(0.125, 5);
    expect(result.bounceRate).toBeCloseTo(0.05, 5);
    expect(result.dailyStats).toHaveLength(2);
    expect(result.dailyStats[0]!.date).toBe("2026-05-01");
    expect(result.dailyStats[0]!.opens).toBe(5);
    expect(result.topLinks).toHaveLength(2);
    expect(result.topLinks[0]!.url).toBe("https://example.com");
    expect(result.topLinks[0]!.clicks).toBe(5);
  });

  it("handles zero data gracefully", async () => {
    mockDb.select.mockResolvedValueOnce([
      { total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0 },
    ]).mockResolvedValueOnce([]);

    const result = await getCampaignAnalytics("campaign-empty");
    expect(result.totalSent).toBe(0);
    expect(result.uniqueOpens).toBe(0);
    expect(result.totalClicks).toBe(0);
    expect(result.bouncedCount).toBe(0);
    expect(result.openRate).toBe(0);
    expect(result.topLinks).toHaveLength(0);
  });
});

describe("getOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns overview stats aggregated across campaigns", async () => {
    mockDb.select.mockResolvedValueOnce([
      {
        campaign_count: 5,
        total_sent: 1000,
        total_opens: 450,
        total_clicks: 120,
        total_bounced: 30,
      },
    ]);

    const result = await getOverview("account-1");
    expect(result.totalCampaigns).toBe(5);
    expect(result.totalSent).toBe(1000);
    expect(result.totalOpens).toBe(450);
    expect(result.totalClicks).toBe(120);
    expect(result.totalBounced).toBe(30);
    expect(result.averageOpenRate).toBeCloseTo(0.45, 5);
    expect(result.averageClickRate).toBeCloseTo(0.12, 5);
  });

  it("handles empty account", async () => {
    mockDb.select.mockResolvedValueOnce([
      {
        campaign_count: 0,
        total_sent: 0,
        total_opens: 0,
        total_clicks: 0,
        total_bounced: 0,
      },
    ]);

    const result = await getOverview("empty-account");
    expect(result.totalCampaigns).toBe(0);
    expect(result.averageOpenRate).toBe(0);
  });
});

describe("exportCampaignToCSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates CSV with correct headers and rows", async () => {
    mockDb.select.mockResolvedValueOnce([
      { email: "alice@test.com", variant: "A", status: "opened", opened_at: 1714521600, clicked_at: 1714525200 },
      { email: "bob@test.com", variant: "B", status: "sent", opened_at: null, clicked_at: null },
      { email: "charlie@test.com", variant: null, status: "bounced", opened_at: null, clicked_at: null },
    ]);

    const csv = await exportCampaignToCSV("campaign-1");
    const lines = csv.split("\n");
    expect(lines[0]).toBe("email,variant,status,opened_at,clicked_at");
    expect(lines[1]).toContain("alice@test.com");
    expect(lines[1]).toContain("A");
    expect(lines[1]).toContain("opened");
    expect(lines[2]).toContain("bob@test.com");
    expect(lines[2]).toContain("B");
    expect(lines[2]).toContain("sent");
    expect(lines[3]).toContain("charlie@test.com");
    expect(lines[3]).toContain("bounced");
  });

  it("handles empty recipient list", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    const csv = await exportCampaignToCSV("empty-campaign");
    expect(csv).toBe("email,variant,status,opened_at,clicked_at");
  });
});
