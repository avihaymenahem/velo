import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock emailActions
const mockArchiveThread = vi.fn(() => Promise.resolve({ success: true }));
const mockTrashThread = vi.fn(() => Promise.resolve({ success: true }));
const mockMarkThreadRead = vi.fn(() => Promise.resolve({ success: true }));
const mockStarThread = vi.fn(() => Promise.resolve({ success: true }));
const mockSpamThread = vi.fn(() => Promise.resolve({ success: true }));
const mockAddThreadLabel = vi.fn(() => Promise.resolve({ success: true }));
const mockRemoveThreadLabel = vi.fn(() => Promise.resolve({ success: true }));

vi.mock("../emailActions", () => ({
  archiveThread: (...args: unknown[]) => mockArchiveThread(...args),
  trashThread: (...args: unknown[]) => mockTrashThread(...args),
  markThreadRead: (...args: unknown[]) => mockMarkThreadRead(...args),
  starThread: (...args: unknown[]) => mockStarThread(...args),
  spamThread: (...args: unknown[]) => mockSpamThread(...args),
  addThreadLabel: (...args: unknown[]) => mockAddThreadLabel(...args),
  removeThreadLabel: (...args: unknown[]) => mockRemoveThreadLabel(...args),
}));

vi.mock("@/services/db/threads", () => ({
  pinThread: vi.fn(() => Promise.resolve()),
  unpinThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/db/threadCategories", () => ({
  setThreadCategory: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/snooze/snoozeManager", () => ({
  snoozeThread: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/stores/threadStore", () => {
  const state = {
    threads: [
      { id: "t1", labelIds: ["INBOX", "UNREAD"], isRead: false, isStarred: false, isPinned: false },
      { id: "t2", labelIds: ["INBOX"], isRead: true, isStarred: true, isPinned: false },
    ],
    updateThread: vi.fn(),
    removeThreads: vi.fn(),
  };
  return {
    useThreadStore: {
      getState: () => state,
    },
  };
});

import { pinThread, unpinThread } from "@/services/db/threads";
import { setThreadCategory } from "@/services/db/threadCategories";
import { snoozeThread } from "@/services/snooze/snoozeManager";
import { useThreadStore } from "@/stores/threadStore";
import { executeQuickStep } from "./executor";
import { createMockQuickStep } from "@/test/mocks";

describe("executeQuickStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes a single archive action", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "archive" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(result.completedActions).toBe(1);
    expect(result.totalActions).toBe(1);
    expect(mockArchiveThread).toHaveBeenCalledWith("acct-1", "t1", []);
    // archive removes from view — threads should be batch-removed after chain completes
    expect(useThreadStore.getState().removeThreads).toHaveBeenCalledWith(["t1"]);
  });

  it("executes a multi-action chain (markRead + archive)", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "markRead" }, { type: "archive" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(result.completedActions).toBe(2);
    expect(result.totalActions).toBe(2);

    // markRead via emailActions
    expect(mockMarkThreadRead).toHaveBeenCalledWith("acct-1", "t1", [], true);

    // archive via emailActions
    expect(mockArchiveThread).toHaveBeenCalledWith("acct-1", "t1", []);

    // Deferred removal after chain
    expect(useThreadStore.getState().removeThreads).toHaveBeenCalledWith(["t1"]);
  });

  it("fails fast by default", async () => {
    // Make the archive action fail
    mockArchiveThread.mockRejectedValueOnce(new Error("API Error"));

    const step = createMockQuickStep({
      actions: [{ type: "archive" }, { type: "markRead" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(false);
    expect(result.completedActions).toBe(0);
    expect(result.totalActions).toBe(2);
    expect(result.error).toBe("API Error");
    expect(result.failedActionIndex).toBe(0);

    // markRead should NOT have been called since archive failed
    expect(mockMarkThreadRead).not.toHaveBeenCalled();
  });

  it("continues on error when configured", async () => {
    // Make the archive action fail
    mockArchiveThread.mockRejectedValueOnce(new Error("API Error"));

    const step = createMockQuickStep({
      continueOnError: true,
      actions: [{ type: "archive" }, { type: "markRead" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    // Should still succeed overall since continueOnError is true
    expect(result.success).toBe(true);
    // Only 1 completed (markRead), archive failed
    expect(result.completedActions).toBe(1);
    expect(result.totalActions).toBe(2);

    // Both actions were attempted
    expect(mockArchiveThread).toHaveBeenCalledTimes(1);
    expect(mockMarkThreadRead).toHaveBeenCalledTimes(1);
  });

  it("defers thread removal until chain completes", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "star" }, { type: "archive" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);

    // star via emailActions
    expect(mockStarThread).toHaveBeenCalledWith("acct-1", "t1", [], true);

    // archive via emailActions
    expect(mockArchiveThread).toHaveBeenCalledWith("acct-1", "t1", []);

    // removeThreads should be called once, after all actions complete
    expect(useThreadStore.getState().removeThreads).toHaveBeenCalledTimes(1);
    expect(useThreadStore.getState().removeThreads).toHaveBeenCalledWith(["t1"]);
  });

  it("dispatches event for reply action and does not remove from view", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const step = createMockQuickStep({
      actions: [{ type: "reply" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "velo-inline-reply",
        detail: { threadId: "t1", accountId: "acct-1", mode: "reply" },
      }),
    );
    expect(useThreadStore.getState().removeThreads).not.toHaveBeenCalled();

    dispatchSpy.mockRestore();
  });

  it("executes pin and unpin actions", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "pin" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(pinThread).toHaveBeenCalledWith("acct-1", "t1");
    expect(useThreadStore.getState().updateThread).toHaveBeenCalledWith("t1", { isPinned: true });

    vi.clearAllMocks();

    const step2 = createMockQuickStep({ actions: [{ type: "unpin" }] });
    await executeQuickStep(step2, ["t1"], "acct-1");
    expect(unpinThread).toHaveBeenCalledWith("acct-1", "t1");
    expect(useThreadStore.getState().updateThread).toHaveBeenCalledWith("t1", { isPinned: false });
  });

  it("executes snooze action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    const step = createMockQuickStep({
      actions: [{ type: "snooze", params: { snoozeDuration: 3600000 } }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(snoozeThread).toHaveBeenCalledWith("acct-1", "t1", expect.any(Number));

    vi.useRealTimers();
  });

  it("executes moveToCategory action", async () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    const step = createMockQuickStep({
      actions: [{ type: "moveToCategory", params: { category: "Promotions" } }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(setThreadCategory).toHaveBeenCalledWith("acct-1", "t1", "Promotions", true);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "velo-sync-done" }));

    dispatchSpy.mockRestore();
  });

  it("executes spam action", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "spam" }],
    });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(mockSpamThread).toHaveBeenCalledWith("acct-1", "t1", [], true);
    expect(useThreadStore.getState().removeThreads).toHaveBeenCalledWith(["t1"]);
  });

  it("handles multiple threads", async () => {
    const step = createMockQuickStep({
      actions: [{ type: "markRead" }],
    });

    const result = await executeQuickStep(step, ["t1", "t2"], "acct-1");

    expect(result.success).toBe(true);
    expect(mockMarkThreadRead).toHaveBeenCalledTimes(2);
    expect(mockMarkThreadRead).toHaveBeenCalledWith("acct-1", "t1", [], true);
    expect(mockMarkThreadRead).toHaveBeenCalledWith("acct-1", "t2", [], true);
  });

  it("returns correct result for empty action list", async () => {
    const step = createMockQuickStep({ actions: [] });

    const result = await executeQuickStep(step, ["t1"], "acct-1");

    expect(result.success).toBe(true);
    expect(result.completedActions).toBe(0);
    expect(result.totalActions).toBe(0);
  });
});
