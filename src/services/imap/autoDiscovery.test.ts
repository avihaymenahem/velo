import { describe, it, expect } from "vitest";
import {
  extractDomain,
  findWellKnownProvider,
  guessServerSettings,
  discoverSettings,
  getDefaultSmtpPort,
  getDefaultImapPort,
} from "./autoDiscovery";

describe("extractDomain", () => {
  it("extracts domain from a valid email", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
  });

  it("handles uppercase emails", () => {
    expect(extractDomain("User@Example.COM")).toBe("example.com");
  });

  it("trims whitespace", () => {
    expect(extractDomain("  user@example.com  ")).toBe("example.com");
  });

  it("returns null for email without @", () => {
    expect(extractDomain("invalid-email")).toBeNull();
  });

  it("returns null for email ending with @", () => {
    expect(extractDomain("user@")).toBeNull();
  });

  it("returns null for email starting with @", () => {
    expect(extractDomain("@example.com")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull();
  });

  it("uses the last @ when multiple @ signs present", () => {
    expect(extractDomain("user@middle@example.com")).toBe("example.com");
  });
});

describe("findWellKnownProvider", () => {
  it("returns settings for outlook.com", () => {
    const result = findWellKnownProvider("outlook.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap-mail.outlook.com");
    expect(result!.settings.smtpHost).toBe("smtp-mail.outlook.com");
    expect(result!.settings.smtpPort).toBe(587);
    expect(result!.authMethods).toEqual(["oauth2"]);
    expect(result!.oauthProviderId).toBe("microsoft");
  });

  it("returns settings for hotmail.com (outlook alias)", () => {
    const result = findWellKnownProvider("hotmail.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap-mail.outlook.com");
  });

  it("returns settings for yahoo.com", () => {
    const result = findWellKnownProvider("yahoo.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.mail.yahoo.com");
    expect(result!.settings.smtpHost).toBe("smtp.mail.yahoo.com");
    expect(result!.authMethods).toEqual(["oauth2", "password"]);
    expect(result!.oauthProviderId).toBe("yahoo");
  });

  it("returns settings for icloud.com", () => {
    const result = findWellKnownProvider("icloud.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.mail.me.com");
    expect(result!.authMethods).toEqual(["password"]);
  });

  it("returns settings for fastmail.com", () => {
    const result = findWellKnownProvider("fastmail.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.fastmail.com");
  });

  it("returns settings for protonmail.com (local bridge)", () => {
    const result = findWellKnownProvider("protonmail.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("127.0.0.1");
    expect(result!.settings.imapPort).toBe(1143);
    expect(result!.acceptInvalidCerts).toBe(true);
  });

  it("returns acceptInvalidCerts true for proton.me", () => {
    const result = findWellKnownProvider("proton.me");
    expect(result).not.toBeNull();
    expect(result!.acceptInvalidCerts).toBe(true);
  });

  it("does not set acceptInvalidCerts for regular providers", () => {
    const result = findWellKnownProvider("outlook.com");
    expect(result).not.toBeNull();
    expect(result!.acceptInvalidCerts).toBeUndefined();
  });

  it("returns null for unknown domain", () => {
    expect(findWellKnownProvider("mycustomdomain.org")).toBeNull();
  });

  it("is case insensitive", () => {
    const result = findWellKnownProvider("OUTLOOK.COM");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap-mail.outlook.com");
  });

  it("returns a copy (not a reference)", () => {
    const s1 = findWellKnownProvider("yahoo.com");
    const s2 = findWellKnownProvider("yahoo.com");
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });
});

describe("guessServerSettings", () => {
  it("generates imap.{domain} and smtp.{domain}", () => {
    const settings = guessServerSettings("example.com");
    expect(settings.imapHost).toBe("imap.example.com");
    expect(settings.smtpHost).toBe("smtp.example.com");
  });

  it("uses SSL for IMAP on port 993", () => {
    const settings = guessServerSettings("example.com");
    expect(settings.imapPort).toBe(993);
    expect(settings.imapSecurity).toBe("ssl");
  });

  it("uses STARTTLS for SMTP on port 587", () => {
    const settings = guessServerSettings("example.com");
    expect(settings.smtpPort).toBe(587);
    expect(settings.smtpSecurity).toBe("starttls");
  });
});

describe("discoverSettings", () => {
  it("returns well-known settings for known providers", () => {
    const result = discoverSettings("user@outlook.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap-mail.outlook.com");
  });

  it("falls back to guessed settings for unknown domains", () => {
    const result = discoverSettings("user@mycompany.io");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.mycompany.io");
    expect(result!.settings.smtpHost).toBe("smtp.mycompany.io");
    expect(result!.authMethods).toEqual(["password"]);
  });

  it("returns null for invalid email", () => {
    expect(discoverSettings("not-an-email")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(discoverSettings("")).toBeNull();
  });

  it("handles yahoo alias ymail.com", () => {
    const result = discoverSettings("user@ymail.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.mail.yahoo.com");
  });

  it("handles me.com (iCloud alias)", () => {
    const result = discoverSettings("user@me.com");
    expect(result).not.toBeNull();
    expect(result!.settings.imapHost).toBe("imap.mail.me.com");
  });
});

describe("getDefaultSmtpPort", () => {
  it("returns 465 for SSL", () => {
    expect(getDefaultSmtpPort("ssl")).toBe(465);
  });

  it("returns 587 for STARTTLS", () => {
    expect(getDefaultSmtpPort("starttls")).toBe(587);
  });

  it("returns 25 for none", () => {
    expect(getDefaultSmtpPort("none")).toBe(25);
  });
});

describe("getDefaultImapPort", () => {
  it("returns 993 for SSL", () => {
    expect(getDefaultImapPort("ssl")).toBe(993);
  });

  it("returns 143 for STARTTLS", () => {
    expect(getDefaultImapPort("starttls")).toBe(143);
  });

  it("returns 143 for none", () => {
    expect(getDefaultImapPort("none")).toBe(143);
  });
});
