import { describe, it, expect } from "vitest";
import { getOAuthProvider, getAllOAuthProviders } from "./providers";

describe("getOAuthProvider", () => {
  it("returns microsoft provider config", () => {
    const provider = getOAuthProvider("microsoft");
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe("microsoft");
    expect(provider!.name).toBe("Microsoft");
    expect(provider!.authUrl).toContain("login.microsoftonline.com");
    expect(provider!.tokenUrl).toContain("login.microsoftonline.com");
    expect(provider!.scopes).toContain("https://outlook.office.com/IMAP.AccessAsUser.All");
    expect(provider!.scopes).toContain("https://outlook.office.com/SMTP.Send");
    expect(provider!.scopes).toContain("offline_access");
    expect(provider!.scopes).toContain("openid");
    expect(provider!.scopes).toContain("profile");
    expect(provider!.scopes).toContain("email");
    expect(provider!.userInfoUrl).toBeUndefined();
    expect(provider!.usePkce).toBe(true);
  });

  it("returns yahoo provider config", () => {
    const provider = getOAuthProvider("yahoo");
    expect(provider).not.toBeNull();
    expect(provider!.id).toBe("yahoo");
    expect(provider!.name).toBe("Yahoo");
    expect(provider!.authUrl).toContain("login.yahoo.com");
    expect(provider!.scopes).toContain("mail-r");
    expect(provider!.scopes).toContain("mail-w");
    expect(provider!.usePkce).toBe(true);
  });

  it("returns null for unknown provider", () => {
    expect(getOAuthProvider("unknown")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getOAuthProvider("")).toBeNull();
  });
});

describe("getAllOAuthProviders", () => {
  it("returns all registered providers", () => {
    const providers = getAllOAuthProviders();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("microsoft");
    expect(ids).toContain("yahoo");
  });
});
