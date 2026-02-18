import type { ImapConfig, ImapMessage, DeltaCheckRequest, DeltaCheckResult } from "./tauriCommands";
import {
  imapListFolders,
  imapGetFolderStatus,
  imapFetchMessages,
  imapFetchNewUids,
  imapSearchAllUids,
  imapDeltaCheck,
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
import { upsertMessage, updateMessageThreadIds } from "../db/messages";
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
import { getPendingOpsForResource } from "../db/pendingOperations";

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
    date: msg.date * 1000,
    isRead: msg.is_read,
    isStarred: msg.is_starred,
    bodyHtml: msg.body_html,
    bodyText: msg.body_text,
    rawSize: msg.raw_size,
    internalDate: msg.date * 1000,
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
    date: msg.date * 1000,
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
  labelsByRfcId?: Map<string, Set<string>>,
): Promise<ParsedMessage[]> {
  const storedMessages: ParsedMessage[] = [];

  for (const group of threadGroups) {
    const messages = group.messageIds
      .map((id) => parsedByLocalId.get(id))
      .filter((m): m is ParsedMessage => m !== undefined);

    if (messages.length === 0) continue;

    // Skip metadata overwrite for threads with pending local changes
    const pendingOps = await getPendingOpsForResource(accountId, group.threadId);
    if (pendingOps.length > 0) {
      console.log(`[imapSync] Skipping thread ${group.threadId}: has ${pendingOps.length} pending local ops`);
      continue;
    }

    // Assign threadId to each message
    for (const msg of messages) {
      msg.threadId = group.threadId;
    }

    // Sort by date ascending
    messages.sort((a, b) => a.date - b.date);

    const firstMessage = messages[0]!;
    const lastMessage = messages[messages.length - 1]!;

    // Collect all label IDs across messages in this thread.
    // Also include labels from duplicate folder copies (same RFC Message-ID
    // in multiple folders) that the threading algorithm may have deduplicated.
    const allLabelIds = new Set<string>();
    for (const msg of messages) {
      for (const lid of msg.labelIds) {
        allLabelIds.add(lid);
      }
      // Merge labels from all folder copies of this message
      const imapMsg = imapMsgByLocalId.get(msg.id);
      const rfcId = imapMsg?.message_id;
      if (rfcId && labelsByRfcId) {
        const extraLabels = labelsByRfcId.get(rfcId);
        if (extraLabels) {
          for (const lid of extraLabels) {
            allLabelIds.add(lid);
          }
        }
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

    const labelArray = [...allLabelIds];
    await setThreadLabels(accountId, group.threadId, labelArray);

    await Promise.all(messages.map(async (parsed) => {
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

      await Promise.all(parsed.attachments.map((att) =>
        upsertAttachment({
          id: `${parsed.id}_${att.gmailAttachmentId}`,
          messageId: parsed.id,
          accountId,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          gmailAttachmentId: att.gmailAttachmentId,
          contentId: att.contentId,
          isInline: att.isInline,
        }),
      ));

      storedMessages.push(parsed);
    }));
  }

  return storedMessages;
}

// ---------------------------------------------------------------------------
// Fetch messages from a folder in batches
// ---------------------------------------------------------------------------

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
  console.log(`[imapSync] Initial sync for account ${accountId}: ${syncableFolders.length} syncable folders`);
  onProgress?.({ phase: "folders", current: 1, total: 1 });

  // ---------------------------------------------------------------------------
  // Phase 2: Streaming fetch & store
  // ---------------------------------------------------------------------------
  // For each folder, for each batch: fetch → parse → store to DB immediately
  // (with placeholder threadId = messageId). Only lightweight metadata is kept
  // in memory for the subsequent threading pass.
  // This avoids accumulating all message bodies in memory (OOM on large mailboxes).

  interface MessageMeta {
    id: string;
    rfcMessageId: string;
    labelIds: string[];
    isRead: boolean;
    isStarred: boolean;
    hasAttachments: boolean;
    subject: string | null;
    snippet: string;
    date: number;
  }

  const allThreadable: ThreadableMessage[] = [];
  const allMeta = new Map<string, MessageMeta>();

  // Track RFC Message-ID → all label IDs from every folder copy.
  // This ensures labels aren't lost when the threading algorithm deduplicates
  // messages that exist in multiple IMAP folders (e.g., INBOX + Sent).
  const labelsByRfcId = new Map<string, Set<string>>();

  // Estimate total messages for progress
  let totalEstimate = 0;
  for (const folder of syncableFolders) {
    totalEstimate += folder.exists;
  }

  let fetchedTotal = 0;
  let totalMessagesFound = 0;
  let storedCount = 0;

  for (const folder of syncableFolders) {
    if (folder.exists === 0) continue;

    const folderMapping = mapFolderToLabel(folder);

    try {
      // Use UID SEARCH ALL to get real UIDs (avoids sparse UID gap problem)
      const uidsToFetch = await imapSearchAllUids(config, folder.raw_path);

      if (uidsToFetch.length === 0) continue;

      // Date filter config
      const cutoffDate = Math.floor(Date.now() / 1000) - daysBack * 86400;
      const nowSeconds = Math.floor(Date.now() / 1000);
      let dateFallbackCount = 0;
      let folderFetchedCount = 0;
      let folderStoredCount = 0;
      let lastUid = 0;
      let uidvalidity = 0;

      // Fetch and store in batches — message bodies are written to DB immediately
      // and NOT accumulated in memory
      for (let i = 0; i < uidsToFetch.length; i += BATCH_SIZE) {
        const batch = uidsToFetch.slice(i, i + BATCH_SIZE);
        const result = await imapFetchMessages(config, folder.raw_path, batch);

        uidvalidity = result.folder_status.uidvalidity;

        for (const msg of result.messages) {
          if (msg.uid > lastUid) lastUid = msg.uid;

          folderFetchedCount++;

          // Date filter
          if (msg.date === 0) {
            dateFallbackCount++;
            msg.date = nowSeconds;
          }
          if (msg.date < cutoffDate) continue;

          const { parsed, threadable } = imapMessageToParsedMessage(
            msg,
            accountId,
            folderMapping.labelId,
          );

          // Store message to DB immediately with placeholder threadId
          parsed.threadId = parsed.id;
          await upsertMessage({
            id: parsed.id,
            accountId,
            threadId: parsed.id, // placeholder — updated after threading
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
            messageIdHeader: msg.message_id ?? null,
            referencesHeader: msg.references ?? null,
            inReplyToHeader: msg.in_reply_to ?? null,
            imapUid: msg.uid ?? null,
            imapFolder: msg.folder ?? null,
          });

          // Store attachments
          await Promise.all(parsed.attachments.map((att) =>
            upsertAttachment({
              id: `${parsed.id}_${att.gmailAttachmentId}`,
              messageId: parsed.id,
              accountId,
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              gmailAttachmentId: att.gmailAttachmentId,
              contentId: att.contentId,
              isInline: att.isInline,
            }),
          ));

          folderStoredCount++;

          // Keep only lightweight data in memory for threading
          const meta: MessageMeta = {
            id: parsed.id,
            rfcMessageId: threadable.messageId,
            labelIds: parsed.labelIds,
            isRead: parsed.isRead,
            isStarred: parsed.isStarred,
            hasAttachments: parsed.hasAttachments,
            subject: parsed.subject,
            snippet: parsed.snippet,
            date: parsed.date,
          };
          allMeta.set(parsed.id, meta);
          allThreadable.push(threadable);

          // Build cross-folder label map
          let labels = labelsByRfcId.get(threadable.messageId);
          if (!labels) {
            labels = new Set();
            labelsByRfcId.set(threadable.messageId, labels);
          }
          for (const lid of parsed.labelIds) {
            labels.add(lid);
          }

          // parsed + msg (with bodies) go out of scope after this iteration → GC can reclaim
        }

        onProgress?.({
          phase: "messages",
          current: fetchedTotal + Math.min(i + BATCH_SIZE, uidsToFetch.length),
          total: totalEstimate,
          folder: folder.path,
        });
      }

      totalMessagesFound += folderFetchedCount;
      storedCount += folderStoredCount;
      fetchedTotal += uidsToFetch.length;

      if (dateFallbackCount > 0) {
        console.warn(
          `[imapSync] Folder ${folder.path}: ${dateFallbackCount}/${folderFetchedCount} messages had unparseable dates, using current time as fallback`,
        );
      }

      console.log(
        `[imapSync] Folder ${folder.path}: ${uidsToFetch.length} UIDs, ${folderFetchedCount} fetched, ${folderStoredCount} after date filter`,
      );

      // Update folder sync state
      await upsertFolderSyncState({
        account_id: accountId,
        folder_path: folder.raw_path,
        uidvalidity,
        last_uid: lastUid,
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error(`[imapSync] Failed to sync folder ${folder.path}:`, err);
      // Continue with next folder
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 3: Thread messages (lightweight — only IDs + headers in memory)
  // ---------------------------------------------------------------------------
  onProgress?.({ phase: "threading", current: 0, total: allThreadable.length });
  const threadGroups = buildThreads(allThreadable);
  console.log(
    `[imapSync] Threading: ${allThreadable.length} messages → ${threadGroups.length} thread groups`,
  );

  // ---------------------------------------------------------------------------
  // Phase 4: Create thread records + batch-update message thread IDs
  // ---------------------------------------------------------------------------
  for (const group of threadGroups) {
    const messages = group.messageIds
      .map((id) => allMeta.get(id))
      .filter((m): m is MessageMeta => m !== undefined);

    if (messages.length === 0) continue;

    // Skip threads with pending local changes
    const pendingOps = await getPendingOpsForResource(accountId, group.threadId);
    if (pendingOps.length > 0) {
      console.log(`[imapSync] Skipping thread ${group.threadId}: has ${pendingOps.length} pending local ops`);
      continue;
    }

    // Sort by date ascending
    messages.sort((a, b) => a.date - b.date);

    const firstMessage = messages[0]!;
    const lastMessage = messages[messages.length - 1]!;

    // Collect all label IDs including cross-folder copies
    const allLabelIds = new Set<string>();
    for (const msg of messages) {
      for (const lid of msg.labelIds) {
        allLabelIds.add(lid);
      }
      const extraLabels = labelsByRfcId.get(msg.rfcMessageId);
      if (extraLabels) {
        for (const lid of extraLabels) {
          allLabelIds.add(lid);
        }
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

    // Batch-update thread IDs for all messages in this thread
    const messageIds = messages.map((m) => m.id);
    await updateMessageThreadIds(accountId, messageIds, group.threadId);
  }

  console.log(
    `[imapSync] Stored ${storedCount} messages in ${threadGroups.length} threads (found ${totalMessagesFound} on server)`,
  );

  // Only mark sync as complete if messages were stored OR no messages exist on server.
  if (storedCount > 0 || totalMessagesFound === 0) {
    await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);
  } else {
    console.warn(
      `[imapSync] Found ${totalMessagesFound} messages on server but stored 0 — NOT marking sync as complete so it will be retried`,
    );
  }

  onProgress?.({
    phase: "done",
    current: storedCount,
    total: storedCount,
  });

  return { messages: [] };
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

  // Separate folders into new (no saved state) vs existing (have saved state)
  const newFolders = syncableFolders.filter((f) => !syncStateMap.has(f.raw_path));
  const existingFolders = syncableFolders.filter((f) => syncStateMap.has(f.raw_path));

  // Handle new folders individually (need full UID SEARCH ALL)
  for (const folder of newFolders) {
    const folderMapping = mapFolderToLabel(folder);
    try {
      const uidsToFetch = await imapSearchAllUids(config, folder.raw_path);
      if (uidsToFetch.length === 0) continue;

      const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
        config,
        folder.raw_path,
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
        folder_path: folder.raw_path,
        uidvalidity,
        last_uid: lastUid,
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.error(`Delta sync failed for new folder ${folder.path}:`, err);
    }
  }

  // Batch-check existing folders in a single IMAP connection.
  // Falls back to per-folder checks if the batch command fails.
  if (existingFolders.length > 0) {
    const deltaRequests: DeltaCheckRequest[] = existingFolders.map((folder) => {
      const savedState = syncStateMap.get(folder.raw_path)!;
      return {
        folder: folder.raw_path,
        last_uid: savedState.last_uid,
        uidvalidity: savedState.uidvalidity ?? 0,
      };
    });

    let deltaResultMap: Map<string, DeltaCheckResult>;
    try {
      const deltaResults = await imapDeltaCheck(config, deltaRequests);
      deltaResultMap = new Map(deltaResults.map((r) => [r.folder, r]));
      console.log(`[imapSync] Batch delta check: ${deltaResults.length}/${existingFolders.length} folders checked`);
    } catch (err) {
      // Batch check failed — fall back to per-folder checks
      console.warn(`[imapSync] Batch delta check failed, falling back to per-folder:`, err);
      deltaResultMap = new Map();
      for (const folder of existingFolders) {
        const savedState = syncStateMap.get(folder.raw_path)!;
        try {
          const currentStatus = await imapGetFolderStatus(config, folder.raw_path);
          const uidvalidityChanged =
            savedState.uidvalidity !== null &&
            currentStatus.uidvalidity !== savedState.uidvalidity;

          if (uidvalidityChanged) {
            deltaResultMap.set(folder.raw_path, {
              folder: folder.raw_path,
              uidvalidity: currentStatus.uidvalidity,
              new_uids: [],
              uidvalidity_changed: true,
            });
          } else {
            const newUids = await imapFetchNewUids(config, folder.raw_path, savedState.last_uid);
            deltaResultMap.set(folder.raw_path, {
              folder: folder.raw_path,
              uidvalidity: currentStatus.uidvalidity,
              new_uids: newUids,
              uidvalidity_changed: false,
            });
          }
        } catch (folderErr) {
          console.error(`[imapSync] Per-folder check failed for ${folder.path}:`, folderErr);
        }
      }
    }

    for (const folder of existingFolders) {
      const folderMapping = mapFolderToLabel(folder);
      const savedState = syncStateMap.get(folder.raw_path)!;
      const deltaResult = deltaResultMap.get(folder.raw_path);

      if (!deltaResult) continue;

      try {
        if (deltaResult.uidvalidity_changed) {
          // UIDVALIDITY changed — full resync of this folder
          console.warn(
            `UIDVALIDITY changed for folder ${folder.path} ` +
              `(was ${savedState.uidvalidity}, now ${deltaResult.uidvalidity}). ` +
              `Doing full resync of this folder.`,
          );
          const uidsToFetch = await imapSearchAllUids(config, folder.raw_path);
          if (uidsToFetch.length === 0) continue;

          const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
            config,
            folder.raw_path,
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
            folder_path: folder.raw_path,
            uidvalidity,
            last_uid: lastUid,
            modseq: null,
            last_sync_at: Math.floor(Date.now() / 1000),
          });
          continue;
        }

        // Normal delta: fetch the new UIDs returned by delta check
        if (deltaResult.new_uids.length === 0) continue;

        const { messages, lastUid, uidvalidity } = await fetchMessagesInBatches(
          config,
          folder.raw_path,
          deltaResult.new_uids,
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
          folder_path: folder.raw_path,
          uidvalidity,
          last_uid: Math.max(savedState.last_uid, lastUid),
          modseq: null,
          last_sync_at: Math.floor(Date.now() / 1000),
        });
      } catch (err) {
        console.error(`Delta sync failed for folder ${folder.path}:`, err);
      }
    }
  }

  if (allThreadable.length === 0) {
    return { messages: [] };
  }

  // Build RFC Message-ID → labels map for cross-folder label merging
  const labelsByRfcId = new Map<string, Set<string>>();
  for (const threadable of allThreadable) {
    const parsed = allParsed.get(threadable.id);
    if (!parsed) continue;
    let labels = labelsByRfcId.get(threadable.messageId);
    if (!labels) {
      labels = new Set();
      labelsByRfcId.set(threadable.messageId, labels);
    }
    for (const lid of parsed.labelIds) {
      labels.add(lid);
    }
  }

  // Thread the new messages
  const threadGroups = buildThreads(allThreadable);

  // Store in DB
  const storedMessages = await storeThreadsAndMessages(
    accountId,
    threadGroups,
    allParsed,
    allImapMsgs,
    labelsByRfcId,
  );

  // Update sync state timestamp
  await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);

  return { messages: storedMessages };
}
