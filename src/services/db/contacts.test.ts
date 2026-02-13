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
  getAllContacts, updateContact, deleteContact,
  updateContactNotes, getAttachmentsFromContact,
  getContactsFromSameDomain, getLatestAuthResult,
} from "./contacts";

const mockDb = {
  select: vi.fn(() => Promise.resolve([])),
  execute: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
};

describe("contacts service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("getAllContacts", () => {
    it("calls db.select with correct SQL and default params", async () => {
      await getAllContacts();

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM contacts"),
        [500, 0],
      );
    });

    it("passes limit and offset params", async () => {
      await getAllContacts(100, 50);

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $1 OFFSET $2"),
        [100, 50],
      );
    });
  });

  describe("updateContact", () => {
    it("calls db.execute with correct SQL params", async () => {
      await updateContact("contact-123", "John Doe");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE contacts SET display_name = $1"),
        ["John Doe", "contact-123"],
      );
    });
  });

  describe("deleteContact", () => {
    it("calls db.execute with correct SQL and id", async () => {
      await deleteContact("contact-456");

      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM contacts WHERE id = $1",
        ["contact-456"],
      );
    });
  });

  describe("updateContactNotes", () => {
    it("calls db.execute with correct SQL and normalized email", async () => {
      await updateContactNotes("John@Example.COM", "Great client");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE contacts SET notes = $1"),
        ["Great client", "john@example.com"],
      );
    });

    it("stores null for empty notes", async () => {
      await updateContactNotes("user@test.com", "");

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE contacts SET notes = $1"),
        [null, "user@test.com"],
      );
    });
  });

  describe("getAttachmentsFromContact", () => {
    it("queries with correct JOIN and default limit", async () => {
      await getAttachmentsFromContact("sender@test.com");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("FROM attachments a"),
        ["sender@test.com", 5],
      );
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("a.is_inline = 0"),
        expect.any(Array),
      );
    });

    it("passes custom limit", async () => {
      await getAttachmentsFromContact("sender@test.com", 10);

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.any(String),
        ["sender@test.com", 10],
      );
    });
  });

  describe("getContactsFromSameDomain", () => {
    it("queries contacts with same domain", async () => {
      await getContactsFromSameDomain("alice@company.com");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("LIKE $1"),
        ["%@company.com", "alice@company.com", 5],
      );
    });

    it("returns empty array for public domains", async () => {
      const result = await getContactsFromSameDomain("user@gmail.com");

      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("returns empty array for email without @", async () => {
      const result = await getContactsFromSameDomain("invalid-email");

      expect(result).toEqual([]);
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe("getLatestAuthResult", () => {
    it("queries most recent auth_results", async () => {
      mockDb.select.mockResolvedValueOnce([{ auth_results: '{"aggregate":"pass"}' }]);

      const result = await getLatestAuthResult("sender@test.com");

      expect(result).toBe('{"aggregate":"pass"}');
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("auth_results FROM messages"),
        ["sender@test.com"],
      );
    });

    it("returns null when no results", async () => {
      mockDb.select.mockResolvedValueOnce([]);

      const result = await getLatestAuthResult("unknown@test.com");

      expect(result).toBeNull();
    });
  });
});
