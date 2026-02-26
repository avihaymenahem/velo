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

vi.mock("@/services/db/settings", () => ({
  getSetting: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/services/db/threads", () => ({
  updateThreadUrgency: vi.fn(() => Promise.resolve()),
}));

import {
  classifyThreadsBySmartLabels,
  proofreadEmail,
  detectMeetingIntent,
  generateInboxDigest,
  scoreThreadUrgency,
  batchScoreUrgency,
  generateContactSummary,
  suggestFilterRules,
} from "./aiService";
import { getAiCache, setAiCache } from "@/services/db/aiCache";
import { getSetting } from "@/services/db/settings";
import { updateThreadUrgency } from "@/services/db/threads";

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

// ---------------------------------------------------------------------------
// proofreadEmail
// ---------------------------------------------------------------------------
describe("proofreadEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cache miss: returns parsed result from AI on valid JSON", async () => {
    const aiResponse = JSON.stringify({ issues: [], overallScore: "good" });
    mockComplete.mockResolvedValueOnce(aiResponse);

    const result = await proofreadEmail("Hello", "<p>Body text</p>", ["alice@example.com"]);

    expect(result).toEqual({ issues: [], overallScore: "good" });
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });

  it("parse failure: returns fallback { issues: [], overallScore: 'good' }", async () => {
    mockComplete.mockResolvedValueOnce("this is not json at all!!!");

    const result = await proofreadEmail("Hello", "<p>Body</p>", ["bob@example.com"]);

    expect(result).toEqual({ issues: [], overallScore: "good" });
  });

  it("HTML stripped: AI call does not contain HTML tags from bodyHtml", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ issues: [], overallScore: "good" }));

    await proofreadEmail("Subject", "<b>bold</b> and <i>italic</i> text", ["c@example.com"]);

    const callArgs = mockComplete.mock.calls[0]![0] as { userContent: string };
    expect(callArgs.userContent).not.toMatch(/<b>/);
    expect(callArgs.userContent).not.toMatch(/<i>/);
    expect(callArgs.userContent).toContain("bold");
    expect(callArgs.userContent).toContain("italic");
  });

  it("attachment detection: body containing 'see attached' sets attachment note", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ issues: [], overallScore: "good" }));

    await proofreadEmail("Report", "<p>Please see attached the report.</p>", ["d@example.com"]);

    const callArgs = mockComplete.mock.calls[0]![0] as { userContent: string };
    expect(callArgs.userContent).toContain("Email mentions attachment");
  });

  it("no attachment keyword: note says 'No attachment mentioned'", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ issues: [], overallScore: "good" }));

    await proofreadEmail("Hi", "<p>Just checking in.</p>", ["e@example.com"]);

    const callArgs = mockComplete.mock.calls[0]![0] as { userContent: string };
    expect(callArgs.userContent).toContain("No attachment mentioned");
  });

  it("NO cache call: getAiCache is never called", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ issues: [], overallScore: "good" }));

    await proofreadEmail("Hello", "<p>Body</p>", ["f@example.com"]);

    expect(getAiCache).not.toHaveBeenCalled();
    expect(setAiCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// detectMeetingIntent
// ---------------------------------------------------------------------------
describe("detectMeetingIntent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMessages = [
    {
      id: "m1",
      from_name: "Alice",
      from_address: "alice@example.com",
      date: Date.now(),
      body_text: "Let's meet tomorrow at 2pm.",
      snippet: "Let's meet",
      subject: "Meeting request",
    },
  ] as Parameters<typeof detectMeetingIntent>[2];

  it("cache hit (meeting): returns parsed result without calling AI", async () => {
    const cachedMeeting = { title: "Sync", attendees: ["alice@example.com"], confidence: "high" };
    vi.mocked(getAiCache).mockResolvedValueOnce(JSON.stringify(cachedMeeting));

    const result = await detectMeetingIntent("thread-1", "acc-1", mockMessages);

    expect(result).toEqual(cachedMeeting);
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("cache hit (null string): returns null without calling AI", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce("null");

    const result = await detectMeetingIntent("thread-2", "acc-1", mockMessages);

    expect(result).toBeNull();
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("cache miss + AI returns valid JSON: parses and caches the result", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    const meetingData = { title: "Coffee chat", attendees: ["bob@example.com"], confidence: "medium" };
    mockComplete.mockResolvedValueOnce(JSON.stringify(meetingData));

    const result = await detectMeetingIntent("thread-3", "acc-1", mockMessages);

    expect(result).toEqual(meetingData);
    expect(setAiCache).toHaveBeenCalledWith("acc-1", "thread-3", "meeting_intent", JSON.stringify(meetingData));
  });

  it("cache miss + AI returns 'null': returns null and caches 'null'", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("null");

    const result = await detectMeetingIntent("thread-4", "acc-1", mockMessages);

    expect(result).toBeNull();
    expect(setAiCache).toHaveBeenCalledWith("acc-1", "thread-4", "meeting_intent", "null");
  });

  it("cache miss + parse error: returns null and caches 'null'", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("not valid json {{ }}");

    const result = await detectMeetingIntent("thread-5", "acc-1", mockMessages);

    expect(result).toBeNull();
    expect(setAiCache).toHaveBeenCalledWith("acc-1", "thread-5", "meeting_intent", "null");
  });
});

