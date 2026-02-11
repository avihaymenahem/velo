import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/services/db/connection";
import { getAllContacts, updateContact, deleteContact } from "./contacts";

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
});
