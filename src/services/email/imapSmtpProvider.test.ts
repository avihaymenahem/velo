import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImapSmtpProvider } from "./imapSmtpProvider";

// Mock all external dependencies
vi.mock("../db/accounts", () => ({
  getAccount: vi.fn(),
}));

vi.mock("../imap/imapConfigBuilder", () => ({
  buildImapConfig: vi.fn(),
  buildSmtpConfig: vi.fn(),
}));

vi.mock("../imap/imapSync", () => ({
  imapInitialSync: vi.fn(),
  imapDeltaSync: vi.fn(),
  imapMessageToParsedMessage: vi.fn(),
}));

vi.mock("../imap/folderMapper", () => ({
  mapFolderToLabel: vi.fn(),
  getSyncableFolders: vi.fn(),
}));

vi.mock("../imap/tauriCommands", () => ({
  imapListFolders: vi.fn(),
  imapSetFlags: vi.fn(),
  imapMoveMessages: vi.fn(),
  imapDeleteMessages: vi.fn(),
  imapFetchMessageBody: vi.fn(),
  imapFetchAttachment: vi.fn(),
  imapTestConnection: vi.fn(),
  imapAppendMessage: vi.fn(),
  smtpSendEmail: vi.fn(),
  smtpTestConnection: vi.fn(),
}));

vi.mock("../imap/messageHelper", () => ({
  findSpecialFolder: vi.fn(),
}));

import { getAccount } from "../db/accounts";
import { buildImapConfig, buildSmtpConfig } from "../imap/imapConfigBuilder";
import { mapFolderToLabel, getSyncableFolders } from "../imap/folderMapper";
import {
  imapListFolders,
  imapSetFlags,
  imapMoveMessages,
  imapDeleteMessages,
  imapTestConnection,
  imapAppendMessage,
  smtpSendEmail,
  smtpTestConnection,
} from "../imap/tauriCommands";
import { findSpecialFolder } from "../imap/messageHelper";

const mockImapConfig = {
  host: "imap.example.com",
  port: 993,
  security: "tls" as const,
  username: "user@example.com",
  password: "secret",
  auth_method: "password" as const,
};

const mockSmtpConfig = {
  host: "smtp.example.com",
  port: 587,
  security: "starttls" as const,
  username: "user@example.com",
  password: "secret",
  auth_method: "password" as const,
};

const mockAccount = {
  id: "acc-1",
  email: "user@example.com",
  display_name: "Test User",
  imap_host: "imap.example.com",
  imap_port: 993,
  imap_security: "ssl",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_security: "starttls",
  auth_method: "password",
  imap_password: "secret",
};