// ---------------------------------------------------------------------------
// generateInboxDigest
// ---------------------------------------------------------------------------
describe("generateInboxDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeThread = (i: number) => ({
    id: `t${i}`,
    subject: `Subject ${i}`,
    snippet: `Snippet ${i}`,
    fromAddress: `sender${i}@example.com`,
    fromName: `Sender ${i}`,
    date: Date.now(),
  });

  it("returns the AI result string directly", async () => {
    const digestText = "• 3 newsletters\n• 1 urgent email from boss";
    mockComplete.mockResolvedValueOnce(digestText);

    const result = await generateInboxDigest("acc-1", [makeThread(1)]);

    expect(result).toBe(digestText);
  });

  it("caps at 50 threads: AI input does not reference item 51+", async () => {
    mockComplete.mockResolvedValueOnce("digest");
    const sixtyThreads = Array.from({ length: 60 }, (_, i) => makeThread(i + 1));

    await generateInboxDigest("acc-1", sixtyThreads);

    const callArgs = mockComplete.mock.calls[0]![0] as { userContent: string };
    // Item 51 would be "51." in the formatted string
    expect(callArgs.userContent).not.toContain("51.");
    expect(callArgs.userContent).toContain("50.");
  });

  it("no cache used: getAiCache and setAiCache never called", async () => {
    mockComplete.mockResolvedValueOnce("digest");

    await generateInboxDigest("acc-1", [makeThread(1)]);

    expect(getAiCache).not.toHaveBeenCalled();
    expect(setAiCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// scoreThreadUrgency
// ---------------------------------------------------------------------------
describe("scoreThreadUrgency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cache hit: returns cached urgency level without AI call", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce("high");

    const result = await scoreThreadUrgency("t1", "acc-1", "Critical bug", "prod is down", "cto@company.com");

    expect(result).toBe("high");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("cache miss, AI returns 'high': returns 'high' and caches it", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("high");

    const result = await scoreThreadUrgency("t2", "acc-1", "Urgent", "please respond", "boss@company.com");

    expect(result).toBe("high");
    expect(setAiCache).toHaveBeenCalledWith("acc-1", "t2", "urgency", "high");
  });

  it("cache miss, AI returns 'LOW' (uppercase): returns 'low' (lowercased)", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("LOW");

    const result = await scoreThreadUrgency("t3", "acc-1", "Newsletter", "weekly digest", "news@example.com");

    expect(result).toBe("low");
    expect(setAiCache).toHaveBeenCalledWith("acc-1", "t3", "urgency", "low");
  });

  it("cache miss, AI returns garbage: returns null", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("very important");

    const result = await scoreThreadUrgency("t4", "acc-1", "Subject", "body", "x@x.com");

    expect(result).toBeNull();
    expect(setAiCache).not.toHaveBeenCalled();
  });

  it("AI throws: returns null", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockRejectedValueOnce(new Error("network failure"));

    const result = await scoreThreadUrgency("t5", "acc-1", "Subject", "body", "x@x.com");

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// batchScoreUrgency
// ---------------------------------------------------------------------------
describe("batchScoreUrgency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const threads = [
    { id: "t1", subject: "Urgent", snippet: "please reply", fromAddress: "a@example.com" },
    { id: "t2", subject: "Newsletter", snippet: "weekly news", fromAddress: "news@example.com" },
  ];

  it("setting disabled: no AI calls made when ai_urgency_enabled is not 'true'", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("false");

    await batchScoreUrgency("acc-1", threads);

    expect(mockComplete).not.toHaveBeenCalled();
    expect(updateThreadUrgency).not.toHaveBeenCalled();
  });

  it("setting null: no AI calls made when ai_urgency_enabled is null", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce(null);

    await batchScoreUrgency("acc-1", threads);

    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("setting enabled: scores each thread and calls updateThreadUrgency with score", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("true");
    // Cache misses so AI is called for each thread
    vi.mocked(getAiCache).mockResolvedValue(null);
    mockComplete.mockResolvedValueOnce("high").mockResolvedValueOnce("low");

    await batchScoreUrgency("acc-1", threads);

    expect(updateThreadUrgency).toHaveBeenCalledWith("t1", "high");
    expect(updateThreadUrgency).toHaveBeenCalledWith("t2", "low");
  });

  it("setting enabled: skips updateThreadUrgency when score is null (AI returns garbage)", async () => {
    vi.mocked(getSetting).mockResolvedValueOnce("true");
    vi.mocked(getAiCache).mockResolvedValue(null);
    mockComplete.mockResolvedValueOnce("not-a-valid-score");

    await batchScoreUrgency("acc-1", [threads[0]!]);

    expect(updateThreadUrgency).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateContactSummary
// ---------------------------------------------------------------------------
describe("generateContactSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const recentThreads = [
    { id: "t1", subject: "Project update", snippet: "Here is an update", date: Date.now() - 86400000 },
    { id: "t2", subject: "Follow-up", snippet: "Just following up", date: Date.now() },
  ];

  it("cache hit: returns cached summary without calling AI", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce("Cached contact summary");

    const result = await generateContactSummary("acc-1", "alice@example.com", recentThreads);

    expect(result).toBe("Cached contact summary");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("cache miss: calls AI and caches result using contactEmail as key", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("Alice is a frequent collaborator who sends weekly updates.");

    const result = await generateContactSummary("acc-1", "alice@example.com", recentThreads);

    expect(result).toBe("Alice is a frequent collaborator who sends weekly updates.");
    expect(setAiCache).toHaveBeenCalledWith(
      "acc-1",
      "alice@example.com",
      "contact_summary",
      "Alice is a frequent collaborator who sends weekly updates.",
    );
  });

  it("normal path with single thread: AI is called and result returned", async () => {
    vi.mocked(getAiCache).mockResolvedValueOnce(null);
    mockComplete.mockResolvedValueOnce("Summary for single thread contact.");

    const result = await generateContactSummary("acc-1", "bob@example.com", [recentThreads[0]!]);

    expect(result).toBe("Summary for single thread contact.");
    expect(mockComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// suggestFilterRules
// ---------------------------------------------------------------------------
describe("suggestFilterRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const threads = [
    { fromAddress: "newsletter@news.com", subject: "Weekly digest", snippet: "Top stories this week" },
    { fromAddress: "promo@shop.com", subject: "50% off sale", snippet: "Limited time offer" },
  ];

  it("valid JSON returned: parses and returns filter suggestions", async () => {
    const suggestions = [
      {
        fromPattern: "newsletter@",
        suggestedAction: "archive",
        reason: "many newsletters",
        exampleCount: 5,
      },
    ];
    mockComplete.mockResolvedValueOnce(JSON.stringify(suggestions));

    const result = await suggestFilterRules("acc-1", threads);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ fromPattern: "newsletter@", suggestedAction: "archive" });
  });

  it("invalid suggestedAction filtered out: returns empty array", async () => {
    const badSuggestions = [
      {
        suggestedAction: "invalid_action",
        reason: "test",
        exampleCount: 3,
      },
    ];
    mockComplete.mockResolvedValueOnce(JSON.stringify(badSuggestions));

    const result = await suggestFilterRules("acc-1", threads);

    expect(result).toHaveLength(0);
  });

  it("only valid actions pass through: 'archive', 'label', 'trash' are accepted", async () => {
    const suggestions = [
      { suggestedAction: "archive", reason: "newsletters", exampleCount: 10 },
      { suggestedAction: "label", reason: "work emails", exampleCount: 7 },
      { suggestedAction: "trash", reason: "spam", exampleCount: 4 },
      { suggestedAction: "delete", reason: "bad action", exampleCount: 2 },
    ];
    mockComplete.mockResolvedValueOnce(JSON.stringify(suggestions));

    const result = await suggestFilterRules("acc-1", threads);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.suggestedAction)).toEqual(["archive", "label", "trash"]);
  });

  it("parse failure: returns empty array", async () => {
    mockComplete.mockResolvedValueOnce("not json at all { broken");

    const result = await suggestFilterRules("acc-1", threads);

    expect(result).toEqual([]);
  });

  it("no cache used: getAiCache and setAiCache never called", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify([]));

    await suggestFilterRules("acc-1", threads);

    expect(getAiCache).not.toHaveBeenCalled();
    expect(setAiCache).not.toHaveBeenCalled();
  });
});
