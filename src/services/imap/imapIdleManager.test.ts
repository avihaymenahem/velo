import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("../db/settings", () => {
  const store = new Map<string, string>();
  return {
    getSetting: vi.fn(async (k: string) => store.get(k) ?? null),
    setSetting: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    __store: store,
  };
});

vi.mock("../db/accounts", () => ({
  getAccount: vi.fn(),
}));

vi.mock("../oauth/oauthTokenManager", () => ({
  ensureFreshToken: vi.fn(async () => "fresh-token"),
}));

vi.mock("../gmail/syncManager", () => ({
  syncAccount: vi.fn(async () => undefined),
}));

vi.mock("./imapConfigBuilder", () => ({
  buildImapConfig: vi.fn((account, token?: string) => ({
    host: account.imap_host,
    port: 993,
    security: "tls",
    username: account.email,
    password: token ?? account.imap_password,
    auth_method: account.auth_method ?? "password",
    accept_invalid_certs: false,
  })),
}));

import { invoke } from "@tauri-apps/api/core";
import { getAccount } from "../db/accounts";
import { syncAccount } from "../gmail/syncManager";
import * as settingsModule from "../db/settings";
import {
  isIdleEnabled,
  setIdleEnabled,
  getIdleFoldersForAccount,
  setIdleFoldersForAccount,
  startIdleForAccount,
  stopIdleForAccount,
  stopAllIdle,
  _resetForTests,
} from "./imapIdleManager";

const invokeMock = vi.mocked(invoke);
const getAccountMock = vi.mocked(getAccount);
const syncAccountMock = vi.mocked(syncAccount);

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTests();
  // Reset the in-memory settings store (mock module exposes `__store`)
  const store = (settingsModule as unknown as { __store: Map<string, string> }).__store;
  store.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("imapIdleManager — settings", () => {
  it("defaults IDLE enabled to true when no setting is stored", async () => {
    expect(await isIdleEnabled()).toBe(true);
  });

  it("persists the enabled flag", async () => {
    await setIdleEnabled(false);
    expect(await isIdleEnabled()).toBe(false);
    await setIdleEnabled(true);
    expect(await isIdleEnabled()).toBe(true);
  });

  it("defaults the folder list to INBOX", async () => {
    expect(await getIdleFoldersForAccount("acc-1")).toEqual(["INBOX"]);
  });

  it("persists a per-account folder list", async () => {
    await setIdleFoldersForAccount("acc-1", ["INBOX", "Sent"]);
    expect(await getIdleFoldersForAccount("acc-1")).toEqual(["INBOX", "Sent"]);
  });

  it("falls back to INBOX when the stored folder list is empty or invalid", async () => {
    await setIdleFoldersForAccount("acc-1", []);
    expect(await getIdleFoldersForAccount("acc-1")).toEqual(["INBOX"]);
  });
});

describe("imapIdleManager — start/stop lifecycle", () => {
  it("no-ops when global IDLE toggle is off", async () => {
    await setIdleEnabled(false);
    await startIdleForAccount("acc-1");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "imap_idle_start",
      expect.anything(),
    );
  });

  it("no-ops for non-IMAP accounts", async () => {
    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "gmail_api",
      email: "x@y.z",
    } as never);
    await startIdleForAccount("acc-1");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "imap_idle_start",
      expect.anything(),
    );
  });

  it("invokes imap_idle_start for each configured folder", async () => {
    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "imap",
      email: "x@y.z",
      imap_host: "imap.example.com",
      imap_password: "secret",
      auth_method: "password",
    } as never);
    await setIdleFoldersForAccount("acc-1", ["INBOX", "Sent"]);

    await startIdleForAccount("acc-1");

    const idleStartCalls = invokeMock.mock.calls.filter(
      (c) => c[0] === "imap_idle_start",
    );
    expect(idleStartCalls).toHaveLength(2);
    expect(idleStartCalls[0]?.[1]).toMatchObject({
      accountId: "acc-1",
      folder: "INBOX",
    });
    expect(idleStartCalls[1]?.[1]).toMatchObject({
      accountId: "acc-1",
      folder: "Sent",
    });
  });

  it("does not double-start the same (account, folder) pair", async () => {
    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "imap",
      email: "x@y.z",
      imap_host: "imap.example.com",
      imap_password: "secret",
      auth_method: "password",
    } as never);

    await startIdleForAccount("acc-1");
    invokeMock.mockClear();
    await startIdleForAccount("acc-1");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "imap_idle_start",
      expect.anything(),
    );
  });

  it("stopIdleForAccount calls the stop_account Rust command", async () => {
    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "imap",
      email: "x@y.z",
      imap_host: "imap.example.com",
      imap_password: "secret",
      auth_method: "password",
    } as never);
    await startIdleForAccount("acc-1");

    await stopIdleForAccount("acc-1");
    expect(invokeMock).toHaveBeenCalledWith("imap_idle_stop_account", {
      accountId: "acc-1",
    });
  });

  it("stopAllIdle clears every watcher", async () => {
    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "imap",
      email: "x@y.z",
      imap_host: "imap.example.com",
      imap_password: "secret",
      auth_method: "password",
    } as never);
    await startIdleForAccount("acc-1");

    await stopAllIdle();
    expect(invokeMock.mock.calls.some((c) => c[0] === "imap_idle_stop_all")).toBe(
      true,
    );
  });
});

describe("imapIdleManager — OAuth2 accounts use a fresh access token", () => {
  it("calls ensureFreshToken and forwards it as the password", async () => {
    getAccountMock.mockResolvedValue({
      id: "oauth-acc",
      provider: "imap",
      email: "oauth@y.z",
      imap_host: "imap.example.com",
      imap_password: null,
      auth_method: "oauth2",
    } as never);

    await startIdleForAccount("oauth-acc");

    const call = invokeMock.mock.calls.find(
      (c) => c[0] === "imap_idle_start",
    );
    expect(call?.[1]).toMatchObject({
      accountId: "oauth-acc",
      folder: "INBOX",
      config: expect.objectContaining({ password: "fresh-token" }),
    });
  });
});

describe("imapIdleManager — debounced sync trigger", () => {
  it("schedules at most one sync per account for a burst of events", async () => {
    // Capture the listener handler registered via `listen()`
    const { listen } = await import("@tauri-apps/api/event");
    const listenMock = vi.mocked(listen);
    let handler: ((e: { payload: unknown }) => void) | null = null;
    listenMock.mockImplementation(async (_event, cb) => {
      handler = cb as never;
      return () => {};
    });

    getAccountMock.mockResolvedValue({
      id: "acc-1",
      provider: "imap",
      email: "x@y.z",
      imap_host: "imap.example.com",
      imap_password: "secret",
      auth_method: "password",
    } as never);
    await startIdleForAccount("acc-1");

    expect(handler).not.toBeNull();
    // Fire three "new" events in quick succession
    handler!({ payload: { account_id: "acc-1", folder: "INBOX", kind: "new" } });
    handler!({ payload: { account_id: "acc-1", folder: "INBOX", kind: "new" } });
    handler!({ payload: { account_id: "acc-1", folder: "INBOX", kind: "new" } });

    expect(syncAccountMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    expect(syncAccountMock).toHaveBeenCalledTimes(1);
    expect(syncAccountMock).toHaveBeenCalledWith("acc-1");
  });
});
