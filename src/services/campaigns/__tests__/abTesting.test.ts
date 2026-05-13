import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockDb = {
  execute: vi.fn(),
  select: vi.fn(),
  close: vi.fn(),
};

vi.mock("@/services/db/connection", () => ({
  queryWithRetry: vi.fn(async (fn: (db: typeof mockDb) => Promise<unknown>) => fn(mockDb)),
  selectFirstBy: vi.fn(async (sql: string, params?: unknown[]) => {
    const rows = await mockDb.select(sql, params);
    return rows[0] ?? null;
  }),
}));

import {
  chiSquareTest,
  assignVariant,
  createABTest,
  getABTestConfig,
  getVariantStats,
  runSignificanceTest,
  shouldRunABTestDecision,
} from "../abTesting";

describe("chiSquareTest", () => {
  it("returns not significant when both variants have zero opens", () => {
    const result = chiSquareTest(0, 10, 0, 10);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
  });

  it("returns not significant when both variants have zero total", () => {
    const result = chiSquareTest(0, 0, 0, 0);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
  });

  it("returns not significant when one variant has zero total", () => {
    const result = chiSquareTest(5, 10, 0, 0);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBe(1);
  });

  it("returns significant for large difference with sufficient sample", () => {
    const result = chiSquareTest(80, 100, 20, 100);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("returns not significant for small difference", () => {
    const result = chiSquareTest(55, 100, 50, 100);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it("detects borderline significance", () => {
    const result = chiSquareTest(65, 100, 45, 100);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.01);
  });
});

describe("assignVariant", () => {
  it("returns A or B for any ID", async () => {
    const result = await assignVariant("test-id", 0.5);
    expect(["A", "B"]).toContain(result);
  });

  it("distributes variants across different IDs", async () => {
    const results: string[] = [];
    for (let i = 0; i < 100; i++) {
      const v = await assignVariant(`id-${i}`, 0.5);
      results.push(v);
    }
    const aCount = results.filter((r) => r === "A").length;
    expect(aCount).toBeGreaterThan(30);
    expect(aCount).toBeLessThan(70);
  });

  it("is deterministic for the same ID", async () => {
    const a = await assignVariant("deterministic-test", 0.5);
    const b = await assignVariant("deterministic-test", 0.5);
    expect(a).toBe(b);
  });

  it("favors A more with higher split ratio", async () => {
    const lowRatioResults: string[] = [];
    const highRatioResults: string[] = [];
    for (let i = 0; i < 100; i++) {
      lowRatioResults.push(await assignVariant(`id-${i}`, 0.1));
      highRatioResults.push(await assignVariant(`id-${i}`, 0.9));
    }
    const lowA = lowRatioResults.filter((r) => r === "A").length;
    const highA = highRatioResults.filter((r) => r === "A").length;
    expect(highA).toBeGreaterThan(lowA);
  });
});

describe("createABTest and getABTestConfig", () => {
  const testConfig = {
    variantA: { subject: "Test A", body: "Body A" },
    variantB: { subject: "Test B", body: "Body B" },
    splitRatio: 0.5,
    winnerId: null as string | null,
    testDurationHours: 24,
    startedAt: null,
    endedAt: null,
    significant: false,
    pValue: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores config via SQL update", async () => {
    await createABTest("campaign-1", testConfig);
    expect(mockDb.execute).toHaveBeenCalledWith(
      "UPDATE campaigns SET ab_test_config = $1 WHERE id = $2",
      [JSON.stringify(testConfig), "campaign-1"],
    );
  });

  it("retrieves config from SQL select", async () => {
    mockDb.select.mockResolvedValueOnce([{ ab_test_config: JSON.stringify(testConfig) }]);
    const result = await getABTestConfig("campaign-1");
    expect(result).toEqual(testConfig);
  });

  it("returns null when no config stored", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await getABTestConfig("campaign-1");
    expect(result).toBeNull();
  });
});

describe("getVariantStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for both variants when no data", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await getVariantStats("campaign-1");
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });

  it("computes stats per variant", async () => {
    mockDb.select.mockResolvedValueOnce([
      { variant: "A", total: 100, opens: 40, clicks: 10 },
      { variant: "B", total: 100, opens: 25, clicks: 5 },
    ]);
    const result = await getVariantStats("campaign-1");
    expect(result.a?.total).toBe(100);
    expect(result.a?.opens).toBe(40);
    expect(result.a?.openRate).toBe(0.4);
    expect(result.b?.total).toBe(100);
    expect(result.b?.opens).toBe(25);
    expect(result.b?.openRate).toBe(0.25);
  });
});

describe("shouldRunABTestDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no config exists", async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await shouldRunABTestDecision("campaign-1");
    expect(result).toBe(false);
  });

  it("returns false when winner already declared", async () => {
    const config = {
      variantA: { subject: "A", body: "A" },
      variantB: { subject: "B", body: "B" },
      splitRatio: 0.5,
      winnerId: "A",
      testDurationHours: 24,
      startedAt: Math.floor(Date.now() / 1000) - 86400,
      endedAt: Math.floor(Date.now() / 1000),
      significant: true,
      pValue: 0.01,
    };
    mockDb.select.mockResolvedValueOnce([{ ab_test_config: JSON.stringify(config) }]);
    const result = await shouldRunABTestDecision("campaign-1");
    expect(result).toBe(false);
  });

  it("returns false when test has not yet run long enough", async () => {
    const config = {
      variantA: { subject: "A", body: "A" },
      variantB: { subject: "B", body: "B" },
      splitRatio: 0.5,
      winnerId: null,
      testDurationHours: 24,
      startedAt: Math.floor(Date.now() / 1000) - 3600,
      endedAt: null,
      significant: false,
      pValue: null,
    };
    mockDb.select.mockResolvedValueOnce([{ ab_test_config: JSON.stringify(config) }]);
    mockDb.select.mockResolvedValueOnce([{ cnt: 5 }]);
    const result = await shouldRunABTestDecision("campaign-1");
    expect(result).toBe(false);
  });
});
