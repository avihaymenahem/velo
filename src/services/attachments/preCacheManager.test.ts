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

let lastRunPromise: Promise<void> = Promise.resolve();
vi.mock("../backgroundCheckers", () => ({
  createBackgroundChecker: vi.fn((_name: string, fn: () => Promise<void>) => ({
    start: () => { lastRunPromise = fn(); },
    stop: vi.fn(),
  })),
}));

import { useUIStore } from "@/stores/uiStore";
import { cacheAttachment } from "./cacheManager";
import { startPreCacheManager, stopPreCacheManager } from "./preCacheManager";

async function runPreCache() {
  startPreCacheManager();
  await lastRunPromise;
}

describe("preCacheManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopPreCacheManager();
    (useUIStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({ isOnline: true });
    mockSelect.mockReset();
    mockFetchAttachment.mockReset();
  });

  it("skips when offline", async () => {
    (useUIStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({ isOnline: false });

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

    expect(mockFetchAttachment).toHaveBeenCalledWith("msg-1", "gmail-att-1");
    expect(cacheAttachment).toHaveBeenCalledWith("att-1", expect.any(Uint8Array));
  });

  it("uses imap_part_id when gmail_attachment_id is null", async () => {
    mockSelect
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([
        {
          id: "att-2",
          message_id: "msg-2",
          account_id: "acc-2",
          size: 2048,
          gmail_attachment_id: null,
          imap_part_id: "1.2",
        },
      ]);

    mockFetchAttachment.mockResolvedValueOnce({ data: btoa("data") });

    await runPreCache();

    expect(mockFetchAttachment).toHaveBeenCalledWith("msg-2", "1.2");
  });

  it("skips attachments without any attachment id", async () => {
    mockSelect
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([
        {
          id: "att-3",
          message_id: "msg-3",
          account_id: "acc-3",
          size: 512,
          gmail_attachment_id: null,
          imap_part_id: null,
        },
      ]);

    await runPreCache();

    expect(mockFetchAttachment).not.toHaveBeenCalled();
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
          imap_part_id: null,
        },
      ]);

    mockFetchAttachment.mockRejectedValueOnce(new Error("network error"));

    await runPreCache();

    expect(cacheAttachment).not.toHaveBeenCalled();
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
