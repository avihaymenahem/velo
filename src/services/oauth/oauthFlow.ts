import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { OAuthProviderConfig } from "./providers";

const OAUTH_CALLBACK_PORT = 17248;

interface OAuthServerResult {
  code: string;
  state: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface ProviderUserInfo {
  email: string;
  name: string;
  picture?: string;
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Start the OAuth2 + PKCE flow for a non-Gmail provider.
 * 1. Start localhost callback server (Rust)
 * 2. Open browser to provider consent screen
 * 3. Capture redirect with auth code
 * 4. Exchange code for tokens
 * 5. Fetch user profile info
 */
export async function startProviderOAuthFlow(
  provider: OAuthProviderConfig,
  clientId: string,
  clientSecret?: string,
): Promise<{ tokens: TokenResponse; userInfo: ProviderUserInfo }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const stateArray = new Uint8Array(32);
  crypto.getRandomValues(stateArray);
  const oauthState = base64UrlEncode(stateArray);

  const redirectUri = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}`;

  const params: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: provider.scopes.join(" "),
    state: oauthState,
  };

  if (provider.usePkce) {
    params.code_challenge = codeChallenge;
    params.code_challenge_method = "S256";
  }

  // Provider-specific auth params
  if (provider.id === "microsoft") {
    params.prompt = "consent";
    params.response_mode = "query";
  }

  const authUrl = `${provider.authUrl}?${new URLSearchParams(params).toString()}`;

  const serverPromise = invoke<OAuthServerResult>("start_oauth_server", {
    port: OAUTH_CALLBACK_PORT,
    state: oauthState,
  });

  await new Promise((r) => setTimeout(r, 100));
  await openUrl(authUrl);

  const result = await serverPromise;

  if (result.state !== oauthState) {
    throw new Error("OAuth state mismatch — possible CSRF attack. Please try again.");
  }

  const tokens = await exchangeCode(
    provider,
    result.code,
    clientId,
    redirectUri,
    codeVerifier,
    clientSecret,
  );

  const userInfo = await fetchUserInfo(provider, tokens.access_token);

  return { tokens, userInfo };
}

async function exchangeCode(
  provider: OAuthProviderConfig,
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  const params: Record<string, string> = {
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  };

  if (provider.usePkce) {
    params.code_verifier = codeVerifier;
  }
  if (clientSecret) {
    params.client_secret = clientSecret;
  }
  // Microsoft requires scope in token exchange
  if (provider.id === "microsoft") {
    params.scope = provider.scopes.join(" ");
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

/**
 * Refresh an expired access token for a non-Gmail provider.
 */
export async function refreshProviderToken(
  provider: OAuthProviderConfig,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<TokenResponse> {
  const params: Record<string, string> = {
    refresh_token: refreshToken,
    client_id: clientId,
    grant_type: "refresh_token",
  };
  if (clientSecret) {
    params.client_secret = clientSecret;
  }
  if (provider.id === "microsoft") {
    params.scope = provider.scopes.join(" ");
  }

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  return response.json();
}

async function fetchUserInfo(
  provider: OAuthProviderConfig,
  accessToken: string,
): Promise<ProviderUserInfo> {
  if (!provider.userInfoUrl) {
    throw new Error(`Provider ${provider.id} has no user info endpoint`);
  }

  const response = await fetch(provider.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${await response.text()}`);
  }

  const data = await response.json();

  // Normalize response across providers
  if (provider.id === "microsoft") {
    return {
      email: data.mail || data.userPrincipalName || "",
      name: data.displayName || "",
      picture: undefined,
    };
  }
  if (provider.id === "yahoo") {
    return {
      email: data.email || "",
      name: data.name || data.nickname || "",
      picture: data.picture || undefined,
    };
  }

  return {
    email: data.email || "",
    name: data.name || "",
    picture: data.picture || undefined,
  };
}
