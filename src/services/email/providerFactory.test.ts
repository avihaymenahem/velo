import {
  getEmailProvider,
  removeProvider,
  clearAllProviders,
} from "./providerFactory";
import { GmailApiProvider } from "./gmailProvider";
import { ImapSmtpProvider } from "./imapSmtpProvider";
import { getAccount } from "../db/accounts";
import { getGmailClient } from "../gmail/tokenManager";

vi.mock("../db/accounts", () => ({
  getAccount: vi.fn(),
}));

vi.mock("../gmail/tokenManager", () => ({
  getGmailClient: vi.fn(),
}));

describe("providerFactory", () => {
  beforeEach(() => {
    clearAllProviders();
    vi.clearAllMocks();
  });

  it("returns GmailApiProvider for gmail_api accounts", async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: "acc-1",
      email: "user@gmail.com",
      display_name: null,
      avatar_url: null,
      access_token: "token",
      refresh_token: "refresh",
      token_expires_at: 9999999999,
      history_id: null,
      last_sync_at: null,
      is_active: 1,
      created_at: 0,
      updated_at: 0,
      provider: "gmail_api",
      imap_host: null,
      imap_port: null,
      imap_security: null,
      smtp_host: null,
      smtp_port: null,
      smtp_security: null,
      auth_method: "oauth",
      imap_password: null,
    });
    vi.mocked(getGmailClient).mockResolvedValue({} as ReturnType<typeof getGmailClient> extends Promise<infer T> ? T : never);

    const provider = await getEmailProvider("acc-1");

    expect(provider).toBeInstanceOf(GmailApiProvider);
    expect(provider.accountId).toBe("acc-1");
    expect(provider.type).toBe("gmail_api");
  });

  it("returns ImapSmtpProvider for imap accounts", async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: "acc-2",
      email: "user@example.com",
      display_name: null,
      avatar_url: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      history_id: null,
      last_sync_at: null,
      is_active: 1,
      created_at: 0,
      updated_at: 0,
      provider: "imap",
      imap_host: "imap.example.com",
      imap_port: 993,
      imap_security: "tls",
      smtp_host: "smtp.example.com",
      smtp_port: 465,
      smtp_security: "tls",
      auth_method: "password",
      imap_password: "secret",
    });

    const provider = await getEmailProvider("acc-2");

    expect(provider).toBeInstanceOf(ImapSmtpProvider);
    expect(provider.accountId).toBe("acc-2");
    expect(provider.type).toBe("imap");
  });

  it("caches providers and returns same instance", async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: "acc-3",
      email: "user@example.com",
      display_name: null,
      avatar_url: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      history_id: null,
      last_sync_at: null,
      is_active: 1,
      created_at: 0,
      updated_at: 0,
      provider: "imap",
      imap_host: "imap.example.com",
      imap_port: 993,
      imap_security: "tls",
      smtp_host: "smtp.example.com",
      smtp_port: 465,
      smtp_security: "tls",
      auth_method: "password",
      imap_password: "secret",
    });

    const first = await getEmailProvider("acc-3");
    const second = await getEmailProvider("acc-3");

    expect(first).toBe(second);
    // getAccount should only be called once due to caching
    expect(getAccount).toHaveBeenCalledTimes(1);
  });

  it("removeProvider evicts from cache", async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: "acc-4",
      email: "user@example.com",
      display_name: null,
      avatar_url: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      history_id: null,
      last_sync_at: null,
      is_active: 1,
      created_at: 0,
      updated_at: 0,
      provider: "imap",
      imap_host: "imap.example.com",
      imap_port: 993,
      imap_security: "tls",
      smtp_host: "smtp.example.com",
      smtp_port: 465,
      smtp_security: "tls",
      auth_method: "password",
      imap_password: "secret",
    });

    const first = await getEmailProvider("acc-4");
    removeProvider("acc-4");
    const second = await getEmailProvider("acc-4");

    expect(first).not.toBe(second);
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it("clearAllProviders empties the cache", async () => {
    vi.mocked(getAccount).mockResolvedValue({
      id: "acc-5",
      email: "user@example.com",
      display_name: null,
      avatar_url: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      history_id: null,
      last_sync_at: null,
      is_active: 1,
      created_at: 0,
      updated_at: 0,
      provider: "imap",
      imap_host: "imap.example.com",
      imap_port: 993,
      imap_security: "tls",
      smtp_host: "smtp.example.com",
      smtp_port: 465,
      smtp_security: "tls",
      auth_method: "password",
      imap_password: "secret",
    });

    const first = await getEmailProvider("acc-5");
    clearAllProviders();
    const second = await getEmailProvider("acc-5");

    expect(first).not.toBe(second);
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  it("throws when account is not found", async () => {
    vi.mocked(getAccount).mockResolvedValue(null);

    await expect(getEmailProvider("nonexistent")).rejects.toThrow(
      "Account nonexistent not found",
    );
  });
});
