import { extractTask } from "./taskExtraction";
import type { DbMessage } from "@/services/db/messages";

vi.mock("./aiService", () => ({
  extractTaskFromThread: vi.fn(),
}));

const { extractTaskFromThread } = await import("./aiService");

function makeMessage(overrides: Partial<DbMessage> = {}): DbMessage {
  return {
    id: "msg1",
    account_id: "acc1",
    thread_id: "t1",
    from_address: "sender@example.com",
    from_name: "Sender",
    to_addresses: "user@example.com",
    cc_addresses: null,
    bcc_addresses: null,
    reply_to: null,
    subject: "Meeting follow-up",
    snippet: "Please review the attached",
    date: Date.now(),
    is_read: 1,
    is_starred: 0,
    body_html: null,
    body_text: "Please review the attached document by Friday.",
    body_cached: 1,
    raw_size: null,
    internal_date: null,
    list_unsubscribe: null,
    list_unsubscribe_post: null,
    auth_results: null,
    message_id_header: null,
    references_header: null,
    in_reply_to_header: null,
    imap_uid: null,
    imap_folder: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("taskExtraction", () => {
  it("parses valid JSON response", async () => {
    vi.mocked(extractTaskFromThread).mockResolvedValue(
      '{"title": "Review document", "description": "Review the attached doc", "dueDate": 1735689600, "priority": "high"}',
    );
    const result = await extractTask("t1", "acc1", [makeMessage()]);
    expect(result.title).toBe("Review document");
    expect(result.description).toBe("Review the attached doc");
    expect(result.dueDate).toBe(1735689600);
    expect(result.priority).toBe("high");
  });

  it("handles JSON wrapped in markdown code fences", async () => {
    vi.mocked(extractTaskFromThread).mockResolvedValue(
      '```json\n{"title": "Review document", "description": null, "dueDate": null, "priority": "medium"}\n```',
    );
    const result = await extractTask("t1", "acc1", [makeMessage()]);
    expect(result.title).toBe("Review document");
    expect(result.priority).toBe("medium");
  });

  it("falls back on invalid JSON", async () => {
    vi.mocked(extractTaskFromThread).mockResolvedValue("not valid json");
    const result = await extractTask("t1", "acc1", [makeMessage()]);
    expect(result.title).toBe("Follow up on: Meeting follow-up");
    expect(result.priority).toBe("medium");
  });

  it("falls back on invalid priority", async () => {
    vi.mocked(extractTaskFromThread).mockResolvedValue(
      '{"title": "Test", "priority": "super-urgent"}',
    );
    const result = await extractTask("t1", "acc1", [makeMessage()]);
    expect(result.priority).toBe("medium");
  });

  it("falls back on empty title", async () => {
    vi.mocked(extractTaskFromThread).mockResolvedValue(
      '{"title": "", "priority": "low"}',
    );
    const result = await extractTask("t1", "acc1", [makeMessage()]);
    expect(result.title).toBe("Follow up on: Meeting follow-up");
  });
});
