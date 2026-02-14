import type { ImapConfig, ImapMessage } from "./tauriCommands";
import {
  imapListFolders,
  imapGetFolderStatus,
  imapFetchMessages,
  imapFetchNewUids,
} from "./tauriCommands";
import { buildImapConfig } from "./imapConfigBuilder";
import {
  mapFolderToLabel,
  getLabelsForMessage,
  syncFoldersToLabels,
  getSyncableFolders,
} from "./folderMapper";
import type { ParsedMessage, ParsedAttachment } from "../gmail/messageParser";
import type { SyncResult } from "../email/types";
import { upsertMessage } from "../db/messages";
import { upsertThread, setThreadLabels } from "../db/threads";
import { upsertAttachment } from "../db/attachments";
import { getAccount, updateAccountSyncState } from "../db/accounts";
import {
  upsertFolderSyncState,
  getAllFolderSyncStates,
} from "../db/folderSyncState";
import {
  buildThreads,
  type ThreadableMessage,
  type ThreadGroup,
} from "../threading/threadBuilder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

export interface ImapSyncProgress {
  phase: "folders" | "messages" | "threading" | "done";
  current: number;
  total: number;
  folder?: string;
}

export type ImapSyncProgressCallback = (progress: ImapSyncProgress) => void;

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

/**
 * Generate a synthetic Message-ID for messages that lack one.
 */
function syntheticMessageId(accountId: string, folder: string, uid: number): string {
  return `synthetic-${accountId}-${folder}-${uid}@velo.local`;
}

/**
 * Convert an ImapMessage (from Tauri backend) to the ParsedMessage format
 * used throughout the app.
 */
export function imapMessageToParsedMessage(
  msg: ImapMessage,
  accountId: string,
  folderLabelId: string,
): { parsed: ParsedMessage; threadable: ThreadableMessage } {
  const messageId = `imap-${accountId}-${msg.folder}-${msg.uid}`;
  const rfc2822MessageId =
    msg.message_id ?? syntheticMessageId(accountId, msg.folder, msg.uid);

  const folderMapping = { labelId: folderLabelId, labelName: "", type: "" };
  const labelIds = getLabelsForMessage(
    folderMapping,
    msg.is_read,
    msg.is_starred,
    msg.is_draft,
  );

  const snippet = msg.snippet ?? (msg.body_text ? msg.body_text.slice(0, 200) : "");

  const attachments: ParsedAttachment[] = msg.attachments.map((att) => ({
    filename: att.filename,
    mimeType: att.mime_type,
    size: att.size,
    gmailAttachmentId: att.part_id, // reuse field for IMAP part ID
    contentId: att.content_id,
    isInline: att.is_inline,
  }));

  const parsed: ParsedMessage = {
    id: messageId,
    threadId: "", // will be assigned after threading
    fromAddress: msg.from_address,
    fromName: msg.from_name,
    toAddresses: msg.to_addresses,
    ccAddresses: msg.cc_addresses,
    bccAddresses: msg.bcc_addresses,
    replyTo: msg.reply_to,
    subject: msg.subject,
    snippet,
    date: msg.date,
    isRead: msg.is_read,
    isStarred: msg.is_starred,
    bodyHtml: msg.body_html,
    bodyText: msg.body_text,
    rawSize: msg.raw_size,
    internalDate: msg.date,
    labelIds,
    hasAttachments: attachments.length > 0,
    attachments,
    listUnsubscribe: msg.list_unsubscribe,
    listUnsubscribePost: msg.list_unsubscribe_post,
    authResults: msg.auth_results,
  };

  const threadable: ThreadableMessage = {
    id: messageId,
    messageId: rfc2822MessageId,
    inReplyTo: msg.in_reply_to,
    references: msg.references,
    subject: msg.subject,
    date: msg.date,
  };

  return { parsed, threadable };
}

// ---------------------------------------------------------------------------
// Thread storage
// ---------------------------------------------------------------------------

/**
 * Store threads and their messages into the local DB.
 */
