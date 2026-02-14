import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  groupMessagesByFolder,
  securityToConfigType,
  type ImapMessageInfo,
} from "./messageHelper";

// Mock the DB module
vi.mock("../db/connection", () => ({
  getDb: vi.fn(),
}));

describe("messageHelper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("groupMessagesByFolder", () => {
    it("groups messages by their folder", () => {
      const messages = new Map<string, ImapMessageInfo>([
        ["msg1", { uid: 100, folder: "INBOX" }],
        ["msg2", { uid: 200, folder: "INBOX" }],
        ["msg3", { uid: 300, folder: "Sent" }],
        ["msg4", { uid: 400, folder: "Drafts" }],
      ]);

      const grouped = groupMessagesByFolder(messages);

      expect(grouped.size).toBe(3);
      expect(grouped.get("INBOX")).toEqual([100, 200]);
      expect(grouped.get("Sent")).toEqual([300]);
      expect(grouped.get("Drafts")).toEqual([400]);
    });

    it("returns empty map for empty input", () => {
      const messages = new Map<string, ImapMessageInfo>();
      const grouped = groupMessagesByFolder(messages);
      expect(grouped.size).toBe(0);
    });

    it("handles single message", () => {
      const messages = new Map<string, ImapMessageInfo>([
        ["msg1", { uid: 42, folder: "Archive" }],
      ]);

      const grouped = groupMessagesByFolder(messages);
      expect(grouped.size).toBe(1);
      expect(grouped.get("Archive")).toEqual([42]);
    });
  });

  describe("securityToConfigType", () => {
    it("maps 'ssl' to 'tls'", () => {
      expect(securityToConfigType("ssl")).toBe("tls");
    });

    it("maps 'starttls' to 'starttls'", () => {
      expect(securityToConfigType("starttls")).toBe("starttls");
    });

    it("maps 'none' to 'none'", () => {
      expect(securityToConfigType("none")).toBe("none");
    });

    it("defaults to 'tls' for unknown values", () => {
      expect(securityToConfigType("unknown")).toBe("tls");
      expect(securityToConfigType("")).toBe("tls");
    });
  });

  describe("getImapUidsForMessages", () => {
    it("returns empty map for empty input", async () => {
      const { getImapUidsForMessages } = await import("./messageHelper");
      const result = await getImapUidsForMessages("acc1", []);
      expect(result.size).toBe(0);
    });
  });

  describe("findSpecialFolder", () => {
    it("returns null when no matching folder exists", async () => {
      const { getDb } = await import("../db/connection");
      const mockDb = {
        select: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const { findSpecialFolder } = await import("./messageHelper");
      const result = await findSpecialFolder("acc1", "\\Trash");
      expect(result).toBeNull();
    });

    it("returns imap_folder_path when available", async () => {
      const { getDb } = await import("../db/connection");
      const mockDb = {
        select: vi.fn().mockResolvedValue([
          { imap_folder_path: "INBOX.Trash", name: "Trash" },
        ]),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const { findSpecialFolder } = await import("./messageHelper");
      const result = await findSpecialFolder("acc1", "\\Trash");
      expect(result).toBe("INBOX.Trash");
    });

    it("falls back to name when imap_folder_path is null", async () => {
      const { getDb } = await import("../db/connection");
      const mockDb = {
        select: vi.fn().mockResolvedValue([
          { imap_folder_path: null, name: "Trash" },
        ]),
      };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const { findSpecialFolder } = await import("./messageHelper");
      const result = await findSpecialFolder("acc1", "\\Trash");
      expect(result).toBe("Trash");
    });
  });

  describe("updateMessageImapFolder", () => {
    it("does nothing for empty message list", async () => {
      const { getDb } = await import("../db/connection");
      const mockDb = { execute: vi.fn() };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const { updateMessageImapFolder } = await import("./messageHelper");
      await updateMessageImapFolder("acc1", [], "INBOX");
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it("updates folder for given messages", async () => {
      const { getDb } = await import("../db/connection");
      const mockDb = { execute: vi.fn().mockResolvedValue(undefined) };
      vi.mocked(getDb).mockResolvedValue(mockDb as never);

      const { updateMessageImapFolder } = await import("./messageHelper");
      await updateMessageImapFolder("acc1", ["msg1", "msg2"], "Trash");

      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE messages SET imap_folder"),
        ["Trash", "acc1", "msg1", "msg2"],
      );
    });
  });
});
