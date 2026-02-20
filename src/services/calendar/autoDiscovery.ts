interface CalDavPreset {
  name: string;
  domains: string[];
  caldavUrl: string;
  authMethod: "basic" | "oauth2";
}

const PRESETS: CalDavPreset[] = [
  {
    name: "Google",
    domains: ["gmail.com", "googlemail.com", "google.com"],
    caldavUrl: "https://apidata.googleusercontent.com/caldav/v2/",
    authMethod: "oauth2",
  },
  {
    name: "iCloud",
    domains: ["icloud.com", "me.com", "mac.com"],
    caldavUrl: "https://caldav.icloud.com",
    authMethod: "basic",
  },
  {
    name: "Fastmail",
    domains: ["fastmail.com", "fastmail.fm", "messagingengine.com"],
    caldavUrl: "https://caldav.fastmail.com/",
    authMethod: "basic",
  },
  {
    name: "Zoho",
    domains: ["zoho.com", "zohomail.com"],
    caldavUrl: "https://calendar.zoho.com/caldav/",
    authMethod: "basic",
  },
  {
    name: "GMX",
    domains: ["gmx.com", "gmx.net", "gmx.de"],
    caldavUrl: "https://caldav.gmx.net/",
    authMethod: "basic",
  },
];

export interface CalDavDiscoveryResult {
  providerName: string | null;
  caldavUrl: string | null;
  authMethod: "basic" | "oauth2";
  needsAppPassword: boolean;
}

/**
 * Discover CalDAV settings from an email address.
 * Matches known providers by domain, or attempts .well-known/caldav discovery.
 */
export async function discoverCalDavSettings(email: string): Promise<CalDavDiscoveryResult> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return { providerName: null, caldavUrl: null, authMethod: "basic", needsAppPassword: false };
  }

  // Check known presets
  for (const preset of PRESETS) {
    if (preset.domains.includes(domain)) {
      return {
        providerName: preset.name,
        caldavUrl: preset.caldavUrl,
        authMethod: preset.authMethod,
        needsAppPassword: preset.name === "iCloud",
      };
    }
  }

  // Attempt .well-known/caldav discovery (RFC 6764)
  const wellKnownUrl = await tryWellKnownDiscovery(domain);
  if (wellKnownUrl) {
    return {
      providerName: null,
      caldavUrl: wellKnownUrl,
      authMethod: "basic",
      needsAppPassword: false,
    };
  }

  // Try common Nextcloud path
  const nextcloudUrl = await tryNextcloudDiscovery(domain);
  if (nextcloudUrl) {
    return {
      providerName: "Nextcloud",
      caldavUrl: nextcloudUrl,
      authMethod: "basic",
      needsAppPassword: false,
    };
  }

  return { providerName: null, caldavUrl: null, authMethod: "basic", needsAppPassword: false };
}

async function tryWellKnownDiscovery(domain: string): Promise<string | null> {
  try {
    const response = await fetch(`https://${domain}/.well-known/caldav`, {
      method: "GET",
      redirect: "manual",
    });

    // RFC 6764: server should respond with 301/302 redirect to the CalDAV endpoint
    if (response.status === 301 || response.status === 302) {
      const location = response.headers.get("Location");
      if (location) {
        // Handle relative URLs
        if (location.startsWith("/")) {
          return `https://${domain}${location}`;
        }
        return location;
      }
    }

    // Some servers respond with 200 directly at the well-known URL
    if (response.ok) {
      return `https://${domain}/.well-known/caldav`;
    }
  } catch {
    // Discovery failed — not all servers support this
  }
  return null;
}

async function tryNextcloudDiscovery(domain: string): Promise<string | null> {
  try {
    const response = await fetch(`https://${domain}/remote.php/dav/`, {
      method: "OPTIONS",
    });
    if (response.ok || response.status === 401) {
      // 401 means the endpoint exists but requires auth
      return `https://${domain}/remote.php/dav/`;
    }
  } catch {
    // Not a Nextcloud instance
  }
  return null;
}

/**
 * Test CalDAV connection with given credentials.
 */
export async function testCalDavConnection(
  url: string,
  username: string,
  password: string,
): Promise<{ success: boolean; message: string; calendarCount?: number }> {
  try {
    const { DAVClient } = await import("tsdav");
    const client = new DAVClient({
      serverUrl: url,
      credentials: { username, password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    await client.login();
    const calendars = await client.fetchCalendars();

    return {
      success: true,
      message: `Connected — found ${calendars.length} calendar${calendars.length !== 1 ? "s" : ""}`,
      calendarCount: calendars.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, message };
  }
}
