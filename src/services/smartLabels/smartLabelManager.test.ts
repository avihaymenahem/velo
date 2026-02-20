import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./smartLabelService", () => ({
  matchSmartLabels: vi.fn(),
}));

vi.mock("@/services/emailActions", () => ({
  addThreadLabel: vi.fn(() => Promise.resolve({ success: true })),
}));

import { matchSmartLabels } from "./smartLabelService";
import { addThreadLabel } from "@/services/emailActions";
import { applySmartLabelsToMessages } from "./smartLabelManager";
import type { ParsedMessage } from "@/services/gmail/messageParser";

function makeMessage(threadId = "t1"): ParsedMessage {
  return {
    id: `msg-${threadId}`,
    threadId,
    fromAddress: "sender@example.com",
    fromName: "Sender",
    toAddresses: "me@example.com",
    ccAddresses: null,
    bccAddresses: null,
    replyTo: null,
    subject: "Test",
    snippet: "Test",
    date: Date.now(),
    isRead: false,
    isStarred: false,
    bodyHtml: null,
    bodyText: null,
    rawSize: 0,
    internalDate: Date.now(),
    labelIds: [],
    hasAttachments: false,
    attachments: [],
    listUnsubscribe: null,
    listUnsubscribePost: null,
    authResults: null,
  };
}

describe("applySmartLabelsToMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies matched labels via addThreadLabel", async () => {
    vi.mocked(matchSmartLabels).mockResolvedValue([
      { threadId: "t1", labelIds: ["label-a", "label-b"] },
      { threadId: "t2", labelIds: ["label-c"] },
    ]);

    await applySmartLabelsToMessages("acc-1", [makeMessage("t1"), makeMessage("t2")]);

    expect(addThreadLabel).toHaveBeenCalledTimes(3);
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "t1", "label-a");
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "t1", "label-b");
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "t2", "label-c");
  });

  it("does not throw when matchSmartLabels returns empty", async () => {
    vi.mocked(matchSmartLabels).mockResolvedValue([]);

    await expect(
      applySmartLabelsToMessages("acc-1", [makeMessage()]),
    ).resolves.toBeUndefined();

    expect(addThreadLabel).not.toHaveBeenCalled();
  });

  it("does not throw when matchSmartLabels fails", async () => {
    vi.mocked(matchSmartLabels).mockRejectedValue(new Error("DB error"));

    await expect(
      applySmartLabelsToMessages("acc-1", [makeMessage()]),
    ).resolves.toBeUndefined();
  });

  it("continues applying other labels when one fails", async () => {
    vi.mocked(matchSmartLabels).mockResolvedValue([
      { threadId: "t1", labelIds: ["label-a", "label-b"] },
    ]);
    vi.mocked(addThreadLabel)
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce({ success: true } as never);

    await expect(
      applySmartLabelsToMessages("acc-1", [makeMessage()]),
    ).resolves.toBeUndefined();

    expect(addThreadLabel).toHaveBeenCalledTimes(2);
  });
});
