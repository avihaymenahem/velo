import { describe, it, expect, vi, beforeEach } from "vitest";
import { GmailClient } from "./client";

// Mock dependencies so the constructor works
vi.mock("./auth", () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("../db/connection", () => ({
  getDb: vi.fn().mockResolvedValue({ execute: vi.fn(), select: vi.fn() }),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn().mockResolvedValue("encrypted"),
}));

vi.mock("@/utils/timestamp", () => ({
  getCurrentUnixTimestamp: () => 1000,
}));

describe("GmailClient.request", () => {
  let client: GmailClient;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new GmailClient("acc-1", "client-id", {
      accessToken: "test-token",
      refreshToken: "refresh-token",
      expiresAt: 9999999999, // far future so no refresh needed
    });
  });

  it("should handle 204 No Content responses without JSON parse error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => { throw new Error("Should not call json() on 204"); },
    }));

    const result = await client.request("/drafts/draft-1", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("should parse JSON for normal 200 responses", async () => {
    const mockData = { id: "draft-1", message: { id: "msg-1" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockData),
    }));

    const result = await client.request("/drafts");
    expect(result).toEqual(mockData);
  });

  it("should throw on non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not Found"),
    }));

    await expect(client.request("/drafts/bad-id")).rejects.toThrow("Gmail API error: 404 Not Found");
  });
});
