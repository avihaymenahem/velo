import { discoverCalDavSettings, testCalDavConnection } from "./autoDiscovery";

vi.mock("tsdav", () => ({
  DAVClient: vi.fn(),
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
  it("returns success with calendar count on successful connection", async () => {
    const { DAVClient } = await import("tsdav");
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    const mockFetchCalendars = vi
      .fn()
      .mockResolvedValue([{ displayName: "Personal" }, { displayName: "Work" }]);

    vi.mocked(DAVClient).mockImplementation(function () {
      return {
        login: mockLogin,
        fetchCalendars: mockFetchCalendars,
      } as unknown as InstanceType<typeof DAVClient>;
    });

    const result = await testCalDavConnection(
      "https://caldav.example.com",
      "user",
      "pass",
    );
    expect(result).toEqual({
      success: true,
      message: "Connected — found 2 calendars",
      calendarCount: 2,
    });
  });

  it("returns failure with error message on failed connection", async () => {
    const { DAVClient } = await import("tsdav");

    vi.mocked(DAVClient).mockImplementation(function () {
      return {
        login: vi.fn().mockRejectedValue(new Error("Invalid credentials")),
      } as unknown as InstanceType<typeof DAVClient>;
    });

    const result = await testCalDavConnection(
      "https://caldav.example.com",
      "user",
      "wrong-pass",
    );
    expect(result).toEqual({
      success: false,
      message: "Invalid credentials",
    });
  });
});
