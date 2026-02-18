import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri plugins
const mockCheck = vi.fn();
const mockRelaunch = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => mockCheck(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => mockRelaunch(...args),
}));

import {
  checkForUpdateNow,
  installUpdate,
  getAvailableUpdate,
  setUpdateCallback,
  _resetForTesting,
} from "./updateManager";

beforeEach(() => {
  _resetForTesting();
  mockCheck.mockReset();
  mockRelaunch.mockReset();
});

describe("updateManager", () => {
  it("returns null when no update is available", async () => {
    mockCheck.mockResolvedValue(null);
    const result = await checkForUpdateNow();
    expect(result).toBeNull();
    expect(getAvailableUpdate()).toBeNull();
  });

  it("returns update info when an update is available", async () => {
    mockCheck.mockResolvedValue({
      version: "1.2.3",
      body: "Bug fixes",
      downloadAndInstall: vi.fn(),
    });

    const result = await checkForUpdateNow();
    expect(result).toEqual({ version: "1.2.3", body: "Bug fixes" });
    expect(getAvailableUpdate()).toEqual({ version: "1.2.3", body: "Bug fixes" });
  });

  it("invokes callback when update is found", async () => {
    const cb = vi.fn();
    setUpdateCallback(cb);

    mockCheck.mockResolvedValue({
      version: "2.0.0",
      body: null,
      downloadAndInstall: vi.fn(),
    });

    await checkForUpdateNow();
    expect(cb).toHaveBeenCalledWith({ version: "2.0.0", body: null });
  });

  it("installUpdate calls downloadAndInstall and relaunch", async () => {
    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
    mockCheck.mockResolvedValue({
      version: "1.0.1",
      body: null,
      downloadAndInstall: mockDownloadAndInstall,
    });
    mockRelaunch.mockResolvedValue(undefined);

    await checkForUpdateNow();
    await installUpdate();

    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(mockRelaunch).toHaveBeenCalled();
  });

  it("installUpdate throws if no update available", async () => {
    await expect(installUpdate()).rejects.toThrow("No update available");
  });

  it("_resetForTesting clears state", async () => {
    mockCheck.mockResolvedValue({
      version: "3.0.0",
      body: "New features",
      downloadAndInstall: vi.fn(),
    });
    await checkForUpdateNow();
    expect(getAvailableUpdate()).not.toBeNull();

    _resetForTesting();
    expect(getAvailableUpdate()).toBeNull();
  });
});
