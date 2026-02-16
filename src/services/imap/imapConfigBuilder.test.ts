import { describe, it, expect } from "vitest";
import { buildImapConfig, buildSmtpConfig } from "./imapConfigBuilder";
import { createMockDbAccount } from "@/test/mocks";

describe("buildImapConfig", () => {
  it("builds config from account with ssl security mapped to tls", () => {
    const account = createMockDbAccount();
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
    const account = createMockDbAccount({ imap_security: "tls" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("tls");
  });

  it("maps starttls security to starttls", () => {
    const account = createMockDbAccount({ imap_security: "starttls" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("starttls");
  });

  it("maps none security to none", () => {
    const account = createMockDbAccount({ imap_security: "none" });
    const config = buildImapConfig(account);
    expect(config.security).toBe("none");
  });

  it("defaults to tls when security is null", () => {
    const account = createMockDbAccount({ imap_security: null });
    const config = buildImapConfig(account);
    expect(config.security).toBe("tls");
  });

  it("defaults port to 993 when null", () => {
    const account = createMockDbAccount({ imap_port: null });
    const config = buildImapConfig(account);
    expect(config.port).toBe(993);
  });

  it("handles oauth2 auth method", () => {
    const account = createMockDbAccount({ auth_method: "oauth2" });
    const config = buildImapConfig(account);
    expect(config.auth_method).toBe("oauth2");
  });

  it("uses accessToken override for oauth2 accounts", () => {
    const account = createMockDbAccount({ auth_method: "oauth2", imap_password: "old" });
    const config = buildImapConfig(account, "fresh-token");
    expect(config.password).toBe("fresh-token");
    expect(config.auth_method).toBe("oauth2");
  });

  it("ignores accessToken override for password accounts", () => {
    const account = createMockDbAccount({ auth_method: "password" });
    const config = buildImapConfig(account, "should-not-use");
    expect(config.password).toBe("secret123");
  });

  it("throws when imap_host is missing", () => {
    const account = createMockDbAccount({ imap_host: null });
    expect(() => buildImapConfig(account)).toThrow("no IMAP host configured");
  });

  it("handles empty password gracefully", () => {
    const account = createMockDbAccount({ imap_password: null });
    const config = buildImapConfig(account);
    expect(config.password).toBe("");
  });
});

describe("buildSmtpConfig", () => {
  it("builds config from account SMTP fields", () => {
    const account = createMockDbAccount();
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
    const account = createMockDbAccount({ smtp_port: null });
    const config = buildSmtpConfig(account);
    expect(config.port).toBe(587);
  });

  it("throws when smtp_host is missing", () => {
    const account = createMockDbAccount({ smtp_host: null });
    expect(() => buildSmtpConfig(account)).toThrow("no SMTP host configured");
  });

  it("maps ssl security to tls for SMTP", () => {
    const account = createMockDbAccount({ smtp_security: "ssl" });
    const config = buildSmtpConfig(account);
    expect(config.security).toBe("tls");
  });

  it("uses accessToken override for oauth2 SMTP", () => {
    const account = createMockDbAccount({ auth_method: "oauth2" });
    const config = buildSmtpConfig(account, "smtp-oauth-token");
    expect(config.password).toBe("smtp-oauth-token");
    expect(config.auth_method).toBe("oauth2");
  });
});

describe("imap_username override", () => {
  it("uses imap_username when set for IMAP config", () => {
    const account = createMockDbAccount({ imap_username: "custom-user" });
    const config = buildImapConfig(account);
    expect(config.username).toBe("custom-user");
  });

  it("uses imap_username when set for SMTP config", () => {
    const account = createMockDbAccount({ imap_username: "custom-user" });
    const config = buildSmtpConfig(account);
    expect(config.username).toBe("custom-user");
  });

  it("falls back to email when imap_username is null", () => {
    const account = createMockDbAccount({ imap_username: null });
    const config = buildImapConfig(account);
    expect(config.username).toBe("user@example.com");
  });

  it("falls back to email when imap_username is empty string", () => {
    const account = createMockDbAccount({ imap_username: "" as string | null });
    const config = buildImapConfig(account);
    expect(config.username).toBe("user@example.com");
  });
});