async function storeThreadsAndMessages(
  accountId: string,
  threadGroups: ThreadGroup[],
  parsedByLocalId: Map<string, ParsedMessage>,
  imapMsgByLocalId: Map<string, ImapMessage>,
): Promise<ParsedMessage[]> {
  const storedMessages: ParsedMessage[] = [];

  for (const group of threadGroups) {
    const messages = group.messageIds
      .map((id) => parsedByLocalId.get(id))
      .filter((m): m is ParsedMessage => m !== undefined);

    if (messages.length === 0) continue;

    // Assign threadId to each message
    for (const msg of messages) {
      msg.threadId = group.threadId;
    }

    // Sort by date ascending
    messages.sort((a, b) => a.date - b.date);

    const firstMessage = messages[0]!;
    const lastMessage = messages[messages.length - 1]!;

    // Collect all label IDs across messages in this thread
    const allLabelIds = new Set<string>();
    for (const msg of messages) {
      for (const lid of msg.labelIds) {
        allLabelIds.add(lid);
      }
    }

    const isRead = messages.every((m) => m.isRead);
    const isStarred = messages.some((m) => m.isStarred);
    const hasAttachments = messages.some((m) => m.hasAttachments);

    await upsertThread({
      id: group.threadId,
      accountId,
      subject: firstMessage.subject,
      snippet: lastMessage.snippet,
      lastMessageAt: lastMessage.date,
      messageCount: messages.length,
      isRead,
      isStarred,
      isImportant: false,
      hasAttachments,
    });

    await setThreadLabels(accountId, group.threadId, [...allLabelIds]);

    for (const parsed of messages) {
      const imapMsg = imapMsgByLocalId.get(parsed.id);

      await upsertMessage({
        id: parsed.id,
        accountId,
        threadId: parsed.threadId,
        fromAddress: parsed.fromAddress,
        fromName: parsed.fromName,
        toAddresses: parsed.toAddresses,
        ccAddresses: parsed.ccAddresses,
        bccAddresses: parsed.bccAddresses,
        replyTo: parsed.replyTo,
        subject: parsed.subject,
        snippet: parsed.snippet,
        date: parsed.date,
        isRead: parsed.isRead,
        isStarred: parsed.isStarred,
        bodyHtml: parsed.bodyHtml,
        bodyText: parsed.bodyText,
        rawSize: parsed.rawSize,
        internalDate: parsed.internalDate,
        listUnsubscribe: parsed.listUnsubscribe,
        listUnsubscribePost: parsed.listUnsubscribePost,
        authResults: parsed.authResults,
        messageIdHeader: imapMsg?.message_id ?? null,
        referencesHeader: imapMsg?.references ?? null,
        inReplyToHeader: imapMsg?.in_reply_to ?? null,
        imapUid: imapMsg?.uid ?? null,
        imapFolder: imapMsg?.folder ?? null,
      });

      // Store attachments
      for (const att of parsed.attachments) {
        await upsertAttachment({
          id: `${parsed.id}_${att.gmailAttachmentId}`,
          messageId: parsed.id,
          accountId,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          gmailAttachmentId: att.gmailAttachmentId,
          contentId: att.contentId,
          isInline: att.isInline,
        });
      }

      storedMessages.push(parsed);
    }
  }

  return storedMessages;
}

// ---------------------------------------------------------------------------
// Fetch messages from a folder in batches
// ---------------------------------------------------------------------------

/**
 * Generate UID range for initial sync.
 * Fetches UIDs from (uidnext - estimatedCount) to uidnext.
 * Uses the folder's `exists` count to estimate, capped by daysBack heuristic.
 */
function generateUidRange(uidnext: number, maxMessages: number): number[] {
  const startUid = Math.max(1, uidnext - maxMessages);
  const uids: number[] = [];
  for (let uid = startUid; uid < uidnext; uid++) {
    uids.push(uid);
  }
  return uids;
}

/**
 * Fetch messages from a folder in batches of BATCH_SIZE.
 */
async function fetchMessagesInBatches(
  config: ImapConfig,
  folder: string,
  uids: number[],
  onBatch?: (fetched: number, total: number) => void,
): Promise<{ messages: ImapMessage[]; lastUid: number; uidvalidity: number }> {
  const allMessages: ImapMessage[] = [];
  let lastUid = 0;
  let uidvalidity = 0;

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    const result = await imapFetchMessages(config, folder, batch);

    allMessages.push(...result.messages);
    uidvalidity = result.folder_status.uidvalidity;

    for (const msg of result.messages) {
      if (msg.uid > lastUid) lastUid = msg.uid;
    }

    onBatch?.(Math.min(i + BATCH_SIZE, uids.length), uids.length);
  }

  return { messages: allMessages, lastUid, uidvalidity };
}

