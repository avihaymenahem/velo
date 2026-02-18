export type SecurityType = "ssl" | "starttls" | "none";
export type AuthMethod = "password" | "oauth2";

export interface ServerSettings {
  imapHost: string;
  imapPort: number;
  imapSecurity: SecurityType;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SecurityType;
}

interface WellKnownProvider {
  domains: string[];
  settings: ServerSettings;
  /** Supported authentication methods, in preference order */
  authMethods: AuthMethod[];
  /** OAuth provider ID (matches oauth/providers.ts registry) */
  oauthProviderId?: string;
}

const wellKnownProviders: WellKnownProvider[] = [
  {
    domains: [
      "outlook.com",
      "hotmail.com",
      "live.com",
      "msn.com",
      "outlook.co.uk",
      "hotmail.co.uk",
    ],
    settings: {
      imapHost: "imap-mail.outlook.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp-mail.outlook.com",
      smtpPort: 587,
      smtpSecurity: "starttls",
    },
    authMethods: ["oauth2"],
    oauthProviderId: "microsoft",
  },
  {
    domains: ["yahoo.com", "yahoo.co.uk", "yahoo.co.jp", "ymail.com"],
    settings: {
      imapHost: "imap.mail.yahoo.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.mail.yahoo.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["oauth2", "password"],
    oauthProviderId: "yahoo",
  },
  {
    domains: ["icloud.com", "me.com", "mac.com"],
    settings: {
      imapHost: "imap.mail.me.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.mail.me.com",
      smtpPort: 587,
      smtpSecurity: "starttls",
    },
    authMethods: ["password"],
  },
  {
    domains: ["aol.com"],
    settings: {
      imapHost: "imap.aol.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.aol.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
  {
    domains: ["zoho.com", "zohomail.com"],
    settings: {
      imapHost: "imap.zoho.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.zoho.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
  {
    domains: ["fastmail.com", "fastmail.fm"],
    settings: {
      imapHost: "imap.fastmail.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.fastmail.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
  {
    domains: ["protonmail.com", "proton.me", "pm.me"],
    settings: {
      imapHost: "127.0.0.1",
      imapPort: 1143,
      imapSecurity: "starttls",
      smtpHost: "127.0.0.1",
      smtpPort: 1025,
      smtpSecurity: "starttls",
    },
    authMethods: ["password"],
  },
  {
    domains: ["gmx.com", "gmx.net", "gmx.de"],
    settings: {
      imapHost: "imap.gmx.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "mail.gmx.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
  {
    domains: ["mail.ru", "inbox.ru", "list.ru", "bk.ru"],
    settings: {
      imapHost: "imap.mail.ru",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "smtp.mail.ru",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
  {
    domains: ["mailo.com", "net-c.com", "netc.fr"],
    settings: {
      imapHost: "mail.mailo.com",
      imapPort: 993,
      imapSecurity: "ssl",
      smtpHost: "mail.mailo.com",
      smtpPort: 465,
      smtpSecurity: "ssl",
    },
    authMethods: ["password"],
  },
];

/**
 * Extract the domain part from an email address.
 * Returns null if the email is invalid.
 */
export function extractDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex < 1 || atIndex === trimmed.length - 1) return null;
  return trimmed.slice(atIndex + 1);
}

export interface WellKnownProviderResult {
  settings: ServerSettings;
  authMethods: AuthMethod[];
  oauthProviderId?: string;
}

/**
 * Look up a well-known provider by domain.
 * Returns the provider settings and auth info, or null if not found.
 */
export function findWellKnownProvider(
  domain: string,
): WellKnownProviderResult | null {
  const lower = domain.toLowerCase();
  for (const provider of wellKnownProviders) {
    if (provider.domains.includes(lower)) {
      return {
        settings: { ...provider.settings },
        authMethods: provider.authMethods,
        oauthProviderId: provider.oauthProviderId,
      };
    }
  }
  return null;
}

/**
 * Generate default server settings based on the domain using common patterns.
 */
export function guessServerSettings(domain: string): ServerSettings {
  return {
    imapHost: `imap.${domain}`,
    imapPort: 993,
    imapSecurity: "ssl",
    smtpHost: `smtp.${domain}`,
    smtpPort: 587,
    smtpSecurity: "starttls",
  };
}

/**
 * Given an email address, attempt to discover server settings.
 * First checks well-known providers, then falls back to common patterns.
 * Returns null if the email address is invalid.
 */
export function discoverSettings(email: string): WellKnownProviderResult | null {
  const domain = extractDomain(email);
  if (!domain) return null;

  const wellKnown = findWellKnownProvider(domain);
  if (wellKnown) return wellKnown;

  return {
    settings: guessServerSettings(domain),
    authMethods: ["password"],
  };
}

/**
 * Get the default SMTP port for a given security type.
 */
export function getDefaultSmtpPort(security: SecurityType): number {
  switch (security) {
    case "ssl":
      return 465;
    case "starttls":
      return 587;
    case "none":
      return 25;
  }
}

/**
 * Get the default IMAP port for a given security type.
 */
export function getDefaultImapPort(security: SecurityType): number {
  switch (security) {
    case "ssl":
      return 993;
    case "starttls":
      return 143;
    case "none":
      return 143;
  }
}
