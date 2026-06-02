import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import i18n from "@/i18n";

const mockGetAvailableUpdate = vi.fn();
const mockSetUpdateCallback = vi.fn();
const mockInstallUpdate = vi.fn();

vi.mock("@/services/updateManager", () => ({
  getAvailableUpdate: () => mockGetAvailableUpdate(),
  setUpdateCallback: (cb: unknown) => mockSetUpdateCallback(cb),
  installUpdate: () => mockInstallUpdate(),
}));

import { UpdateToast } from "./UpdateToast";

beforeEach(async () => {
  await i18n.changeLanguage("en");
  mockGetAvailableUpdate.mockReset();
  mockSetUpdateCallback.mockReset();
  mockInstallUpdate.mockReset();
});

describe("UpdateToast", () => {
  it("does not render when no update is available", () => {
    mockGetAvailableUpdate.mockReturnValue(null);
    const { container } = render(<UpdateToast />);
    expect(container.querySelector(".glass-panel")).toBeNull();
  });

  it("renders when an update is available on mount", () => {
    mockGetAvailableUpdate.mockReturnValue({ version: "2.0.0", body: null });
    render(<UpdateToast />);
    expect(screen.getByText("Kirje v2.0.0 is available")).toBeTruthy();
    expect(screen.getByText("Later")).toBeTruthy();
    expect(screen.getByText("Update Now")).toBeTruthy();
  });

  it("renders when callback fires with an update", async () => {
    mockGetAvailableUpdate.mockReturnValue(null);
    render(<UpdateToast />);

    // Get the callback that was passed to setUpdateCallback
    const registeredCallback = mockSetUpdateCallback.mock.calls[0]?.[0] as
      | ((update: { version: string }) => void)
      | undefined;
    expect(registeredCallback).toBeDefined();

    // Simulate an update being found
    act(() => {
      registeredCallback!({ version: "3.0.0" });
    });

    await waitFor(() => {
      expect(screen.getByText("Kirje v3.0.0 is available")).toBeTruthy();
    });
  });

  it("dismisses on Later click", async () => {
    mockGetAvailableUpdate.mockReturnValue({ version: "2.0.0", body: null });
    render(<UpdateToast />);
    fireEvent.click(screen.getByText("Later"));

    await waitFor(() => {
      expect(screen.queryByText("Kirje v2.0.0 is available")).toBeNull();
    });
  });

  it("shows Updating... on Update Now click", async () => {
    mockGetAvailableUpdate.mockReturnValue({ version: "2.0.0", body: null });
    mockInstallUpdate.mockReturnValue(new Promise(() => {})); // never resolves
    render(<UpdateToast />);
    fireEvent.click(screen.getByText("Update Now"));

    await waitFor(() => {
      expect(screen.getByText("Updating...")).toBeTruthy();
    });
  });

  it("renders update chrome in Simplified Chinese", async () => {
    await i18n.changeLanguage("zh-CN");
    mockGetAvailableUpdate.mockReturnValue({ version: "2.0.0", body: null });
    mockInstallUpdate.mockReturnValue(new Promise(() => {})); // never resolves

    render(<UpdateToast />);

    expect(screen.getByText("Kirje v2.0.0 有可用更新")).toBeTruthy();
    expect(screen.getByText("稍后")).toBeTruthy();
    fireEvent.click(screen.getByText("立即更新"));

    await waitFor(() => {
      expect(screen.getByText("正在更新...")).toBeTruthy();
    });
    expect(screen.queryByText("Kirje v2.0.0 is available")).toBeNull();
    expect(screen.queryByText("Update Now")).toBeNull();
    expect(screen.queryByText("Updating...")).toBeNull();
  });

  it("cleans up callback on unmount", () => {
    mockGetAvailableUpdate.mockReturnValue(null);
    const { unmount } = render(<UpdateToast />);
    unmount();

    // Last call should be setUpdateCallback(null)
    const lastCall = mockSetUpdateCallback.mock.calls[mockSetUpdateCallback.mock.calls.length - 1];
    expect(lastCall?.[0]).toBeNull();
  });
});
