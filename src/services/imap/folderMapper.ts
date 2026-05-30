import type { ImapFolder } from "./tauriCommands";
import { upsertLabel } from "../db/labels";

/**
 * Mapping from IMAP special-use flags to Gmail-style label IDs.
 */
const SPECIAL_USE_MAP: Record<string, { labelId: string; labelName: string; type: string }> = {
  "\\Inbox": { labelId: "INBOX", labelName: "Inbox", type: "system" },
  "\\Sent": { labelId: "SENT", labelName: "Sent", type: "system" },
  "\\Drafts": { labelId: "DRAFT", labelName: "Drafts", type: "system" },
  "\\Trash": { labelId: "TRASH", labelName: "Trash", type: "system" },
  "\\Junk": { labelId: "SPAM", labelName: "Spam", type: "system" },
  "\\Archive": { labelId: "archive", labelName: "Archive", type: "system" },
  "\\Flagged": { labelId: "STARRED", labelName: "Starred", type: "system" },
  "\\All": { labelId: "all-mail", labelName: "All Mail", type: "system" },
  "\\Important": { labelId: "IMPORTANT", labelName: "Important", type: "system" },
};

/**
 * Well-known folder names (case-insensitive) for servers that don't
 * report special-use attributes.
 */
const FOLDER_NAME_MAP: Record<string, string> = {
  inbox: "\\Inbox",
  sent: "\\Sent",
  "sent items": "\\Sent",
  "sent mail": "\\Sent",
  drafts: "\\Drafts",
  draft: "\\Drafts",
  draftbox: "\\Drafts",
  brouillons: "\\Drafts",
  trash: "\\Trash",
  "deleted items": "\\Trash",
  "deleted messages": "\\Trash",
  bin: "\\Trash",
  corbeille: "\\Trash",
  unsolbox: "\\Trash",
  junk: "\\Junk",
  "junk e-mail": "\\Junk",
  spam: "\\Junk",
  archive: "\\Archive",
  archives: "\\Archive",
  flagged: "\\Flagged",
  starred: "\\Flagged",
  "all mail": "\\All",
  "[gmail]/all mail": "\\All",
  "[gmail]/sent mail": "\\Sent",
  "[gmail]/drafts": "\\Drafts",
  "[gmail]/spam": "\\Junk",
  "[gmail]/trash": "\\Trash",
  "[gmail]/starred": "\\Flagged",
  "[gmail]/important": "\\Important",
};

export interface FolderLabelMapping {
  labelId: string;
  labelName: string;
  type: string;
}

/**
 * Map an IMAP folder to a Gmail-style label.
 * Uses special-use attributes first, then falls back to folder name matching,
 * and finally uses a user-folder prefix for unrecognized folders.
 */
export function mapFolderToLabel(folder: ImapFolder): FolderLabelMapping {
  // Check special-use attribute first
  if (folder.special_use) {
    const mapping = SPECIAL_USE_MAP[folder.special_use];
    if (mapping) {
      return mapping;
    }
  }

  // Fall back to name-based detection
  const lowerPath = folder.path.toLowerCase();
  const lowerName = folder.name.toLowerCase();

  const specialUse = FOLDER_NAME_MAP[lowerPath] ?? FOLDER_NAME_MAP[lowerName];
  if (specialUse) {
    const mapping = SPECIAL_USE_MAP[specialUse];
    if (mapping) {
      return mapping;
    }
  }

  // User-defined folder
  return {
    labelId: `folder-${folder.path}`,
    labelName: folder.name,
    type: "user",
  };
}

/**
 * System folders where the folder label itself is authoritative for categorization.
 * The \Draft flag must be ignored in these folders to prevent messages from
 * incorrectly appearing in both the source folder and Drafts.
 */
const CATEGORY_FOLDERS = new Set([
  "INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "STARRED", "archive",
]);

/**
 * Get the label IDs that a message in a given folder should have.
 * For example, a message in INBOX that is flagged (starred) would get
 * ["INBOX", "STARRED"].
 */
export function getLabelsForMessage(
  folderMapping: FolderLabelMapping,
  isRead: boolean,
  isStarred: boolean,
  isDraft: boolean,
): string[] {
  const labels: string[] = [folderMapping.labelId];

  if (!isRead) {
    labels.push("UNREAD");
  }

  if (isStarred) {
    labels.push("STARRED");
  }

  // Only apply the \Draft flag when the folder itself does not already provide
  // categorization (e.g. servers that store everything in All Mail and use flags).
  // For specific system folders like INBOX/SENT/TRASH the folder is authoritative:
  // the \Draft flag may be stale or set incorrectly by the server.
  if (isDraft && !CATEGORY_FOLDERS.has(folderMapping.labelId)) {
    labels.push("DRAFT");
  }

  return labels;
}

/**
 * Sync IMAP folders to the labels table in the DB.
 * Creates/updates label entries for each folder.
 */
export async function syncFoldersToLabels(
  accountId: string,
  folders: ImapFolder[],
): Promise<void> {
  console.log(`[folderMapper] Syncing ${folders.length} folders to DB...`);
  for (const folder of folders) {
    const mapping = mapFolderToLabel(folder);
    console.log(`[folderMapper] Upserting label for folder: ${folder.path} -> ${mapping.labelId}`);
    await upsertLabel({
      id: mapping.labelId,
      accountId,
      name: mapping.labelName,
      type: mapping.type,
      imapFolderPath: folder.raw_path,
      imapSpecialUse: folder.special_use,
    });
  }

  // Also ensure the UNREAD pseudo-label exists
  await upsertLabel({
    id: "UNREAD",
    accountId,
    name: "Unread",
    type: "system",
  });
}

/**
 * Determine which folders should be synced during initial sync.
 * Excludes special folders like [Gmail] parent folder.
 */
export function getSyncableFolders(folders: ImapFolder[]): ImapFolder[] {
  return folders.filter((f) => {
    const lowerPath = f.path.toLowerCase();
    // Skip the Gmail parent container folder
    if (lowerPath === "[gmail]" || lowerPath === "[google mail]") return false;
    // Skip Nostromo-style virtual folders
    if (lowerPath.startsWith("[nostromo]")) return false;
    // Skip virtual aggregate folders (\\All special-use): they contain every message
    // from every other folder and would duplicate the entire mailbox.
    if (f.special_use === "\\All") return false;
    // Also skip by well-known name for servers that don't report special-use attributes
    const lowerName = f.name.toLowerCase();
    if (
      FOLDER_NAME_MAP[lowerPath] === "\\All" ||
      FOLDER_NAME_MAP[lowerName] === "\\All"
    ) return false;
    return true;
  });
}
