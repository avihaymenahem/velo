import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { freshTestDb, runMigrations, getTestAccountId, seedAccount, MockTauriDb } from "./setup";

let db: MockTauriDb;

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() => {
      db = freshTestDb();
      return Promise.resolve(db);
    }),
  },
}));

vi.mock("@/utils/crypto", () => ({
  encryptValue: vi.fn((val: string) => Promise.resolve(`enc:${val}`)),
  decryptValue: vi.fn((val: string) => Promise.resolve(val.replace("enc:", ""))),
  isEncrypted: vi.fn((val: string) => val.startsWith("enc:")),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe("Integration: Accounts", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetDb } = await import("@/services/db/connection");
    resetDb();
    await runMigrations();
  });

  afterEach(() => {
    db?.close();
  });

  describe("Test #1: Add Gmail account (mock OAuth)", () => {
    it("creates a Gmail API account with tokens persisted", async () => {
      const { insertAccount, getAccount } = await import("@/services/db/accounts");
      await insertAccount({
        id: getTestAccountId(),
        email: "user@gmail.com",
        displayName: "Gmail User",
        avatarUrl: null,
        accessToken: "ya29.mock-access-token",
        refreshToken: "1//mock-refresh-token",
        tokenExpiresAt: 9999999999,
      });
      const account = await getAccount(getTestAccountId());
      expect(account).not.toBeNull();
      expect(account!.email).toBe("user@gmail.com");
      expect(account!.provider).toBe("gmail_api");
      expect(account!.access_token).toBe("ya29.mock-access-token");
      expect(account!.refresh_token).toBe("1//mock-refresh-token");
      expect(account!.token_expires_at).toBe(9999999999);
      expect(account!.is_active).toBe(1);
    });

    it("returns account via getAllAccounts", async () => {
      const { insertAccount, getAllAccounts } = await import("@/services/db/accounts");
      await insertAccount({
        id: getTestAccountId(),
        email: "user@gmail.com",
        displayName: "Gmail User",
        avatarUrl: "https://example.com/avatar.png",
        accessToken: "ya29.token",
        refreshToken: "1//refresh",
        tokenExpiresAt: 9999999999,
      });
      const all = await getAllAccounts();
      expect(all).toHaveLength(1);
      expect(all[0]!.email).toBe("user@gmail.com");
      expect(all[0]!.avatar_url).toBe("https://example.com/avatar.png");
    });
  });

  describe("Test #2: Add IMAP account", () => {
    it("creates an IMAP account with host/port/security persisted", async () => {
      const { insertImapAccount, getAccount } = await import("@/services/db/accounts");
      await insertImapAccount({
        id: getTestAccountId(),
        email: "user@example.com",
        displayName: "IMAP User",
        avatarUrl: null,
        imapHost: "imap.example.com",
        imapPort: 993,
        imapSecurity: "ssl",
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
        authMethod: "password",
        password: "secret123",
      });
      const account = await getAccount(getTestAccountId());
      expect(account).not.toBeNull();
      expect(account!.provider).toBe("imap");
      expect(account!.imap_host).toBe("imap.example.com");
      expect(account!.imap_port).toBe(993);
      expect(account!.imap_security).toBe("ssl");
      expect(account!.smtp_host).toBe("smtp.example.com");
      expect(account!.smtp_port).toBe(587);
      expect(account!.smtp_security).toBe("starttls");
      expect(account!.auth_method).toBe("password");
    });

    it("creates IMAP account with optional imap_username", async () => {
      const { insertImapAccount, getAccount } = await import("@/services/db/accounts");
      await insertImapAccount({
        id: getTestAccountId(),
        email: "user@custom.com",
        displayName: null,
        avatarUrl: null,
        imapHost: "mail.custom.com",
        imapPort: 143,
        imapSecurity: "starttls",
        smtpHost: "mail.custom.com",
        smtpPort: 587,
        smtpSecurity: "starttls",
        authMethod: "password",
        password: "pass",
        imapUsername: "custom-username",
      });
      const account = await getAccount(getTestAccountId());
      expect(account!.imap_username).toBe("custom-username");
      expect(account!.imap_host).toBe("mail.custom.com");
    });

    it("insertImapAccount encrypts the password in the DB", async () => {
      const { insertImapAccount } = await import("@/services/db/accounts");
      await insertImapAccount({
        id: getTestAccountId(),
        email: "user@secure.com",
        displayName: null,
        avatarUrl: null,
        imapHost: "imap.secure.com",
        imapPort: 993,
        imapSecurity: "ssl",
        smtpHost: "smtp.secure.com",
        smtpPort: 465,
        smtpSecurity: "ssl",
        authMethod: "password",
        password: "my-password",
      });
      const raw = await db!.select<{ imap_password: string }[]>(
        "SELECT imap_password FROM accounts WHERE id = $1",
        [getTestAccountId()],
      );
      expect(raw[0]!.imap_password).toBe("enc:my-password");
    });
  });
});
