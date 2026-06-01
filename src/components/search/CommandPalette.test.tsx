import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { setThreadPrimaryState } from "@/services/db/threadWorkStates";
import { useThreadStore } from "@/stores/threadStore";

vi.mock("@/services/db/templates", () => ({
  getTemplatesForAccount: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/db/threadWorkStates", () => ({
  setThreadPrimaryState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/stores/uiStore", () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      toggleSidebar: vi.fn(),
      setTheme: vi.fn(),
    }),
}));

vi.mock("@/stores/composerStore", () => ({
  useComposerStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ openComposer: vi.fn() }),
}));

const updateThread = vi.fn();

vi.mock("@/stores/threadStore", () => ({
  useThreadStore: {
    getState: () => ({ updateThread }),
  },
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ activeAccountId: "acc1" }),
    { getState: () => ({ activeAccountId: "acc1" }) },
  ),
}));

vi.mock("@/hooks/useRouteNavigation", () => ({
  useActiveLabel: () => "inbox",
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(),
}));

vi.mock("@/router/navigate", () => ({
  navigateToLabel: vi.fn(),
  navigateBack: vi.fn(),
  getSelectedThreadId: () => "thread1",
}));

describe("CommandPalette agentic commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("can manually set the selected thread work state", async () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("Mark as Waiting"));

    await waitFor(() => {
      expect(setThreadPrimaryState).toHaveBeenCalledWith("acc1", "thread1", "waiting");
    });
    expect(useThreadStore.getState().updateThread).toHaveBeenCalledWith(
      "thread1",
      { workState: "waiting" },
    );
  });
});
