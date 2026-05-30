import { discoverCalDavSettings, testCalDavConnection } from "./autoDiscovery";

vi.mock("tsdav", () => ({
  DAVClient: vi.fn(),
}));

// testCalDavConnection now issues a raw PROPFIND via Tauri's plugin-http fetch
// (bypasses WebKit CORS) instead of going through tsdav.
const mockTauriFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockTauriFetch(...args),
}));

describe("discoverCalDavSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Google preset for gmail.com", async () => {
    const result = await discoverCalDavSettings("user@gmail.com");
    expect(result).toEqual({
      providerName: "Google",
      caldavUrl: "https://apidata.googleusercontent.com/caldav/v2/",
      authMethod: "oauth2",
      needsAppPassword: false,
    });
  });

  it("returns iCloud preset for icloud.com with needsAppPassword", async () => {
    const result = await discoverCalDavSettings("user@icloud.com");
    expect(result).toEqual({
      providerName: "iCloud",
      caldavUrl: "https://caldav.icloud.com",
      authMethod: "basic",
      needsAppPassword: true,
    });
  });

  it("returns Fastmail preset for fastmail.com", async () => {
    const result = await discoverCalDavSettings("user@fastmail.com");
    expect(result).toEqual({
      providerName: "Fastmail",
      caldavUrl: "https://caldav.fastmail.com/",
      authMethod: "basic",
      needsAppPassword: false,
    });
  });

  it("returns Google preset with oauth2 authMethod", async () => {
    const result = await discoverCalDavSettings("user@googlemail.com");
    expect(result.authMethod).toBe("oauth2");
  });

  it("returns null caldavUrl for unknown domain with no .well-known", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await discoverCalDavSettings("user@unknown-domain.example");
    expect(result).toEqual({
      providerName: null,
      caldavUrl: null,
      authMethod: "basic",
      needsAppPassword: false,
    });
  });

  it("returns redirect Location for unknown domain with .well-known 301", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 301,
        ok: false,
        headers: new Headers({
          Location: "https://caldav.unknown-domain.example/dav/",
        }),
      }),
    );

    const result = await discoverCalDavSettings("user@unknown-domain.example");
    expect(result).toEqual({
      providerName: null,
      caldavUrl: "https://caldav.unknown-domain.example/dav/",
      authMethod: "basic",
      needsAppPassword: false,
    });
  });
});

describe("testCalDavConnection", () => {
  beforeEach(() => {
    mockTauriFetch.mockReset();
  });

  it("returns success on a 207 Multi-Status PROPFIND response", async () => {
    mockTauriFetch.mockResolvedValue({ status: 207, ok: true });

    const result = await testCalDavConnection(
      "https://caldav.example.com",
      "user",
      "pass",
    );

    expect(mockTauriFetch).toHaveBeenCalledWith(
      "https://caldav.example.com",
      expect.objectContaining({ method: "PROPFIND" }),
    );
    expect(result).toEqual({ success: true, message: "Connected successfully" });
  });

  it("returns an auth failure message on a 401 response", async () => {
    mockTauriFetch.mockResolvedValue({ status: 401, ok: false });

    const result = await testCalDavConnection(
      "https://caldav.example.com",
      "user",
      "wrong-pass",
    );

    expect(result).toEqual({
      success: false,
      message: "Authentication failed — check username and password",
    });
  });

  it("returns the error message when the request throws", async () => {
    mockTauriFetch.mockRejectedValue(new Error("Network down"));

    const result = await testCalDavConnection(
      "https://caldav.example.com",
      "user",
      "pass",
    );

    expect(result).toEqual({ success: false, message: "Network down" });
  });
});
