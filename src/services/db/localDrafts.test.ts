import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import {
  upsertLocalDraft,
  getLocalDraft,
  getUnsyncedDrafts,
  markDraftSynced,
  deleteLocalDraft,
} from "./localDrafts";

const mockDb = {
  select: vi.fn(() => Promise.resolve([])),
  execute: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
};

describe("localDrafts DB service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
  });

  describe("upsertLocalDraft", () => {
    it("inserts or updates a draft", async () => {
      await upsertLocalDraft({
        id: "draft-1",
        account_id: "acct-1",
        to_addresses: "user@example.com",
        subject: "Test",
        body_html: "<p>Hello</p>",
      });
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO local_drafts"),
        expect.arrayContaining(["draft-1", "acct-1", "user@example.com"]),
      );
    });

    it("passes null for undefined optional fields", async () => {
      await upsertLocalDraft({ id: "draft-2", account_id: "acct-1" });
      const args = mockDb.execute.mock.calls[0]![1] as unknown[];
      // cc_addresses (index 3) should be null
      expect(args[3]).toBeNull();
    });
  });

  describe("getLocalDraft", () => {
    it("returns draft by id", async () => {
      const draft = { id: "draft-1", account_id: "acct-1", subject: "Test" };
      mockDb.select.mockResolvedValueOnce([draft]);
      const result = await getLocalDraft("draft-1");
      expect(result).toEqual(draft);
    });

    it("returns null when not found", async () => {
      mockDb.select.mockResolvedValueOnce([]);
      const result = await getLocalDraft("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getUnsyncedDrafts", () => {
    it("queries by account_id and pending status", async () => {
      await getUnsyncedDrafts("acct-1");
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("sync_status = 'pending'"),
        ["acct-1"],
      );
    });
  });

  describe("markDraftSynced", () => {
    it("updates sync status and remote draft id", async () => {
      await markDraftSynced("draft-1", "remote-123");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("sync_status = 'synced'"),
        ["remote-123", "draft-1"],
      );
    });
  });

  describe("deleteLocalDraft", () => {
    it("deletes by id", async () => {
      await deleteLocalDraft("draft-1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM local_drafts WHERE id"),
        ["draft-1"],
      );
    });
  });
});