// ---------------------------------------------------------------------------
// Initial sync
// ---------------------------------------------------------------------------

/**
 * Perform initial sync for an IMAP account.
 * Fetches messages from all folders for the past N days.
 */
export async function imapInitialSync(
  accountId: string,
  daysBack = 365,
  onProgress?: ImapSyncProgressCallback,
): Promise<SyncResult> {
  const account = await getAccount(accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const config = buildImapConfig(account);

  // Phase 1: List and sync folders
  onProgress?.({ phase: "folders", current: 0, total: 1 });
  const allFolders = await imapListFolders(config);
  const syncableFolders = getSyncableFolders(allFolders);
  await syncFoldersToLabels(accountId, syncableFolders);
  onProgress?.({ phase: "folders", current: 1, total: 1 });

  // Phase 2: Fetch messages from each folder
  const allParsed = new Map<string, ParsedMessage>();
  const allThreadable: ThreadableMessage[] = [];
  const allImapMsgs = new Map<string, ImapMessage>();

  // Estimate total messages for progress
  let totalEstimate = 0;
  const folderStatuses = new Map<string, { uidnext: number; exists: number; uidvalidity: number }>();

  for (const folder of syncableFolders) {
    try {
      const status = await imapGetFolderStatus(config, folder.path);
      folderStatuses.set(folder.path, {
        uidnext: status.uidnext,
        exists: status.exists,
        uidvalidity: status.uidvalidity,
      });
      totalEstimate += Math.min(status.exists, status.uidnext);
    } catch (err) {
      console.error(`Failed to get status for folder ${folder.path}:`, err);
    }
  }

  let fetchedTotal = 0;

  for (const folder of syncableFolders) {
    const status = folderStatuses.get(folder.path);
    if (!status || status.exists === 0) continue;

    const folderMapping = mapFolderToLabel(folder);

    try {
      // Generate UIDs to fetch — use the exists count but not more than
      // what's reasonable for daysBack. As a heuristic, we use exists count
      // directly (the server already limits by what's in the folder).
      const uidsToFetch = generateUidRange(status.uidnext, status.exists);

      if (uidsToFetch.length === 0) continue;

      const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
        config,
        folder.path,
        uidsToFetch,
        (fetched, _total) => {
          onProgress?.({
            phase: "messages",
            current: fetchedTotal + fetched,
            total: totalEstimate,
            folder: folder.path,
          });
        },
      );

      // Filter by date if daysBack is specified
      const cutoffDate = Math.floor(Date.now() / 1000) - daysBack * 86400;
      const filteredMessages = messages.filter((m) => m.date >= cutoffDate);

      for (const msg of filteredMessages) {
        const { parsed, threadable } = imapMessageToParsedMessage(
          msg,
          accountId,
          folderMapping.labelId,
        );
        // Deduplicate: same message may appear if copied across folders
        // Use message_id header for dedup when available
        allParsed.set(parsed.id, parsed);
        allThreadable.push(threadable);
        allImapMsgs.set(parsed.id, msg);
      }

      fetchedTotal += uidsToFetch.length;

      // Update folder sync state
      await upsertFolderSyncState({
        account_id: accountId,
        folder_path: folder.path,
        uidvalidity,
        last_uid: lastUid,
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error(`Failed to sync folder ${folder.path}:`, err);
      // Continue with next folder
    }
  }

  // Phase 3: Thread messages
  onProgress?.({ phase: "threading", current: 0, total: allThreadable.length });
  const threadGroups = buildThreads(allThreadable);

  // Phase 4: Store in DB
  const storedMessages = await storeThreadsAndMessages(
    accountId,
    threadGroups,
    allParsed,
    allImapMsgs,
  );

  // Mark initial sync as done by storing a sync token
  await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);

  onProgress?.({
    phase: "done",
    current: storedMessages.length,
    total: storedMessages.length,
  });

  return { messages: storedMessages };
}

// ---------------------------------------------------------------------------
// Delta sync
// ---------------------------------------------------------------------------

/**
 * Perform delta sync for an IMAP account.
 * Fetches only new messages since the last sync using stored UID state.
 */
export async function imapDeltaSync(accountId: string): Promise<SyncResult> {
  const account = await getAccount(accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const config = buildImapConfig(account);

  // Get all folders we've synced before
  const syncStates = await getAllFolderSyncStates(accountId);

  // Also check for any new folders
  const allFolders = await imapListFolders(config);
  const syncableFolders = getSyncableFolders(allFolders);
  await syncFoldersToLabels(accountId, syncableFolders);

  const syncStateMap = new Map(syncStates.map((s) => [s.folder_path, s]));

  const allParsed = new Map<string, ParsedMessage>();
  const allThreadable: ThreadableMessage[] = [];
  const allImapMsgs = new Map<string, ImapMessage>();

  for (const folder of syncableFolders) {
    const folderMapping = mapFolderToLabel(folder);
    const savedState = syncStateMap.get(folder.path);

    try {
      if (!savedState) {
        // New folder — do initial sync for it
        const status = await imapGetFolderStatus(config, folder.path);
        if (status.exists === 0) continue;

        const uidsToFetch = generateUidRange(status.uidnext, status.exists);
        if (uidsToFetch.length === 0) continue;

        const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
          config,
          folder.path,
          uidsToFetch,
        );

        for (const msg of messages) {
          const { parsed, threadable } = imapMessageToParsedMessage(
            msg,
            accountId,
            folderMapping.labelId,
          );
          allParsed.set(parsed.id, parsed);
          allThreadable.push(threadable);
          allImapMsgs.set(parsed.id, msg);
        }

        await upsertFolderSyncState({
          account_id: accountId,
          folder_path: folder.path,
          uidvalidity,
          last_uid: lastUid,
          modseq: null,
          last_sync_at: Math.floor(Date.now() / 1000),
        });
        continue;
      }

      // Check UIDVALIDITY — if changed, all cached UIDs are invalid
      const currentStatus = await imapGetFolderStatus(config, folder.path);

      if (
        savedState.uidvalidity !== null &&
        currentStatus.uidvalidity !== savedState.uidvalidity
      ) {
        // UIDVALIDITY changed — full resync of this folder
        console.warn(
          `UIDVALIDITY changed for folder ${folder.path} ` +
            `(was ${savedState.uidvalidity}, now ${currentStatus.uidvalidity}). ` +
            `Doing full resync of this folder.`,
        );
        const uidsToFetch = generateUidRange(
          currentStatus.uidnext,
          currentStatus.exists,
        );
        if (uidsToFetch.length === 0) continue;

        const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
          config,
          folder.path,
          uidsToFetch,
        );

        for (const msg of messages) {
          const { parsed, threadable } = imapMessageToParsedMessage(
            msg,
            accountId,
            folderMapping.labelId,
          );
          allParsed.set(parsed.id, parsed);
          allThreadable.push(threadable);
          allImapMsgs.set(parsed.id, msg);
        }

        await upsertFolderSyncState({
          account_id: accountId,
          folder_path: folder.path,
          uidvalidity,
          last_uid: lastUid,
          modseq: null,
          last_sync_at: Math.floor(Date.now() / 1000),
        });
        continue;
      }

      // Normal delta: fetch UIDs > last_uid
      const newUids = await imapFetchNewUids(config, folder.path, savedState.last_uid);

      if (newUids.length === 0) continue;

      const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
        config,
        folder.path,
        newUids,
      );

      for (const msg of messages) {
        const { parsed, threadable } = imapMessageToParsedMessage(
          msg,
          accountId,
          folderMapping.labelId,
        );
        allParsed.set(parsed.id, parsed);
        allThreadable.push(threadable);
        allImapMsgs.set(parsed.id, msg);
      }

      await upsertFolderSyncState({
        account_id: accountId,
        folder_path: folder.path,
        uidvalidity,
        last_uid: Math.max(savedState.last_uid, lastUid),
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error(`Delta sync failed for folder ${folder.path}:`, err);
      // Continue with next folder
    }
  }

  if (allThreadable.length === 0) {
    return { messages: [] };
  }

  // Thread the new messages
  const threadGroups = buildThreads(allThreadable);

  // Store in DB
  const storedMessages = await storeThreadsAndMessages(
    accountId,
    threadGroups,
    allParsed,
    allImapMsgs,
  );

  // Update sync state timestamp
  await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);

  return { messages: storedMessages };
}
