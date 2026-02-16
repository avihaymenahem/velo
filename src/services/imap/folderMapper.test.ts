import { describe, it, expect } from "vitest";
import { mapFolderToLabel, getLabelsForMessage, getSyncableFolders } from "./folderMapper";
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
    const folders: ImapFolder[] = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "[Gmail]", name: "[Gmail]" }),
      createMockImapFolder({ path: "[Gmail]/Sent Mail", name: "Sent Mail" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(["INBOX", "[Gmail]/Sent Mail"]);
  });

  it("filters out [Google Mail] parent folder", () => {
    const folders: ImapFolder[] = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "[Google Mail]", name: "[Google Mail]" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(1);
  });

  it("keeps all normal folders", () => {
    const folders: ImapFolder[] = [
      createMockImapFolder({ path: "INBOX", name: "INBOX" }),
      createMockImapFolder({ path: "Sent", name: "Sent" }),
      createMockImapFolder({ path: "Work", name: "Work" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(3);
  });
});
