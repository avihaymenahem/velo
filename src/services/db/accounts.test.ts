import {
  getAllAccounts,
  getAccount,
  getAccountByEmail,
  insertImapAccount,
  insertAccount,
  deleteAccount,
  updateAccountTokens,
  updateAccountSyncState,
  type DbAccount,
} from "./accounts";

const mockExecute = vi.fn();
const mockSelect = vi.fn();

vi.mock("./connection", () => ({
  getDb: vi.fn(() => ({
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  })),
  selectFirstBy: vi.fn(),
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

import { selectFirstBy } from "./connection";

const mockSelectFirstBy = vi.mocked(selectFirstBy);

function makeGmailAccount(overrides: Partial<DbAccount> = {}): DbAccount {
  return {
    id: "acc-gmail",
    email: "user@gmail.com",
    display_name: "Gmail User",
    avatar_url: null,
    access_token: "enc:access-token",
    refresh_token: "enc:refresh-token",
    token_expires_at: 9999999999,
    history_id: "12345",
    last_sync_at: 1700000000,
    is_active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider: "gmail_api",
    imap_host: null,
    imap_port: null,
    imap_security: null,
    smtp_host: null,
    smtp_port: null,
    smtp_security: null,
    auth_method: "oauth",
    imap_password: null,
    ...overrides,
  };
}

function makeImapAccount(overrides: Partial<DbAccount> = {}): DbAccount {
  return {
    id: "acc-imap",
    email: "user@example.com",
    display_name: "IMAP User",
    avatar_url: null,
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    history_id: null,
    last_sync_at: null,
    is_active: 1,
    created_at: 1700000000,
    updated_at: 1700000000,
    provider: "imap",
    imap_host: "imap.example.com",
    imap_port: 993,
    imap_security: "tls",
    smtp_host: "smtp.example.com",
    smtp_port: 465,
    smtp_security: "tls",
    auth_method: "password",
    imap_password: "enc:secret-password",
    ...overrides,
  };
}

describe("accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAccount", () => {
    it("returns null for non-existent account", async () => {
      mockSelectFirstBy.mockResolvedValue(null);

      const result = await getAccount("nonexistent");

      expect(result).toBeNull();
    });

    it("returns a Gmail account with decrypted tokens", async () => {
      mockSelectFirstBy.mockResolvedValue(makeGmailAccount());

      const result = await getAccount("acc-gmail");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("acc-gmail");
      expect(result!.provider).toBe("gmail_api");
      expect(result!.access_token).toBe("access-token");
      expect(result!.refresh_token).toBe("refresh-token");
    });

    it("returns an IMAP account with decrypted imap_password", async () => {
      mockSelectFirstBy.mockResolvedValue(makeImapAccount());

      const result = await getAccount("acc-imap");

      expect(result).not.toBeNull();
      expect(result!.provider).toBe("imap");
      expect(result!.imap_host).toBe("imap.example.com");
      expect(result!.imap_port).toBe(993);
      expect(result!.imap_security).toBe("tls");
      expect(result!.smtp_host).toBe("smtp.example.com");
      expect(result!.smtp_port).toBe(465);
      expect(result!.smtp_security).toBe("tls");
      expect(result!.auth_method).toBe("password");
      expect(result!.imap_password).toBe("secret-password");
    });

    it("handles IMAP account with null imap_password gracefully", async () => {
      mockSelectFirstBy.mockResolvedValue(
        makeImapAccount({ imap_password: null }),
      );

      const result = await getAccount("acc-imap");

      expect(result!.imap_password).toBeNull();
    });
  });

  describe("getAccountByEmail", () => {
    it("returns account matching email", async () => {
      mockSelectFirstBy.mockResolvedValue(makeImapAccount());

      const result = await getAccountByEmail("user@example.com");

      expect(result).not.toBeNull();
      expect(result!.email).toBe("user@example.com");
    });

    it("returns null when email not found", async () => {
      mockSelectFirstBy.mockResolvedValue(null);

      const result = await getAccountByEmail("unknown@example.com");

      expect(result).toBeNull();
    });
  });

  describe("getAllAccounts", () => {
    it("returns all accounts with decrypted tokens", async () => {
      mockSelect.mockResolvedValue([makeGmailAccount(), makeImapAccount()]);

      const result = await getAllAccounts();

      expect(result).toHaveLength(2);
      expect(result[0]!.provider).toBe("gmail_api");
      expect(result[0]!.access_token).toBe("access-token");
      expect(result[1]!.provider).toBe("imap");
      expect(result[1]!.imap_password).toBe("secret-password");
    });

    it("returns empty array when no accounts exist", async () => {
      mockSelect.mockResolvedValue([]);

      const result = await getAllAccounts();

      expect(result).toEqual([]);
    });

    it("decrypts imap_password for IMAP accounts in the list", async () => {
      mockSelect.mockResolvedValue([makeImapAccount()]);

      const result = await getAllAccounts();

      expect(result[0]!.imap_password).toBe("secret-password");
    });
  });

  describe("insertImapAccount", () => {
    it("inserts IMAP account with encrypted password", async () => {
      mockExecute.mockResolvedValue(undefined);

      await insertImapAccount({
        id: "new-imap",
        email: "user@fastmail.com",
        displayName: "Fastmail User",
        avatarUrl: null,
        imapHost: "imap.fastmail.com",
        imapPort: 993,
        imapSecurity: "ssl",
        smtpHost: "smtp.fastmail.com",
        smtpPort: 465,
        smtpSecurity: "ssl",
        authMethod: "password",
        password: "my-app-password",
      });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO accounts");
      expect(sql).toContain("'imap'");
      expect(params).toEqual([
        "new-imap",
        "user@fastmail.com",
        "Fastmail User",
        null,
        "imap.fastmail.com",
        993,
        "ssl",
        "smtp.fastmail.com",
        465,
        "ssl",
        "password",
        "enc:my-app-password", // encrypted
      ]);
    });

    it("sets access_token and refresh_token to NULL for IMAP accounts", async () => {
      mockExecute.mockResolvedValue(undefined);

      await insertImapAccount({
        id: "imap-1",
        email: "test@test.com",
        displayName: null,
        avatarUrl: null,
        imapHost: "imap.test.com",
        imapPort: 993,
        imapSecurity: "tls",
        smtpHost: "smtp.test.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
        authMethod: "password",
        password: "pass",
      });

      const [sql] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("NULL, NULL");
      expect(sql).toContain("'imap'");
    });
  });

  describe("insertAccount (Gmail/OAuth)", () => {
    it("inserts OAuth account with encrypted tokens", async () => {
      mockExecute.mockResolvedValue(undefined);

      await insertAccount({
        id: "gmail-1",
        email: "user@gmail.com",
        displayName: "Test User",
        avatarUrl: "https://example.com/avatar.jpg",
        accessToken: "access-token-123",
        refreshToken: "refresh-token-456",
        tokenExpiresAt: 9999999999,
      });

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("INSERT INTO accounts");
      expect(params).toContain("enc:access-token-123");
      expect(params).toContain("enc:refresh-token-456");
    });
  });

  describe("deleteAccount", () => {
    it("deletes account by id", async () => {
      mockExecute.mockResolvedValue(undefined);

      await deleteAccount("acc-1");

      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("DELETE FROM accounts");
      expect(params).toEqual(["acc-1"]);
    });
  });

  describe("updateAccountTokens", () => {
    it("updates access_token with encryption", async () => {
      mockExecute.mockResolvedValue(undefined);

      await updateAccountTokens("acc-1", "new-token", 1234567890);

      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("UPDATE accounts SET access_token");
      expect(params).toContain("enc:new-token");
      expect(params).toContain(1234567890);
    });
  });

  describe("updateAccountSyncState", () => {
    it("updates history_id and last_sync_at", async () => {
      mockExecute.mockResolvedValue(undefined);

      await updateAccountSyncState("acc-1", "history-999");

      const [sql, params] = mockExecute.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("UPDATE accounts SET history_id");
      expect(params).toEqual(["history-999", "acc-1"]);
    });
  });
});
