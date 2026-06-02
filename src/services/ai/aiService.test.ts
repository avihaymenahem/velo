import { describe, it, expect, beforeEach, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("./providerManager", () => ({
  getActiveProvider: vi.fn(() => ({
    complete: mockComplete,
    testConnection: vi.fn(() => Promise.resolve(true)),
  })),
}));

vi.mock("@/services/db/aiCache", () => ({
  getAiCache: vi.fn(() => Promise.resolve(null)),
  setAiCache: vi.fn(),
}));

import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { classifyThreadsBySmartLabels, generateThreadBriefing } from "./aiService";
import type { DbMessage } from "@/services/db/messages";

describe("classifyThreadsBySmartLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const threads = [
    { id: "t1", subject: "Software Engineer Position", snippet: "We're hiring...", fromAddress: "recruiter@company.com" },
    { id: "t2", subject: "Your order shipped", snippet: "Package tracking...", fromAddress: "orders@shop.com" },
    { id: "t3", subject: "Team standup notes", snippet: "Meeting recap...", fromAddress: "pm@work.com" },
  ];

  const labelRules = [
    { labelId: "label-jobs", description: "Job applications and career opportunities" },
    { labelId: "label-orders", description: "Shopping orders and delivery updates" },
  ];

  it("parses valid AI response into assignments map", async () => {
    mockComplete.mockResolvedValueOnce("t1:label-jobs\nt2:label-orders");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.get("t1")).toEqual(["label-jobs"]);
    expect(result.get("t2")).toEqual(["label-orders"]);
    expect(result.has("t3")).toBe(false);
  });

  it("supports multi-label assignments", async () => {
    mockComplete.mockResolvedValueOnce("t1:label-jobs,label-orders");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.get("t1")).toEqual(["label-jobs", "label-orders"]);
  });

  it("ignores invalid thread IDs", async () => {
    mockComplete.mockResolvedValueOnce("invalid-id:label-jobs\nt1:label-jobs");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.size).toBe(1);
    expect(result.has("invalid-id")).toBe(false);
    expect(result.get("t1")).toEqual(["label-jobs"]);
  });

  it("ignores invalid label IDs", async () => {
    mockComplete.mockResolvedValueOnce("t1:label-jobs,fake-label");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.get("t1")).toEqual(["label-jobs"]);
  });

  it("skips threads where all labels are invalid", async () => {
    mockComplete.mockResolvedValueOnce("t1:fake-label");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.size).toBe(0);
  });

  it("handles empty AI response", async () => {
    mockComplete.mockResolvedValueOnce("");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.size).toBe(0);
  });

  it("handles blank lines and whitespace in response", async () => {
    mockComplete.mockResolvedValueOnce("\n  t1:label-jobs  \n\n  t2:label-orders\n");

    const result = await classifyThreadsBySmartLabels(threads, labelRules);

    expect(result.size).toBe(2);
    expect(result.get("t1")).toEqual(["label-jobs"]);
    expect(result.get("t2")).toEqual(["label-orders"]);
  });

  it("passes label definitions and thread data to AI", async () => {
    mockComplete.mockResolvedValueOnce("");

    await classifyThreadsBySmartLabels(threads, labelRules);

    expect(mockComplete).toHaveBeenCalledTimes(1);
    const callArgs = mockComplete.mock.calls[0]![0] as { userContent: string };
    expect(callArgs.userContent).toContain("label-jobs");
    expect(callArgs.userContent).toContain("Job applications");
    expect(callArgs.userContent).toContain("t1");
    expect(callArgs.userContent).toContain("recruiter@company.com");
  });
});

describe("generateThreadBriefing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAiCache).mockResolvedValue(null);
  });

  const messages: DbMessage[] = [
    {
      id: "m1",
      account_id: "acc1",
      gmail_id: "gmail-1",
      thread_id: "thread-1",
      subject: "Contract review",
      from_address: "client@example.com",
      from_name: "Client",
      to_addresses: "me@example.com",
      cc_addresses: null,
      bcc_addresses: null,
      date: 1_700_000_000,
      snippet: "Please review by Friday",
      body_text: "Please review the contract by Friday.",
      body_html: null,
      is_read: 0,
      is_starred: 0,
      is_important: 0,
      has_attachments: 1,
      labels: null,
      auth_results: null,
      message_id_header: null,
      references_header: null,
      in_reply_to_header: null,
      imap_uid: null,
      imap_folder: null,
      body_cached: 1,
    },
  ];

  it("generates and caches a structured read-only briefing", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      summary: "Client sent a contract for review.",
      latestRequest: "Review the contract by Friday.",
      suggestedAction: "Open the attachment and reply with feedback.",
      riskOrDueSignal: "Friday deadline.",
      source: "Client, latest message",
    }));

    const result = await generateThreadBriefing("thread-1", "acc1", messages);

    expect(result).toEqual({
      summary: "Client sent a contract for review.",
      latestRequest: "Review the contract by Friday.",
      suggestedAction: "Open the attachment and reply with feedback.",
      riskOrDueSignal: "Friday deadline.",
      source: "Client, latest message",
    });
    expect(setAiCache).toHaveBeenCalledWith(
      "acc1",
      "thread-1",
      "briefing",
      JSON.stringify(result),
    );
  });

  it("uses cached briefing JSON before calling AI", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(JSON.stringify({
      summary: "Cached summary",
      latestRequest: null,
      suggestedAction: null,
      riskOrDueSignal: null,
      source: "cache",
    }));

    const result = await generateThreadBriefing("thread-1", "acc1", messages);

    expect(result.summary).toBe("Cached summary");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("falls back to a summary-only briefing when AI returns non-JSON text", async () => {
    mockComplete.mockResolvedValueOnce("The client needs a contract review by Friday.");

    const result = await generateThreadBriefing("thread-1", "acc1", messages);

    expect(result).toEqual({
      summary: "The client needs a contract review by Friday.",
      latestRequest: null,
      suggestedAction: null,
      riskOrDueSignal: null,
      source: null,
    });
  });
});
