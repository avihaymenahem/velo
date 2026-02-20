import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { getAttachmentsForAccount, getAttachmentSenders, upsertAttachment, getAttachmentsForMessage } from "./attachments";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("attachments DB service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getAttachmentsForAccount", () => {
    it("queries with correct SQL joining messages", async () => {
      const mockData = [
        { id: "att-1", filename: "test.pdf", from_address: "alice@example.com", date: 1000 },
      ];
      mockDb.select.mockResolvedValueOnce(mockData);

      const result = await getAttachmentsForAccount("acc-1");

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0]!;
      expect(sql).toContain("JOIN messages m");
      expect(sql).toContain("a.account_id = $1");
      expect(sql).toContain("filename IS NOT NULL");
      expect(sql).toContain("ORDER BY m.date DESC");
      expect(params).toEqual(["acc-1", 200, 0]);
      expect(result).toEqual(mockData);
    });

    it("supports custom limit and offset", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await getAttachmentsForAccount("acc-1", 50, 100);

      const [, params] = mockDb.select.mock.calls[0]!;
      expect(params).toEqual(["acc-1", 50, 100]);
    });
  });

  describe("getAttachmentSenders", () => {
    it("queries distinct senders with counts", async () => {
      const mockSenders = [
        { from_address: "alice@example.com", from_name: "Alice", count: 5 },
      ];
      mockDb.select.mockResolvedValueOnce(mockSenders);

      const result = await getAttachmentSenders("acc-1");

      expect(mockDb.select).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.select.mock.calls[0]!;
      expect(sql).toContain("GROUP BY m.from_address");
      expect(sql).toContain("ORDER BY count DESC");
      expect(params).toEqual(["acc-1"]);
      expect(result).toEqual(mockSenders);
    });
  });

  describe("upsertAttachment", () => {
    it("executes upsert with correct params", async () => {
      await upsertAttachment({
        id: "att-1",
        messageId: "msg-1",
        accountId: "acc-1",
        filename: "test.pdf",
        mimeType: "application/pdf",
        size: 1024,
        gmailAttachmentId: "gid-1",
        contentId: null,
        isInline: false,
      });

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      const [sql, params] = mockDb.execute.mock.calls[0]!;
      expect(sql).toContain("INSERT INTO attachments");
      expect(sql).toContain("ON CONFLICT");
      expect(params).toEqual(["att-1", "msg-1", "acc-1", "test.pdf", "application/pdf", 1024, "gid-1", null, 0]);
    });
  });

  describe("getAttachmentsForMessage", () => {
    it("queries attachments for a specific message", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      await getAttachmentsForMessage("acc-1", "msg-1");

      expect(mockDb.select).toHaveBeenCalledWith(
        "SELECT * FROM attachments WHERE account_id = $1 AND message_id = $2 ORDER BY filename ASC",
        ["acc-1", "msg-1"],
      );
    });
  });
});
