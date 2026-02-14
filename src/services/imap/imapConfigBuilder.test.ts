import { describe, it, expect } from "vitest";
import { buildImapConfig, buildSmtpConfig } from "./imapConfigBuilder";
import type { DbAccount } from "../db/accounts";

function makeAccount(overrides: Partial<DbAccount> = {}): DbAccount {
  return {
    id: "acc-1",
    email: "user@example.com",
    display_name: "Test User",
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
    imap_security: "ssl",
    smtp_host: "smtp.example.com",
    smtp_port: 587,
    smtp_security: "starttls",
    auth_method: "password",
    imap_password: "secret123",
    ...overrides,
  };
}

describe("buildImapConfig", () => {
  it("builds config from account with ssl security mapped to tls", () => {
    const account = makeAccount();
    const config = buildImapConfig(account);

    expect(config).toEqual({
      host: "imap.example.com",
      port: 993,
      security: "tls",
      username: "user@example.com",
      password: "secret123",
      auth_method: "password",
    });
  });

  it("maps tls security to tls", () => {
    const account = makeAccount({ imap_security: "tls" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("tls");
  });

  it("maps starttls security to starttls", () => {
    const account = makeAccount({ imap_security: "starttls" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("starttls");
  });

  it("maps none security to none", () => {
    const account = makeAccount({ imap_security: "none" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("none");
  });

  it("defaults to tls when security is null", () => {
    const account = makeAccount({ imap_security: null });
    const config = buildImapConfig(account);
    expect(config.security).toBe("tls");
  });

  it("defaults port to 993 when null", () => {
    const account = makeAccount({ imap_port: null });
    const config = buildImapConfig(account);
    expect(config.port).toBe(993);
  });

  it("handles oauth2 auth method", () => {
    const account = makeAccount({ auth_method: "oauth2" });
    const config = buildImapConfig(account);
    expect(config.auth_method).toBe("oauth2");
  });

  it("throws when imap_host is missing", () => {
    const account = makeAccount({ imap_host: null });
    expect(() => buildImapConfig(account)).toThrow("no IMAP host configured");
  });

  it("handles empty password gracefully", () => {
    const account = makeAccount({ imap_password: null });
    const config = buildImapConfig(account);
    expect(config.password).toBe("");
  });
});

describe("buildSmtpConfig", () => {
  it("builds config from account SMTP fields", () => {
    const account = makeAccount();
    const config = buildSmtpConfig(account);

    expect(config).toEqual({
      host: "smtp.example.com",
      port: 587,
      security: "starttls",
      username: "user@example.com",
      password: "secret123",
      auth_method: "password",
    });
  });

  it("defaults port to 587 when null", () => {
    const account = makeAccount({ smtp_port: null });
    const config = buildSmtpConfig(account);
    expect(config.port).toBe(587);
  });

  it("throws when smtp_host is missing", () => {
    const account = makeAccount({ smtp_host: null });
    expect(() => buildSmtpConfig(account)).toThrow("no SMTP host configured");
  });

  it("maps ssl security to tls for SMTP", () => {
    const account = makeAccount({ smtp_security: "ssl" });
    const config = buildSmtpConfig(account);
    expect(config.security).toBe("tls");
  });
});
