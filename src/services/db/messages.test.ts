import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/connection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db/connection")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/services/db/connection";
import { deleteAllMessagesForAccount } from "./messages";
import { createMockDb } from "@/test/mocks";

const mockDb = createMockDb();

describe("messages service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDb).mockResolvedValue(mockDb as unknown as Awaited<ReturnType<typeof getDb>>);
  });

  describe("deleteAllMessagesForAccount", () => {
    it("deletes all messages for the given account", async () => {
      await deleteAllMessagesForAccount("acc-1");

      expect(mockDb.execute).toHaveBeenCalledWith(
        "DELETE FROM messages WHERE account_id = $1",
        ["acc-1"],
      );
    });
  });
});
