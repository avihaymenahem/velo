import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/smartLabelRules", () => ({
  getEnabledSmartLabelRules: vi.fn(),
}));

vi.mock("@/services/filters/filterEngine", () => ({
  messageMatchesFilter: vi.fn(),
}));

vi.mock("@/services/ai/aiService", () => ({
  classifyThreadsBySmartLabels: vi.fn(),
}));

import { getEnabledSmartLabelRules } from "@/services/db/smartLabelRules";
import { messageMatchesFilter } from "@/services/filters/filterEngine";
import { classifyThreadsBySmartLabels } from "@/services/ai/aiService";
import { matchSmartLabels } from "./smartLabelService";
import type { ParsedMessage } from "@/services/gmail/messageParser";

function makeMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id: "msg-1",
    threadId: "t1",
    fromAddress: "sender@example.com",
    fromName: "Sender",
    toAddresses: "me@example.com",
    ccAddresses: null,
    bccAddresses: null,
    replyTo: null,
    subject: "Test Subject",
    snippet: "Test snippet",
    date: Date.now(),
    isRead: false,
    isStarred: false,
    bodyHtml: null,
    bodyText: "Test body",
    rawSize: 100,
    internalDate: Date.now(),
    labelIds: ["INBOX"],
    hasAttachments: false,
    attachments: [],
    listUnsubscribe: null,
    listUnsubscribePost: null,
    authResults: null,
    ...overrides,
  };
}

describe("matchSmartLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when no rules exist", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([]);

    const result = await matchSmartLabels("acc-1", [makeMessage()]);

    expect(result).toEqual([]);
    expect(classifyThreadsBySmartLabels).not.toHaveBeenCalled();
  });

  it("matches via criteria fast path", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([
      {
        id: "r1",
        account_id: "acc-1",
        label_id: "label-jobs",
        ai_description: "Job applications",
        criteria_json: JSON.stringify({ from: "recruiter" }),
        is_enabled: 1,
        sort_order: 0,
        created_at: 100,
      },
    ]);
    vi.mocked(messageMatchesFilter).mockReturnValue(true);
    vi.mocked(classifyThreadsBySmartLabels).mockResolvedValue(new Map());

    const result = await matchSmartLabels("acc-1", [makeMessage()]);

    expect(result).toEqual([{ threadId: "t1", labelIds: ["label-jobs"] }]);
    expect(messageMatchesFilter).toHaveBeenCalled();
  });

  it("falls back to AI when no criteria match", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([
      {
        id: "r1",
        account_id: "acc-1",
        label_id: "label-jobs",
        ai_description: "Job applications",
        criteria_json: null,
        is_enabled: 1,
        sort_order: 0,
        created_at: 100,
      },
    ]);
    vi.mocked(classifyThreadsBySmartLabels).mockResolvedValue(
      new Map([["t1", ["label-jobs"]]]),
    );

    const result = await matchSmartLabels("acc-1", [makeMessage()]);

    expect(result).toEqual([{ threadId: "t1", labelIds: ["label-jobs"] }]);
    expect(classifyThreadsBySmartLabels).toHaveBeenCalled();
  });

  it("merges criteria and AI matches without duplicates", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([
      {
        id: "r1",
        account_id: "acc-1",
        label_id: "label-jobs",
        ai_description: "Job applications",
        criteria_json: JSON.stringify({ from: "recruiter" }),
        is_enabled: 1,
        sort_order: 0,
        created_at: 100,
      },
      {
        id: "r2",
        account_id: "acc-1",
        label_id: "label-orders",
        ai_description: "Orders",
        criteria_json: null,
        is_enabled: 1,
        sort_order: 1,
        created_at: 200,
      },
    ]);
    vi.mocked(messageMatchesFilter).mockReturnValue(true);
    vi.mocked(classifyThreadsBySmartLabels).mockResolvedValue(
      new Map([["t1", ["label-jobs", "label-orders"]]]),
    );

    const result = await matchSmartLabels("acc-1", [makeMessage()]);

    // Should have both labels but no duplicate label-jobs
    expect(result).toHaveLength(1);
    expect(result[0]!.labelIds).toContain("label-jobs");
    expect(result[0]!.labelIds).toContain("label-orders");
    expect(result[0]!.labelIds.filter((l) => l === "label-jobs")).toHaveLength(1);
  });

  it("deduplicates threads (uses first message per thread)", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([
      {
        id: "r1",
        account_id: "acc-1",
        label_id: "label-1",
        ai_description: "Test",
        criteria_json: null,
        is_enabled: 1,
        sort_order: 0,
        created_at: 100,
      },
    ]);
    vi.mocked(classifyThreadsBySmartLabels).mockResolvedValue(
      new Map([["t1", ["label-1"]]]),
    );

    const msg1 = makeMessage({ id: "msg-1", threadId: "t1" });
    const msg2 = makeMessage({ id: "msg-2", threadId: "t1" });

    await matchSmartLabels("acc-1", [msg1, msg2]);

    // AI should only receive one thread
    expect(classifyThreadsBySmartLabels).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "t1" })]),
      expect.anything(),
    );
    const threads = vi.mocked(classifyThreadsBySmartLabels).mock.calls[0]![0];
    expect(threads).toHaveLength(1);
  });

  it("continues with criteria matches when AI fails", async () => {
    vi.mocked(getEnabledSmartLabelRules).mockResolvedValue([
      {
        id: "r1",
        account_id: "acc-1",
        label_id: "label-jobs",
        ai_description: "Job applications",
        criteria_json: JSON.stringify({ from: "recruiter" }),
        is_enabled: 1,
        sort_order: 0,
        created_at: 100,
      },
      {
        id: "r2",
        account_id: "acc-1",
        label_id: "label-ai",
        ai_description: "AI only rule",
        criteria_json: null,
        is_enabled: 1,
        sort_order: 1,
        created_at: 200,
      },
    ]);
    vi.mocked(messageMatchesFilter).mockReturnValue(true);
    vi.mocked(classifyThreadsBySmartLabels).mockRejectedValue(new Error("AI error"));

    const result = await matchSmartLabels("acc-1", [makeMessage()]);

    // Criteria match should still work
    expect(result).toEqual([{ threadId: "t1", labelIds: ["label-jobs"] }]);
  });
});
