import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/accounts", () => ({
  updateAccountTokens: vi.fn(),
}));

vi.mock("./providers", () => ({
  getOAuthProvider: vi.fn(),
}));

vi.mock("./oauthFlow", () => ({
  refreshProviderToken: vi.fn(),
}));

import { ensureFreshToken } from "./oauthTokenManager";
import { updateAccountTokens } from "../db/accounts";
import { getOAuthProvider } from "./providers";
import { refreshProviderToken } from "./oauthFlow";
import { createMockDbAccount } from "@/test/mocks";

const oauthOverrides = {
  email: "user@outlook.com",
  display_name: "Test",
  access_token: "current-token",
  refresh_token: "refresh-token",
  token_expires_at: Math.floor(Date.now() / 1000) + 3600,
  imap_host: "outlook.office365.com",
  smtp_host: "smtp.office365.com",
  auth_method: "oauth2",
  oauth_provider: "microsoft",
  oauth_client_id: "client-id-123",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureFreshToken", () => {
  it("returns existing token when not expired", async () => {
    const account = createMockDbAccount(oauthOverrides);
    const token = await ensureFreshToken(account);
    expect(token).toBe("current-token");
    expect(refreshProviderToken).not.toHaveBeenCalled();
  });

  it("returns password for non-oauth accounts", async () => {
    const account = createMockDbAccount({
      ...oauthOverrides,
      auth_method: "password",
      oauth_provider: null,
      access_token: null,
      imap_password: "my-password",
    });
    const token = await ensureFreshToken(account);
    expect(token).toBe("my-password");
    expect(refreshProviderToken).not.toHaveBeenCalled();
  });

  it("refreshes token when expired", async () => {
    const account = createMockDbAccount({
      ...oauthOverrides,
      token_expires_at: Math.floor(Date.now() / 1000) - 60, // expired
    });

    const mockProvider = { id: "microsoft", name: "Microsoft" };
    vi.mocked(getOAuthProvider).mockReturnValue(mockProvider as ReturnType<typeof getOAuthProvider>);
    vi.mocked(refreshProviderToken).mockResolvedValue({
      access_token: "new-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const token = await ensureFreshToken(account);

    expect(token).toBe("new-token");
    expect(refreshProviderToken).toHaveBeenCalledWith(
      mockProvider,
      "refresh-token",
      "client-id-123",
      undefined,
    );
    expect(updateAccountTokens).toHaveBeenCalledWith(
      "acc-1",
      "new-token",
      expect.any(Number),
    );
  });

  it("refreshes token within 5-minute buffer", async () => {
    const account = createMockDbAccount({
      ...oauthOverrides,
      token_expires_at: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now (within 5-min buffer)
    });

    const mockProvider = { id: "microsoft", name: "Microsoft" };
    vi.mocked(getOAuthProvider).mockReturnValue(mockProvider as ReturnType<typeof getOAuthProvider>);
    vi.mocked(refreshProviderToken).mockResolvedValue({
      access_token: "refreshed-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const token = await ensureFreshToken(account);
    expect(token).toBe("refreshed-token");
  });

  it("throws when no access token", async () => {
    const account = createMockDbAccount({ ...oauthOverrides, access_token: null });
    await expect(ensureFreshToken(account)).rejects.toThrow("no access token");
  });

  it("throws when no refresh token", async () => {
    const account = createMockDbAccount({
      ...oauthOverrides,
      refresh_token: null,
      token_expires_at: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(ensureFreshToken(account)).rejects.toThrow("no refresh token");
  });

  it("throws for unknown provider", async () => {
    const account = createMockDbAccount({
      ...oauthOverrides,
      oauth_provider: "unknown",
      token_expires_at: Math.floor(Date.now() / 1000) - 60,
    });
    vi.mocked(getOAuthProvider).mockReturnValue(null);
    await expect(ensureFreshToken(account)).rejects.toThrow("Unknown OAuth provider");
  });
});
