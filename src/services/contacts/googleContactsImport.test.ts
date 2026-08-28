import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
    withTransaction: vi.fn(),
  };
});
vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));
vi.mock("@/services/db/accounts", () => ({
  getAllAccounts: vi.fn(),
}));
vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(),
}));

import { withTransaction } from "@/services/db/connection";
import { getSetting, setSetting } from "@/services/db/settings";
import { getAllAccounts } from "@/services/db/accounts";
import { getGmailClient } from "@/services/gmail/tokenManager";
import {
  importGoogleContactsForAccount,
  importGoogleContactsForAllAccounts,
} from "./googleContactsImport";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();
const mockRequest = vi.fn();

describe("googleContactsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTransaction).mockImplementation(async (fn) => {
      await fn(mockDb as never);
    });
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getGmailClient).mockResolvedValue({ request: mockRequest } as never);
  });

  it("imports connections and other contacts with pagination", async () => {
    mockRequest
      .mockResolvedValueOnce({
        connections: [
          { names: [{ displayName: "James Brady" }], emailAddresses: [{ value: "JBrady@Example.com" }] },
        ],
        nextPageToken: "page2",
      })
      .mockResolvedValueOnce({
        connections: [
          { names: [], emailAddresses: [{ value: "nico@example.com" }] },
        ],
      })
      .mockResolvedValueOnce({
        otherContacts: [
          { names: [{ displayName: "Kate" }], emailAddresses: [{ value: "kate@example.com" }] },
          { emailAddresses: [{ value: "not-an-email" }] },
        ],
      });

    const count = await importGoogleContactsForAccount("acct-1");

    expect(count).toBe(3);
    // Paginated: two connections pages + one otherContacts page
    expect(mockRequest).toHaveBeenCalledTimes(3);
    expect(String(mockRequest.mock.calls[1]![0])).toContain("pageToken=page2");
    // Upsert ran with normalized email and name
    const [sql, params] = vi.mocked(mockDb.execute).mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("ON CONFLICT(email) DO UPDATE");
    // Existing frequency (real interaction signal) is untouched on conflict
    expect(sql).not.toContain("frequency = ");
    expect(params).toContain("jbrady@example.com");
    expect(params).toContain("James Brady");
    expect(params).toContain("nico@example.com");
    expect(params).not.toContain("not-an-email");
    expect(setSetting).toHaveBeenCalledWith(
      expect.stringContaining("google_contacts_imported_at:acct-1"),
      expect.any(String),
    );
  });

  it("skips accounts imported within the last day", async () => {
    vi.mocked(getSetting).mockResolvedValue(String(Date.now() - 60_000));

    const count = await importGoogleContactsForAccount("acct-1");

    expect(count).toBe(0);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("handles missing contacts scopes (403) gracefully without recording an import", async () => {
    mockRequest.mockRejectedValue(new Error("Gmail API error: 403 insufficient scopes"));

    const count = await importGoogleContactsForAccount("acct-1");

    expect(count).toBe(0);
    expect(withTransaction).not.toHaveBeenCalled();
    // Not marked as imported, so it retries after the user re-authenticates
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("imports only gmail_api accounts and swallows per-account errors", async () => {
    vi.mocked(getAllAccounts).mockResolvedValue([
      { id: "a1", provider: "imap" },
      { id: "a2", provider: "gmail_api" },
      { id: "a3", provider: "caldav" },
    ] as never);
    mockRequest.mockRejectedValue(new Error("network down"));

    await expect(importGoogleContactsForAllAccounts()).resolves.toBeUndefined();
    expect(getGmailClient).toHaveBeenCalledTimes(1);
    expect(getGmailClient).toHaveBeenCalledWith("a2");
  });
});
