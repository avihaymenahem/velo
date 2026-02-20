import {
  createMockGmailAccount,
  createMockImapAccount,
} from "@/test/mocks/entities.mock";
import type { DbAccount } from "@/services/db/accounts";

vi.mock("@/services/db/accounts", () => ({
  getAccount: vi.fn(),
}));

// Mock the provider constructors so they don't do real work,
// but preserve the class identity and `type` property.
vi.mock("./googleCalendarProvider", () => {
  class GoogleCalendarProvider {
    readonly accountId: string;
    readonly type = "google_api" as const;
    constructor(accountId: string) {
      this.accountId = accountId;
    }
  }
  return { GoogleCalendarProvider };
});

vi.mock("./caldavProvider", () => {
  class CalDAVProvider {
    readonly accountId: string;
    readonly type = "caldav" as const;
    constructor(accountId: string) {
      this.accountId = accountId;
    }
  }
  return { CalDAVProvider };
});

import { getAccount } from "@/services/db/accounts";
import {
  getCalendarProvider,
  hasCalendarSupport,
  removeCalendarProvider,
  clearAllCalendarProviders,
} from "./providerFactory";

const mockGetAccount = vi.mocked(getAccount);

describe("providerFactory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAllCalendarProviders();
  });

  describe("getCalendarProvider", () => {
    it("returns GoogleCalendarProvider for gmail_api accounts", async () => {
      const account = createMockGmailAccount();
      mockGetAccount.mockResolvedValue(account);

      const provider = await getCalendarProvider(account.id);

      expect(provider.type).toBe("google_api");
      expect(provider.accountId).toBe(account.id);
    });

    it("returns CalDAVProvider for standalone caldav accounts", async () => {
      const account = createMockImapAccount({
        id: "acc-caldav",
        provider: "caldav" as DbAccount["provider"],
        caldav_url: "https://caldav.example.com",
      });
      mockGetAccount.mockResolvedValue(account);

      const provider = await getCalendarProvider("acc-caldav");

      expect(provider.type).toBe("caldav");
      expect(provider.accountId).toBe("acc-caldav");
    });

    it("returns CalDAVProvider for IMAP accounts with caldav_url configured", async () => {
      const account = createMockImapAccount({
        calendar_provider: "caldav",
        caldav_url: "https://caldav.example.com/dav",
      });
      mockGetAccount.mockResolvedValue(account);

      const provider = await getCalendarProvider(account.id);

      expect(provider.type).toBe("caldav");
      expect(provider.accountId).toBe(account.id);
    });

    it("throws error for IMAP accounts without calendar configured", async () => {
      const account = createMockImapAccount();
      mockGetAccount.mockResolvedValue(account);

      await expect(getCalendarProvider(account.id)).rejects.toThrow(
        `No calendar provider configured for account ${account.id}`,
      );
    });

    it("throws error when account is not found", async () => {
      mockGetAccount.mockResolvedValue(null);

      await expect(getCalendarProvider("nonexistent")).rejects.toThrow(
        "Account nonexistent not found",
      );
    });

    it("caches providers and returns same instance on second call", async () => {
      const account = createMockGmailAccount();
      mockGetAccount.mockResolvedValue(account);

      const first = await getCalendarProvider(account.id);
      const second = await getCalendarProvider(account.id);

      expect(first).toBe(second);
      // getAccount should only be called once due to caching
      expect(mockGetAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe("removeCalendarProvider", () => {
    it("clears cached provider for a specific account", async () => {
      const account = createMockGmailAccount();
      mockGetAccount.mockResolvedValue(account);

      const first = await getCalendarProvider(account.id);
      removeCalendarProvider(account.id);
      const second = await getCalendarProvider(account.id);

      expect(first).not.toBe(second);
      expect(mockGetAccount).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearAllCalendarProviders", () => {
    it("clears all cached providers", async () => {
      const gmailAccount = createMockGmailAccount();
      const caldavAccount = createMockImapAccount({
        id: "acc-caldav",
        provider: "caldav" as DbAccount["provider"],
        caldav_url: "https://caldav.example.com",
      });

      mockGetAccount.mockImplementation(async (id: string) => {
        if (id === gmailAccount.id) return gmailAccount;
        if (id === caldavAccount.id) return caldavAccount;
        return null;
      });

      const gmail1 = await getCalendarProvider(gmailAccount.id);
      const caldav1 = await getCalendarProvider(caldavAccount.id);

      clearAllCalendarProviders();

      const gmail2 = await getCalendarProvider(gmailAccount.id);
      const caldav2 = await getCalendarProvider(caldavAccount.id);

      expect(gmail1).not.toBe(gmail2);
      expect(caldav1).not.toBe(caldav2);
    });
  });

  describe("hasCalendarSupport", () => {
    it("returns true for gmail_api accounts", async () => {
      const account = createMockGmailAccount();
      mockGetAccount.mockResolvedValue(account);

      expect(await hasCalendarSupport(account.id)).toBe(true);
    });

    it("returns true for standalone caldav accounts", async () => {
      const account = createMockImapAccount({
        provider: "caldav" as DbAccount["provider"],
      });
      mockGetAccount.mockResolvedValue(account);

      expect(await hasCalendarSupport(account.id)).toBe(true);
    });

    it("returns true for IMAP accounts with caldav_url configured", async () => {
      const account = createMockImapAccount({
        calendar_provider: "caldav",
        caldav_url: "https://caldav.example.com/dav",
      });
      mockGetAccount.mockResolvedValue(account);

      expect(await hasCalendarSupport(account.id)).toBe(true);
    });

    it("returns false for plain IMAP accounts without calendar", async () => {
      const account = createMockImapAccount();
      mockGetAccount.mockResolvedValue(account);

      expect(await hasCalendarSupport(account.id)).toBe(false);
    });

    it("returns false when account is not found", async () => {
      mockGetAccount.mockResolvedValue(null);

      expect(await hasCalendarSupport("nonexistent")).toBe(false);
    });
  });
});