describe("ImapSmtpProvider", () => {
  let provider: ImapSmtpProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ImapSmtpProvider("acc-1");

    vi.mocked(getAccount).mockResolvedValue(mockAccount as never);
    vi.mocked(buildImapConfig).mockReturnValue(mockImapConfig);
    vi.mocked(buildSmtpConfig).mockReturnValue(mockSmtpConfig);
  });

  it("has correct accountId and type", () => {
    expect(provider.accountId).toBe("acc-1");
    expect(provider.type).toBe("imap");
  });

  // ---------- Folder operations ----------

  describe("listFolders", () => {
    it("calls imapListFolders and maps results", async () => {
      const rawFolders = [
        {
          path: "INBOX",
          name: "INBOX",
          delimiter: "/",
          special_use: "\\Inbox",
          exists: 42,
          unseen: 5,
        },
        {
          path: "Sent",
          name: "Sent",
          delimiter: "/",
          special_use: "\\Sent",
          exists: 100,
          unseen: 0,
        },
      ];

      vi.mocked(imapListFolders).mockResolvedValue(rawFolders);
      vi.mocked(getSyncableFolders).mockReturnValue(rawFolders);
      vi.mocked(mapFolderToLabel).mockImplementation((f) => ({
        labelId: f.path,
        labelName: f.name,
        type: f.special_use ? "system" : "user",
      }));

      const folders = await provider.listFolders();

      expect(imapListFolders).toHaveBeenCalledWith(mockImapConfig);
      expect(folders).toHaveLength(2);
      expect(folders[0]).toEqual({
        id: "INBOX",
        name: "INBOX",
        path: "INBOX",
        type: "system",
        specialUse: "\\Inbox",
        delimiter: "/",
        messageCount: 42,
        unreadCount: 5,
      });
    });
  });

  describe("createFolder", () => {
    it("throws an informative error", async () => {
      await expect(provider.createFolder("test")).rejects.toThrow(
        "not supported",
      );
    });
  });

  describe("deleteFolder", () => {
    it("throws an informative error", async () => {
      await expect(provider.deleteFolder("test")).rejects.toThrow(
        "not supported",
      );
    });
  });

  describe("renameFolder", () => {
    it("throws an informative error", async () => {
      await expect(provider.renameFolder("old", "new")).rejects.toThrow(
        "not supported",
      );
    });
  });

  // ---------- Actions ----------

  describe("archive", () => {
    it("moves messages to Archive folder", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Archive");
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.archive("thread-1", [
        "imap-acc-1-INBOX-100",
        "imap-acc-1-INBOX-200",
      ]);

      expect(findSpecialFolder).toHaveBeenCalledWith("acc-1", "\\Archive");
      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100, 200],
        "Archive",
      );
    });

    it("skips messages already in Archive", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Archive");
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.archive("thread-1", ["imap-acc-1-Archive-100"]);

      expect(imapMoveMessages).not.toHaveBeenCalled();
    });

    it("falls back to 'Archive' when special folder not found", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue(null);
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.archive("thread-1", ["imap-acc-1-INBOX-100"]);

      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        "Archive",
      );
    });
  });

  describe("trash", () => {
    it("moves messages to Trash folder", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Deleted Items");
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.trash("thread-1", ["imap-acc-1-INBOX-100"]);

      expect(findSpecialFolder).toHaveBeenCalledWith("acc-1", "\\Trash");
      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        "Deleted Items",
      );
    });
  });

  describe("permanentDelete", () => {
    it("calls imapDeleteMessages for each folder group", async () => {
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);

      await provider.permanentDelete("thread-1", [
        "imap-acc-1-INBOX-100",
        "imap-acc-1-Sent-200",
      ]);

      expect(imapDeleteMessages).toHaveBeenCalledTimes(2);
      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
      );
      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "Sent",
        [200],
      );
    });
  });

  describe("markRead", () => {
    it("sets Seen flag when read=true", async () => {
      vi.mocked(imapSetFlags).mockResolvedValue(undefined);

      await provider.markRead("thread-1", ["imap-acc-1-INBOX-100"], true);

      expect(imapSetFlags).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        ["Seen"],
        true,
      );
    });

    it("removes Seen flag when read=false", async () => {
      vi.mocked(imapSetFlags).mockResolvedValue(undefined);

      await provider.markRead("thread-1", ["imap-acc-1-INBOX-100"], false);

      expect(imapSetFlags).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        ["Seen"],
        false,
      );
    });
  });

  describe("star", () => {
    it("sets Flagged flag when starred=true", async () => {
      vi.mocked(imapSetFlags).mockResolvedValue(undefined);

      await provider.star("thread-1", ["imap-acc-1-INBOX-100"], true);

      expect(imapSetFlags).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        ["Flagged"],
        true,
      );
    });
  });

  describe("spam", () => {
    it("moves to Junk when isSpam=true", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Junk E-Mail");
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.spam("thread-1", ["imap-acc-1-INBOX-100"], true);

      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        "Junk E-Mail",
      );
    });

    it("moves to INBOX when isSpam=false", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Junk");
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.spam("thread-1", ["imap-acc-1-Junk-100"], false);

      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "Junk",
        [100],
        "INBOX",
      );
    });
  });

  describe("moveToFolder", () => {
    it("moves messages to specified folder", async () => {
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.moveToFolder("thread-1", ["imap-acc-1-INBOX-100"], "Work");

      expect(imapMoveMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100],
        "Work",
      );
    });

    it("skips messages already in target folder", async () => {
      vi.mocked(imapMoveMessages).mockResolvedValue(undefined);

      await provider.moveToFolder(
        "thread-1",
        ["imap-acc-1-Work-100"],
        "Work",
      );

      expect(imapMoveMessages).not.toHaveBeenCalled();
    });
  });

  describe("addLabel / removeLabel", () => {
    it("addLabel does not throw (warns instead)", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await provider.addLabel("thread-1", "Label_1");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it("removeLabel does not throw (warns instead)", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await provider.removeLabel("thread-1", "Label_1");
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ---------- Send / Draft operations ----------

  describe("sendMessage", () => {
    it("sends via SMTP and copies to Sent folder", async () => {
      vi.mocked(smtpSendEmail).mockResolvedValue({
        success: true,
        message: "OK",
      });
      vi.mocked(findSpecialFolder).mockResolvedValue("Sent Items");
      vi.mocked(imapAppendMessage).mockResolvedValue(undefined);

      const result = await provider.sendMessage("base64data");

      expect(smtpSendEmail).toHaveBeenCalledWith(mockSmtpConfig, "base64data");
      expect(imapAppendMessage).toHaveBeenCalledWith(
        mockImapConfig,
        "Sent Items",
        "base64data",
        "(\\Seen)",
      );
      expect(result.id).toMatch(/^imap-sent-/);
    });

    it("throws if SMTP send fails", async () => {
      vi.mocked(smtpSendEmail).mockResolvedValue({
        success: false,
        message: "Authentication failed",
      });

      await expect(provider.sendMessage("base64data")).rejects.toThrow(
        "SMTP send failed: Authentication failed",
      );
    });

    it("succeeds even if Sent folder copy fails", async () => {
      vi.mocked(smtpSendEmail).mockResolvedValue({
        success: true,
        message: "OK",
      });
      vi.mocked(findSpecialFolder).mockResolvedValue("Sent");
      vi.mocked(imapAppendMessage).mockRejectedValue(
        new Error("APPEND failed"),
      );

      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await provider.sendMessage("base64data");
      expect(result.id).toMatch(/^imap-sent-/);
      spy.mockRestore();
    });
  });

  describe("createDraft", () => {
    it("appends to Drafts folder with Draft flag", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("INBOX.Drafts");
      vi.mocked(imapAppendMessage).mockResolvedValue(undefined);

      const result = await provider.createDraft("base64data");

      expect(imapAppendMessage).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX.Drafts",
        "base64data",
        "(\\Draft)",
      );
      expect(result.draftId).toMatch(/^imap-draft-/);
    });

    it("falls back to 'Drafts' when special folder not found", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue(null);
      vi.mocked(imapAppendMessage).mockResolvedValue(undefined);

      await provider.createDraft("base64data");

      expect(imapAppendMessage).toHaveBeenCalledWith(
        mockImapConfig,
        "Drafts",
        "base64data",
        "(\\Draft)",
      );
    });
  });

  describe("updateDraft", () => {
    it("deletes old draft and creates new one", async () => {
      vi.mocked(findSpecialFolder).mockResolvedValue("Drafts");
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);
      vi.mocked(imapAppendMessage).mockResolvedValue(undefined);

      const result = await provider.updateDraft(
        "imap-acc-1-Drafts-500",
        "newBase64data",
      );

      // Should delete old draft
      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "Drafts",
        [500],
      );
      // Should create new draft
      expect(imapAppendMessage).toHaveBeenCalledWith(
        mockImapConfig,
        "Drafts",
        "newBase64data",
        "(\\Draft)",
      );
      expect(result.draftId).toMatch(/^imap-draft-/);
    });
  });

  describe("deleteDraft", () => {
    it("deletes draft by parsed message ID", async () => {
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);

      await provider.deleteDraft("imap-acc-1-Drafts-500");

      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "Drafts",
        [500],
      );
    });

    it("warns for generated draft IDs that cannot be deleted", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await provider.deleteDraft("imap-draft-1234567890-abc");

      expect(imapDeleteMessages).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // ---------- Connection / Profile ----------

  describe("testConnection", () => {
    it("tests both IMAP and SMTP", async () => {
      vi.mocked(imapTestConnection).mockResolvedValue("OK");
      vi.mocked(smtpTestConnection).mockResolvedValue({
        success: true,
        message: "OK",
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("Connected");
      expect(imapTestConnection).toHaveBeenCalledWith(mockImapConfig);
      expect(smtpTestConnection).toHaveBeenCalledWith(mockSmtpConfig);
    });

    it("reports SMTP failure even if IMAP succeeds", async () => {
      vi.mocked(imapTestConnection).mockResolvedValue("OK");
      vi.mocked(smtpTestConnection).mockResolvedValue({
        success: false,
        message: "Auth failed",
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("SMTP failed");
    });

    it("reports IMAP failure", async () => {
      vi.mocked(imapTestConnection).mockRejectedValue(
        new Error("Connection refused"),
      );

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("IMAP connection failed");
    });
  });

  describe("getProfile", () => {
    it("returns email and name from DB account", async () => {
      const profile = await provider.getProfile();

      expect(profile.email).toBe("user@example.com");
      expect(profile.name).toBe("Test User");
    });

    it("throws if account not found", async () => {
      vi.mocked(getAccount).mockResolvedValue(null);

      await expect(provider.getProfile()).rejects.toThrow("not found");
    });
  });

  // ---------- Config caching ----------

  describe("config caching", () => {
    it("caches IMAP config after first call", async () => {
      vi.mocked(imapSetFlags).mockResolvedValue(undefined);

      await provider.markRead("t1", ["imap-acc-1-INBOX-100"], true);
      await provider.markRead("t1", ["imap-acc-1-INBOX-200"], true);

      // buildImapConfig should be called once (cached after first call)
      expect(buildImapConfig).toHaveBeenCalledTimes(1);
    });

    it("clearConfigCache forces re-fetch", async () => {
      vi.mocked(imapSetFlags).mockResolvedValue(undefined);

      await provider.markRead("t1", ["imap-acc-1-INBOX-100"], true);
      provider.clearConfigCache();
      await provider.markRead("t1", ["imap-acc-1-INBOX-200"], true);

      expect(buildImapConfig).toHaveBeenCalledTimes(2);
    });
  });

  // ---------- Message ID parsing ----------

  describe("groupByFolder (via actions)", () => {
    it("groups messages from different folders", async () => {
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);

      await provider.permanentDelete("thread-1", [
        "imap-acc-1-INBOX-100",
        "imap-acc-1-INBOX-200",
        "imap-acc-1-Sent-300",
      ]);

      expect(imapDeleteMessages).toHaveBeenCalledTimes(2);
      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX",
        [100, 200],
      );
      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "Sent",
        [300],
      );
    });

    it("handles folder names with hyphens", async () => {
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);

      await provider.permanentDelete("thread-1", [
        "imap-acc-1-INBOX.Sub-Folder-100",
      ]);

      expect(imapDeleteMessages).toHaveBeenCalledWith(
        mockImapConfig,
        "INBOX.Sub-Folder",
        [100],
      );
    });

    it("skips invalid message IDs", async () => {
      vi.mocked(imapDeleteMessages).mockResolvedValue(undefined);
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await provider.permanentDelete("thread-1", ["invalid-id"]);

      expect(imapDeleteMessages).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
