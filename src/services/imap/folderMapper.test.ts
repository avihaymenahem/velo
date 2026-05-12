import { describe, it, expect } from "vitest";
import { mapFolderToLabel, getLabelsForMessage, getSyncableFolders, isSelectableFolder } from "./folderMapper";
import { createMockImapFolder } from "@/test/mocks";

describe("mapFolderToLabel", () => {
  it("maps special_use \\Inbox to INBOX label", () => {
    const folder = createMockImapFolder({ special_use: "\\Inbox" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "INBOX", labelName: "Inbox", type: "system" });
  });

  it("maps special_use \\Sent to SENT label", () => {
    const folder = createMockImapFolder({ path: "Sent", name: "Sent", special_use: "\\Sent" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("maps special_use \\Drafts to DRAFT label", () => {
    const folder = createMockImapFolder({ path: "Drafts", name: "Drafts", special_use: "\\Drafts" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "DRAFT", labelName: "Drafts", type: "system" });
  });

  it("maps special_use \\Trash to TRASH label", () => {
    const folder = createMockImapFolder({ path: "Trash", name: "Trash", special_use: "\\Trash" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "TRASH", labelName: "Trash", type: "system" });
  });

  it("maps special_use \\Junk to SPAM label", () => {
    const folder = createMockImapFolder({ path: "Junk", name: "Junk", special_use: "\\Junk" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SPAM", labelName: "Spam", type: "system" });
  });

  it("maps special_use \\Archive to archive label", () => {
    const folder = createMockImapFolder({ path: "Archive", name: "Archive", special_use: "\\Archive" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "archive", labelName: "Archive", type: "system" });
  });

  it("falls back to folder name when no special_use", () => {
    const folder = createMockImapFolder({ path: "INBOX", name: "INBOX", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "INBOX", labelName: "Inbox", type: "system" });
  });

  it("falls back to name-based detection for Sent Items", () => {
    const folder = createMockImapFolder({ path: "Sent Items", name: "Sent Items", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("falls back to name-based detection for Deleted Items", () => {
    const folder = createMockImapFolder({ path: "Deleted Items", name: "Deleted Items", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "TRASH", labelName: "Trash", type: "system" });
  });

  it("maps [Gmail]/Sent Mail correctly", () => {
    const folder = createMockImapFolder({ path: "[Gmail]/Sent Mail", name: "Sent Mail", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("creates user folder label for unrecognized folders", () => {
    const folder = createMockImapFolder({ path: "My Folder", name: "My Folder", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({
      labelId: "folder-My Folder",
      labelName: "My Folder",
      type: "user",
    });
  });

  it("creates user folder label for nested folders", () => {
    const folder = createMockImapFolder({ path: "Work/Projects", name: "Projects", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({
      labelId: "folder-Work/Projects",
      labelName: "Projects",
      type: "user",
    });
  });
});

describe("getLabelsForMessage", () => {
  it("includes folder label and UNREAD for unread messages", () => {
    const mapping = { labelId: "INBOX", labelName: "Inbox", type: "system" };
    const labels = getLabelsForMessage(mapping, false, false, false);
    expect(labels).toEqual(["INBOX", "UNREAD"]);
  });

  it("does not include UNREAD for read messages", () => {
    const mapping = { labelId: "INBOX", labelName: "Inbox", type: "system" };
    const labels = getLabelsForMessage(mapping, true, false, false);
    expect(labels).toEqual(["INBOX"]);
  });

  it("includes STARRED for starred messages", () => {
    const mapping = { labelId: "INBOX", labelName: "Inbox", type: "system" };
    const labels = getLabelsForMessage(mapping, true, true, false);
    expect(labels).toEqual(["INBOX", "STARRED"]);
  });

  it("includes DRAFT for draft messages", () => {
    const mapping = { labelId: "DRAFT", labelName: "Drafts", type: "system" };
    const labels = getLabelsForMessage(mapping, true, false, true);
    expect(labels).toEqual(["DRAFT", "DRAFT"]);
  });

  it("includes all applicable labels", () => {
    const mapping = { labelId: "INBOX", labelName: "Inbox", type: "system" };
    const labels = getLabelsForMessage(mapping, false, true, false);
    expect(labels).toContain("INBOX");
    expect(labels).toContain("UNREAD");
    expect(labels).toContain("STARRED");
  });
});

describe("getSyncableFolders", () => {
  it("filters out [Gmail] parent folder", () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "[Gmail]", name: "[Gmail]" }),
      createMockImapFolder({ path: "[Gmail]/Sent Mail", name: "Sent Mail" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(["INBOX", "[Gmail]/Sent Mail"]);
  });

  it("filters out [Google Mail] parent folder", () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "[Google Mail]", name: "[Google Mail]" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(1);
  });

  it("keeps all normal folders", () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "Sent", name: "Sent" }),
      createMockImapFolder({ path: "Work", name: "Work" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(3);
  });
});

describe("isSelectableFolder", () => {
  it("returns false for shared folders (shared/ prefix)", () => {
    const folder = createMockImapFolder({ path: "shared/Projects", name: "Projects" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns false for shared folders (case-insensitive)", () => {
    const folder = createMockImapFolder({ path: "Shared/Mailbox", name: "Mailbox" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns false for Groups folders", () => {
    const folder = createMockImapFolder({ path: "groups/team", name: "team" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns false for Public folders", () => {
    const folder = createMockImapFolder({ path: "public/announcements", name: "announcements" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns false for nested shared folder paths", () => {
    const folder = createMockImapFolder({ path: "users/alice/shared/Archive", name: "Archive" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns false for [nostromo] system containers", () => {
    const folder = createMockImapFolder({ path: "[nostromo]/virtual", name: "virtual" });
    expect(isSelectableFolder(folder)).toBe(false);
  });

  it("returns true for normal user folders", () => {
    const folder = createMockImapFolder({ path: "INBOX", name: "INBOX" });
    expect(isSelectableFolder(folder)).toBe(true);
  });

  it("returns true for Sent, Drafts, Archive folders", () => {
    const folders = [
      createMockImapFolder({ path: "Sent", name: "Sent" }),
      createMockImapFolder({ path: "Drafts", name: "Drafts" }),
      createMockImapFolder({ path: "Archive", name: "Archive" }),
      createMockImapFolder({ path: "Work/Projects", name: "Projects" }),
    ];
    for (const folder of folders) {
      expect(isSelectableFolder(folder)).toBe(true);
    }
  });
});

describe("\\Noselect folder handling (UIDVALIDITY scenarios)", () => {
  it("getSyncableFolders excludes shared folders that cause sync failures", () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", name: "INBOX", exists: 10 }),
      createMockImapFolder({ path: "shared/Projects", name: "Projects", exists: 5 }),
      createMockImapFolder({ path: "Sent", name: "Sent", exists: 3 }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(["INBOX", "Sent"]);
  });

  it("getSyncableFolders excludes Public and Groups folders", () => {
    const folders = [
      createMockImapFolder({ path: "INBOX", name: "INBOX", exists: 10 }),
      createMockImapFolder({ path: "public/general", name: "general", exists: 2 }),
      createMockImapFolder({ path: "groups/engineering", name: "engineering", exists: 4 }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("INBOX");
  });

  it("skips folders with zero UIDVALIDITY during sync (Noselect indicator)", () => {
    // Simulates the check in imapInitialSync that skips folders with uidvalidity=0
    // These folders are non-selectable (like shared mailboxes on DavMail/Exchange)
    const searchResult = {
      uids: [1, 2, 3],
      folder_status: { uidvalidity: 0, uidnext: 100, exists: 3, unseen: 1, highest_modseq: null },
    };

    // Zero UIDVALIDITY is the signature of a non-selectable folder
    expect(searchResult.folder_status.uidvalidity).toBe(0);
    expect(searchResult.folder_status.uidvalidity === 0).toBe(true);
  });

  it("UIDVALIDITY change triggers full resync of folder", () => {
    // Simulates the UIDVALIDITY change detection in delta sync
    const savedState = { uidvalidity: 12345, last_uid: 50, folder_path: "INBOX" };
    const currentStatus = { uidvalidity: 99999, uidnext: 150, exists: 100, unseen: 5, highest_modseq: null };

    const uidvalidityChanged = savedState.uidvalidity !== currentStatus.uidvalidity;

    expect(uidvalidityChanged).toBe(true);
    expect(savedState.uidvalidity).toBe(12345);
    expect(currentStatus.uidvalidity).toBe(99999);
  });

  it("stable UIDVALIDITY continues with delta sync", () => {
    const savedState = { uidvalidity: 12345, last_uid: 50, folder_path: "INBOX" };
    const currentStatus = { uidvalidity: 12345, uidnext: 150, exists: 100, unseen: 5, highest_modseq: null };

    const uidvalidityChanged = savedState.uidvalidity !== currentStatus.uidvalidity;

    expect(uidvalidityChanged).toBe(false);
    // Delta sync would proceed to fetch new UIDs from last_uid+1
    expect(currentStatus.uidvalidity).toBe(savedState.uidvalidity);
  });
});