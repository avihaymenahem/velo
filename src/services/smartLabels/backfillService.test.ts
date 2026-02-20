import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSelect = vi.fn();
const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
}));

vi.mock("@/services/db/connection", () => ({
  getDb: mockGetDb,
}));

vi.mock("./smartLabelService", () => ({
  matchSmartLabels: vi.fn(),
}));

vi.mock("@/services/emailActions", () => ({
  addThreadLabel: vi.fn(() => Promise.resolve({ success: true })),
}));

import { matchSmartLabels } from "./smartLabelService";
import { addThreadLabel } from "@/services/emailActions";
import { backfillSmartLabels } from "./backfillService";

describe("backfillSmartLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({ select: mockSelect, execute: vi.fn() });
  });

  it("processes inbox threads in batches", async () => {
    const batch1 = Array.from({ length: 50 }, (_, i) => ({
      thread_id: `t${i}`,
      subject: `Subject ${i}`,
      snippet: `Snippet ${i}`,
      from_address: `sender${i}@example.com`,
      from_name: `Sender ${i}`,
      body_text: null,
      body_html: null,
      to_addresses: null,
      has_attachments: 0,
      id: `msg-${i}`,
    }));

    mockSelect
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce([]); // second batch empty

    vi.mocked(matchSmartLabels).mockResolvedValue([
      { threadId: "t0", labelIds: ["label-1"] },
    ]);

    const count = await backfillSmartLabels("acc-1", 50);

    expect(count).toBe(1);
    expect(matchSmartLabels).toHaveBeenCalledTimes(1);
    expect(addThreadLabel).toHaveBeenCalledWith("acc-1", "t0", "label-1");
  });

  it("returns 0 when no threads in inbox", async () => {
    mockSelect.mockResolvedValueOnce([]);

    const count = await backfillSmartLabels("acc-1");

    expect(count).toBe(0);
    expect(matchSmartLabels).not.toHaveBeenCalled();
  });

  it("counts total labels applied across batches", async () => {
    const batch1 = [
      { thread_id: "t1", subject: "A", snippet: "a", from_address: "a@b.com", from_name: null, body_text: null, body_html: null, to_addresses: null, has_attachments: 0, id: "m1" },
      { thread_id: "t2", subject: "B", snippet: "b", from_address: "b@b.com", from_name: null, body_text: null, body_html: null, to_addresses: null, has_attachments: 0, id: "m2" },
    ];

    mockSelect
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce([]); // terminates because batch1.length < batchSize

    vi.mocked(matchSmartLabels).mockResolvedValue([
      { threadId: "t1", labelIds: ["label-a", "label-b"] },
      { threadId: "t2", labelIds: ["label-c"] },
    ]);

    const count = await backfillSmartLabels("acc-1", 50);

    expect(count).toBe(3);
  });

  it("stops when batch returns fewer than batchSize rows", async () => {
    const smallBatch = [
      { thread_id: "t1", subject: "A", snippet: "a", from_address: "a@b.com", from_name: null, body_text: null, body_html: null, to_addresses: null, has_attachments: 0, id: "m1" },
    ];

    mockSelect.mockResolvedValueOnce(smallBatch);
    vi.mocked(matchSmartLabels).mockResolvedValue([]);

    await backfillSmartLabels("acc-1", 50);

    // Should only call select once (batch was < 50)
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
