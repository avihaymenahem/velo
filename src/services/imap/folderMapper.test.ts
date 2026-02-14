import { describe, it, expect } from "vitest";
import { mapFolderToLabel, getLabelsForMessage, getSyncableFolders } from "./folderMapper";
import type { ImapFolder } from "./tauriCommands";

function makeFolder(overrides: Partial<ImapFolder> = {}): ImapFolder {
  return {
    path: "INBOX",
    name: "INBOX",
    delimiter: "/",
    special_use: null,
    exists: 100,
    unseen: 10,
    ...overrides,
  };
}

describe("mapFolderToLabel", () => {
  it("maps special_use \\Inbox to INBOX label", () => {
    const folder = makeFolder({ special_use: "\\Inbox" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "INBOX", labelName: "Inbox", type: "system" });
  });

  it("maps special_use \\Sent to SENT label", () => {
    const folder = makeFolder({ path: "Sent", name: "Sent", special_use: "\\Sent" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("maps special_use \\Drafts to DRAFT label", () => {
    const folder = makeFolder({ path: "Drafts", name: "Drafts", special_use: "\\Drafts" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "DRAFT", labelName: "Drafts", type: "system" });
  });

  it("maps special_use \\Trash to TRASH label", () => {
    const folder = makeFolder({ path: "Trash", name: "Trash", special_use: "\\Trash" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "TRASH", labelName: "Trash", type: "system" });
  });

  it("maps special_use \\Junk to SPAM label", () => {
    const folder = makeFolder({ path: "Junk", name: "Junk", special_use: "\\Junk" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SPAM", labelName: "Spam", type: "system" });
  });

  it("maps special_use \\Archive to archive label", () => {
    const folder = makeFolder({ path: "Archive", name: "Archive", special_use: "\\Archive" });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "archive", labelName: "Archive", type: "system" });
  });

  it("falls back to folder name when no special_use", () => {
    const folder = makeFolder({ path: "INBOX", name: "INBOX", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "INBOX", labelName: "Inbox", type: "system" });
  });

  it("falls back to name-based detection for Sent Items", () => {
    const folder = makeFolder({ path: "Sent Items", name: "Sent Items", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("falls back to name-based detection for Deleted Items", () => {
    const folder = makeFolder({ path: "Deleted Items", name: "Deleted Items", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "TRASH", labelName: "Trash", type: "system" });
  });

  it("maps [Gmail]/Sent Mail correctly", () => {
    const folder = makeFolder({ path: "[Gmail]/Sent Mail", name: "Sent Mail", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({ labelId: "SENT", labelName: "Sent", type: "system" });
  });

  it("creates user folder label for unrecognized folders", () => {
    const folder = makeFolder({ path: "My Folder", name: "My Folder", special_use: null });
    const result = mapFolderToLabel(folder);
    expect(result).toEqual({
      labelId: "folder-My Folder",
      labelName: "My Folder",
      type: "user",
    });
  });

  it("creates user folder label for nested folders", () => {
    const folder = makeFolder({ path: "Work/Projects", name: "Projects", special_use: null });
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
      makeFolder({ path: "INBOX", name: "INBOX" }),
      makeFolder({ path: "[Gmail]", name: "[Gmail]" }),
      makeFolder({ path: "[Gmail]/Sent Mail", name: "Sent Mail" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(["INBOX", "[Gmail]/Sent Mail"]);
  });

  it("filters out [Google Mail] parent folder", () => {
    const folders: ImapFolder[] = [
      makeFolder({ path: "INBOX", name: "INBOX" }),
      makeFolder({ path: "[Google Mail]", name: "[Google Mail]" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(1);
  });

  it("keeps all normal folders", () => {
    const folders: ImapFolder[] = [
      makeFolder({ path: "INBOX", name: "INBOX" }),
      makeFolder({ path: "Sent", name: "Sent" }),
      makeFolder({ path: "Work", name: "Work" }),
    ];
    const result = getSyncableFolders(folders);
    expect(result).toHaveLength(3);
  });
});
