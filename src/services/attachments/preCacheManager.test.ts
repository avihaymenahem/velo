import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/stores/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({ isOnline: true })),
  },
}));

const mockSelect = vi.fn();
vi.mock("../db/connection", () => ({
  getDb: vi.fn(() => Promise.resolve({ select: mockSelect })),
}));

vi.mock("../db/settings", () => ({
  getSetting: vi.fn(() => Promise.resolve("500")),
}));

const mockFetchAttachment = vi.fn();
vi.mock("../email/providerFactory", () => ({
  getEmailProvider: vi.fn(() =>
    Promise.resolve({ fetchAttachment: mockFetchAttachment }),
  ),
}));

vi.mock("./cacheManager", () => ({
  cacheAttachment: vi.fn(),
}));

// Pre-caching skips IMAP accounts and caches Gmail attachments via a Tauri command.
const mockGetAccount = vi.fn();
vi.mock("../db/accounts", () => ({
  getAccount: (...args: unknown[]) => mockGetAccount(...args),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

let lastRunPromise: Promise<void> = Promise.resolve();
vi.mock("../backgroundCheckers", () => ({
  createBackgroundChecker: vi.fn((_name: string, fn: () => Promise<void>) => ({
    start: () => { lastRunPromise = fn(); },
    stop: vi.fn(),
  })),
}));

import { useUIStore } from "@/stores/uiStore";
import { startPreCacheManager, stopPreCacheManager } from "./preCacheManager";
import { createMockUIStoreState } from "@/test/mocks";

async function runPreCache() {
  // startPreCacheManager defers the first run behind a ~2-minute startup delay, and
  // preCacheRecent yields between attachments via setTimeout(0). Drive both with fake
  // timers so the (mocked) checker actually fires its check function.
  vi.useFakeTimers();
  try {
    startPreCacheManager();
    await vi.runAllTimersAsync();
  } finally {
    vi.useRealTimers();
  }
  await lastRunPromise;
}

describe("preCacheManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopPreCacheManager();
    (useUIStore.getState as ReturnType<typeof vi.fn>).mockReturnValue(createMockUIStoreState());
    mockSelect.mockReset();
    mockFetchAttachment.mockReset();
    mockInvoke.mockReset();
    mockGetAccount.mockReset();
    // Default: a Gmail account (no imap_host) so pre-caching proceeds.
    mockGetAccount.mockResolvedValue({ id: "acc-1", email: "a@b.com", imap_host: null });
  });

  it("skips when offline", async () => {
    (useUIStore.getState as ReturnType<typeof vi.fn>).mockReturnValue(createMockUIStoreState({ isOnline: false }));

    await runPreCache();

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("skips when cache is full", async () => {
    mockSelect
      .mockResolvedValueOnce([{ total: 600 * 1024 * 1024 }]);

    await runPreCache();

    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("fetches and caches uncached attachments", async () => {
    mockSelect
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([
        {
          id: "att-1",
          message_id: "msg-1",
          account_id: "acc-1",
          size: 1024,
          gmail_attachment_id: "gmail-att-1",
          imap_part_id: null,
        },
      ]);

    mockFetchAttachment.mockResolvedValueOnce({ data: btoa("hello") });

    await runPreCache();

    // Provider has no getValidToken → fallback path fetches then caches via Rust command.
    expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "gmail-att-1");
    expect(mockInvoke).toHaveBeenCalledWith(
      "cache_attachment_b64",
      expect.objectContaining({ attId: "att-1" }),
    );
  });

  it("skips IMAP accounts", async () => {
    mockGetAccount.mockResolvedValue({ id: "acc-imap", email: "a@b.com", imap_host: "imap.example.com" });
    mockSelect
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([
        {
          id: "att-imap",
          message_id: "msg-imap",
          account_id: "acc-imap",
          size: 2048,
          gmail_attachment_id: "gmail-att-imap",
        },
      ]);

    await runPreCache();

    // IMAP accounts are intentionally excluded from pre-caching.
    expect(mockFetchAttachment).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("silently skips on fetch error", async () => {
    mockSelect
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([
        {
          id: "att-4",
          message_id: "msg-4",
          account_id: "acc-4",
          size: 1024,
          gmail_attachment_id: "gmail-att-4",
        },
      ]);

    mockFetchAttachment.mockRejectedValueOnce(new Error("network error"));

    await runPreCache();

    // Fetch threw → nothing is cached.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("stops when cache limit would be exceeded", async () => {
    const maxBytes = 500 * 1024 * 1024;
    const nearLimit = maxBytes - 100;

    mockSelect
      .mockResolvedValueOnce([{ total: nearLimit }])
      .mockResolvedValueOnce([
        {
          id: "att-5",
          message_id: "msg-5",
          account_id: "acc-5",
          size: 1024,
          gmail_attachment_id: "gmail-att-5",
          imap_part_id: null,
        },
      ]);

    await runPreCache();

    expect(mockFetchAttachment).not.toHaveBeenCalled();
  });
});
