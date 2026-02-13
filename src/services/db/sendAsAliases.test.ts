import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "@/services/db/connection";
import {
  getAliasesForAccount,
  upsertAlias,
  getDefaultAlias,
  setDefaultAlias,
  deleteAlias,
  mapDbAlias,
  type DbSendAsAlias,
} from "./sendAsAliases";

const mockDb = {
  select: vi.fn(() => Promise.resolve([])),
  execute: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
};

describe("sendAsAliases service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(
      mockDb as unknown as Awaited<ReturnType<typeof getDb>>,
    );
  });

  describe("getAliasesForAccount", () => {
    it("queries aliases ordered by is_primary DESC, email", async () => {
      await getAliasesForAccount("acc-1");

      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("SELECT * FROM send_as_aliases WHERE account_id = $1"),
        ["acc-1"],
      );
    });
  });

  describe("upsertAlias", () => {
    it("inserts an alias with correct parameters", async () => {
      await upsertAlias({
        accountId: "acc-1",
        email: "user@example.com",
        displayName: "User Name",
        isPrimary: true,
        isDefault: false,
        treatAsAlias: true,
        verificationStatus: "accepted",
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO send_as_aliases"),
        expect.arrayContaining([
          "acc-1",
          "user@example.com",
          "User Name",
          null, // replyToAddress
          null, // signatureId
          1, // isPrimary
          0, // isDefault
          1, // treatAsAlias
          "accepted",
        ]),
      );
    });

    it("defaults treatAsAlias to 1 when not specified", async () => {
      await upsertAlias({
        accountId: "acc-1",
        email: "user@example.com",
      });

      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO send_as_aliases"),
        expect.arrayContaining([
          1, // treatAsAlias default
          "accepted", // verificationStatus default
        ]),
      );
    });
  });

  describe("getDefaultAlias", () => {
    it("returns the default alias when one exists", async () => {
      const alias: DbSendAsAlias = {
        id: "alias-1",
        account_id: "acc-1",
        email: "default@example.com",
        display_name: "Default",
        reply_to_address: null,
        signature_id: null,
        is_primary: 0,
        is_default: 1,
        treat_as_alias: 1,
        verification_status: "accepted",
        created_at: 1000,
      };
      mockDb.select.mockResolvedValueOnce([alias]);

      const result = await getDefaultAlias("acc-1");

      expect(result).toEqual(alias);
      expect(mockDb.select).toHaveBeenCalledWith(
        expect.stringContaining("is_default = 1"),
        ["acc-1"],
      );
    });

    it("falls back to primary alias when no default exists", async () => {
      const primary: DbSendAsAlias = {
        id: "alias-2",
        account_id: "acc-1",
        email: "primary@example.com",
        display_name: "Primary",
        reply_to_address: null,
        signature_id: null,
        is_primary: 1,
        is_default: 0,
        treat_as_alias: 1,
        verification_status: "accepted",
        created_at: 1000,
      };
      mockDb.select
        .mockResolvedValueOnce([]) // no default
        .mockResolvedValueOnce([primary]); // primary fallback

      const result = await getDefaultAlias("acc-1");

      expect(result).toEqual(primary);
    });

    it("returns null when no aliases exist", async () => {
      mockDb.select
        .mockResolvedValueOnce([]) // no default
        .mockResolvedValueOnce([]); // no primary

      const result = await getDefaultAlias("acc-1");

      expect(result).toBeNull();
    });
  });

  describe("setDefaultAlias", () => {
    it("clears existing defaults and sets the specified one", async () => {
      await setDefaultAlias("acc-1", "alias-3");

      expect(mockDb.execute).toHaveBeenCalledTimes(2);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE send_as_aliases SET is_default = 0"),
        ["acc-1"],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE send_as_aliases SET is_default = 1"),
        ["alias-3", "acc-1"],
      );
    });
  });

  describe("deleteAlias", () => {
    it("deletes the alias by id", async () => {
      await deleteAlias("alias-5");

      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM send_as_aliases WHERE id = $1",
        ["alias-5"],
      );
    });
  });

  describe("mapDbAlias", () => {
    it("maps DB row to domain object", () => {
      const db: DbSendAsAlias = {
        id: "alias-1",
        account_id: "acc-1",
        email: "test@example.com",
        display_name: "Test User",
        reply_to_address: "reply@example.com",
        signature_id: "sig-1",
        is_primary: 1,
        is_default: 0,
        treat_as_alias: 1,
        verification_status: "accepted",
        created_at: 1700000000,
      };

      const result = mapDbAlias(db);

      expect(result).toEqual({
        id: "alias-1",
        accountId: "acc-1",
        email: "test@example.com",
        displayName: "Test User",
        replyToAddress: "reply@example.com",
        signatureId: "sig-1",
        isPrimary: true,
        isDefault: false,
        treatAsAlias: true,
        verificationStatus: "accepted",
      });
    });

    it("maps zero values to false booleans", () => {
      const db: DbSendAsAlias = {
        id: "alias-2",
        account_id: "acc-1",
        email: "test@example.com",
        display_name: null,
        reply_to_address: null,
        signature_id: null,
        is_primary: 0,
        is_default: 0,
        treat_as_alias: 0,
        verification_status: "pending",
        created_at: 1700000000,
      };

      const result = mapDbAlias(db);

      expect(result.isPrimary).toBe(false);
      expect(result.isDefault).toBe(false);
      expect(result.treatAsAlias).toBe(false);
      expect(result.displayName).toBeNull();
      expect(result.replyToAddress).toBeNull();
      expect(result.signatureId).toBeNull();
    });
  });
});
