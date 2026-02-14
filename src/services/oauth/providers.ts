export interface OAuthProviderConfig {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  userInfoUrl?: string;
  /** Whether PKCE is required (Microsoft requires it, Yahoo supports it) */
  usePkce: boolean;
}

const providers: Record<string, OAuthProviderConfig> = {
  microsoft: {
    id: "microsoft",
    name: "Microsoft",
    authUrl:
      "https://login.microsoftonline.com/consumers/oauth2/v2/authorize",
    tokenUrl:
      "https://login.microsoftonline.com/consumers/oauth2/v2/token",
    scopes: [
      "https://outlook.office365.com/IMAP.AccessAsUser.All",
      "https://outlook.office365.com/SMTP.Send",
      "offline_access",
      "email",
      "openid",
      "profile",
    ],
    userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    usePkce: true,
  },
  yahoo: {
    id: "yahoo",
    name: "Yahoo",
    authUrl: "https://api.login.yahoo.com/oauth2/request_auth",
    tokenUrl: "https://api.login.yahoo.com/oauth2/get_token",
    scopes: ["mail-r", "mail-w", "openid", "sdps-r"],
    userInfoUrl: "https://api.login.yahoo.com/openid/v1/userinfo",
    usePkce: true,
  },
};

export function getOAuthProvider(id: string): OAuthProviderConfig | null {
  return providers[id] ?? null;
}

export function getAllOAuthProviders(): OAuthProviderConfig[] {
  return Object.values(providers);
}
