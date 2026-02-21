import { describe, it, expect, vi, beforeEach } from "vitest";
import { GmailClient } from "./client";
import { createMockFetchResponse } from "@/test/mocks";

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      createMockFetchResponse({ status: 204 }),
    ));

    const result = await client.request("/drafts/draft-1", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("should parse JSON for normal 200 responses", async () => {
    const mockData = { id: "draft-1", message: { id: "msg-1" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      createMockFetchResponse({ status: 200, data: mockData }),
    ));

    const result = await client.request("/drafts");
    expect(result).toEqual(mockData);
  });

  it("should throw on non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      createMockFetchResponse({ status: 404, text: "Not Found" }),
    ));

    await expect(client.request("/drafts/bad-id")).rejects.toThrow("Gmail API error: 404 Not Found");
  });

  it("should retry on 429 and succeed", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 429, text: "Rate Limit Exceeded", headers: { "Retry-After": "0" } }),
      )
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 200, data: { id: "success" } }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.request("/threads/t1");
    expect(result).toEqual({ id: "success" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should respect Retry-After header on 429", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 429, text: "Rate Limit Exceeded", headers: { "Retry-After": "1" } }),
      )
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 200, data: { id: "ok" } }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const start = Date.now();
    await client.request("/threads/t1");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(900); // ~1s with some tolerance
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should throw after max 429 retries exceeded", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      createMockFetchResponse({ status: 429, text: "Rate Limit Exceeded", headers: { "Retry-After": "0" } }),
    );
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.request("/threads/t1")).rejects.toThrow("Gmail API error: 429 Rate Limit Exceeded");
    expect(mockFetch).toHaveBeenCalledTimes(3); // 3 attempts total
  });

  it("should use exponential backoff when no Retry-After header", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 429, text: "Rate Limit Exceeded" }),
      )
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 200, data: { id: "ok" } }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const start = Date.now();
    await client.request("/threads/t1");
    const elapsed = Date.now() - start;

    // First backoff = 1000ms (INITIAL_BACKOFF_MS * 2^0)
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should handle 429 after 401 token refresh", async () => {
    const { refreshAccessToken } = await import("./auth");
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: "new-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://mail.google.com/",
    });

    const mockFetch = vi.fn()
      // Initial request returns 401
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 401, text: "Unauthorized" }),
      )
      // Post-refresh retry returns 429, then succeeds
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 429, text: "Rate Limit Exceeded", headers: { "Retry-After": "0" } }),
      )
      .mockResolvedValueOnce(
        createMockFetchResponse({ status: 200, data: { id: "after-429" } }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.request("/threads/t1");
    expect(result).toEqual({ id: "after-429" });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
