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
    const settings = findWellKnownProvider("outlook.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("outlook.office365.com");
    expect(settings!.smtpHost).toBe("smtp.office365.com");
    expect(settings!.smtpPort).toBe(587);
  });

  it("returns settings for hotmail.com (outlook alias)", () => {
    const settings = findWellKnownProvider("hotmail.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("outlook.office365.com");
  });

  it("returns settings for yahoo.com", () => {
    const settings = findWellKnownProvider("yahoo.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.mail.yahoo.com");
    expect(settings!.smtpHost).toBe("smtp.mail.yahoo.com");
  });

  it("returns settings for icloud.com", () => {
    const settings = findWellKnownProvider("icloud.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.mail.me.com");
  });

  it("returns settings for fastmail.com", () => {
    const settings = findWellKnownProvider("fastmail.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.fastmail.com");
  });

  it("returns settings for protonmail.com (local bridge)", () => {
    const settings = findWellKnownProvider("protonmail.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("127.0.0.1");
    expect(settings!.imapPort).toBe(1143);
  });

  it("returns null for unknown domain", () => {
    expect(findWellKnownProvider("mycustomdomain.org")).toBeNull();
  });

  it("is case insensitive", () => {
    const settings = findWellKnownProvider("OUTLOOK.COM");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("outlook.office365.com");
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
    const settings = discoverSettings("user@outlook.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("outlook.office365.com");
  });

  it("falls back to guessed settings for unknown domains", () => {
    const settings = discoverSettings("user@mycompany.io");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.mycompany.io");
    expect(settings!.smtpHost).toBe("smtp.mycompany.io");
  });

  it("returns null for invalid email", () => {
    expect(discoverSettings("not-an-email")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(discoverSettings("")).toBeNull();
  });

  it("handles yahoo alias ymail.com", () => {
    const settings = discoverSettings("user@ymail.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.mail.yahoo.com");
  });

  it("handles me.com (iCloud alias)", () => {
    const settings = discoverSettings("user@me.com");
    expect(settings).not.toBeNull();
    expect(settings!.imapHost).toBe("imap.mail.me.com");
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
