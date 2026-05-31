import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getDb } from "@/services/db/connection";
import { createMockDb } from "@/test/mocks";
import { executeUnsubscribe, isSafeUrl } from "./unsubscribeManager";

const mockDb = createMockDb();

describe("unsubscribeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
  });

  describe("isSafeUrl", () => {
    it("allows public HTTP and HTTPS URLs", () => {
      expect(isSafeUrl("https://example.com/unsub")).toBe(true);
      expect(isSafeUrl("http://newsletter.example.com/unsub?id=1")).toBe(true);
      expect(isSafeUrl("https://8.8.8.8/unsub")).toBe(true);
    });

    it("blocks invalid URLs and non-http schemes", () => {
      expect(isSafeUrl("https://%")).toBe(false);
      expect(isSafeUrl("not-a-url")).toBe(false);
      expect(isSafeUrl("mailto:unsubscribe@example.com")).toBe(false);
      expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    });

    it("blocks loopback, private, link-local, and metadata IPv4 targets", () => {
      expect(isSafeUrl("https://localhost/unsub")).toBe(false);
      expect(isSafeUrl("https://localhost./unsub")).toBe(false);
      expect(isSafeUrl("https://127.0.0.1/unsub")).toBe(false);
      expect(isSafeUrl("https://10.0.0.1/unsub")).toBe(false);
      expect(isSafeUrl("https://172.16.0.1/unsub")).toBe(false);
      expect(isSafeUrl("https://172.31.255.255/unsub")).toBe(false);
      expect(isSafeUrl("https://192.168.1.1/unsub")).toBe(false);
      expect(isSafeUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
      expect(isSafeUrl("https://0.0.0.0/unsub")).toBe(false);
    });

    it("allows public IPv4 outside private ranges", () => {
      expect(isSafeUrl("https://172.15.0.1/unsub")).toBe(true);
      expect(isSafeUrl("https://172.32.0.1/unsub")).toBe(true);
      expect(isSafeUrl("https://1.1.1.1/unsub")).toBe(true);
    });

    it("blocks local IPv6 and IPv4-mapped IPv6 targets", () => {
      expect(isSafeUrl("https://[::1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[0:0:0:0:0:0:0:1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[fc00::1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[fd12:3456::1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[fe80::1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[::ffff:127.0.0.1]/unsub")).toBe(false);
      expect(isSafeUrl("https://[::ffff:169.254.169.254]/unsub")).toBe(false);
    });

    it("blocks dotless internal hostnames", () => {
      expect(isSafeUrl("https://printer/unsub")).toBe(false);
    });
  });

  describe("executeUnsubscribe", () => {
    it("posts one-click unsubscribe only for safe URLs", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
      } as Response);

      const result = await executeUnsubscribe(
        "acct-1",
        "thread-1",
        "news@example.com",
        "News",
        "<https://example.com/unsubscribe>",
        "List-Unsubscribe=One-Click",
      );

      expect(result).toEqual({ method: "http_post", success: true });
      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/unsubscribe",
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
        }),
      );
      expect(openUrl).not.toHaveBeenCalled();
    });

    it("blocks unsafe one-click URL without fetch or browser fallback", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await executeUnsubscribe(
        "acct-1",
        "thread-1",
        "news@example.com",
        "News",
        "<https://169.254.169.254/latest/meta-data/>",
        "List-Unsubscribe=One-Click",
      );

      expect(result).toEqual({ method: "browser", success: false });
      expect(fetch).not.toHaveBeenCalled();
      expect(openUrl).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "Blocked unsafe one-click unsubscribe URL:",
        "169.254.169.254",
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "Blocked unsafe browser unsubscribe URL:",
        "169.254.169.254",
      );
      warnSpy.mockRestore();
    });

    it("handles malformed unsafe URLs without throwing from logging", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(executeUnsubscribe(
        "acct-1",
        "thread-1",
        "news@example.com",
        "News",
        "<https://%>",
        "List-Unsubscribe=One-Click",
      )).resolves.toEqual({ method: "browser", success: false });

      expect(fetch).not.toHaveBeenCalled();
      expect(openUrl).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        "Blocked unsafe one-click unsubscribe URL:",
        "invalid-url",
      );
      expect(warnSpy).toHaveBeenCalledWith(
        "Blocked unsafe browser unsubscribe URL:",
        "invalid-url",
      );
      warnSpy.mockRestore();
    });

    it("still opens safe browser fallback when one-click is unavailable", async () => {
      const result = await executeUnsubscribe(
        "acct-1",
        "thread-1",
        "news@example.com",
        "News",
        "<https://example.com/preferences>",
        null,
      );

      expect(result).toEqual({ method: "browser", success: true });
      expect(fetch).not.toHaveBeenCalled();
      expect(openUrl).toHaveBeenCalledWith("https://example.com/preferences");
    });
  });
});
