import type { ImapConfig, ImapSyncHeader, ImapThreadUpdate, DeltaCheckRequest, DeltaCheckResult } from "./tauriCommands";
import {
  imapListFolders,
  imapGetFolderStatus,
  imapFetchAndStore,
  imapStoreThreads,
  imapFetchNewUids,
  imapSearchFolder,
  imapSearchAllUids,
  imapDeltaCheck,
} from "./tauriCommands";
import { buildImapConfig } from "./imapConfigBuilder";
import {
  mapFolderToLabel,
  syncFoldersToLabels,
  getSyncableFolders,
} from "./folderMapper";
import type { ParsedMessage } from "../gmail/messageParser";
import type { SyncResult } from "../email/types";
import { deleteMessagesForFolder, purgeImapDuplicates } from "../db/messages";
import { getAccount, updateAccountSyncState } from "../db/accounts";
import {
  upsertFolderSyncState,
  getAllFolderSyncStates,
} from "../db/folderSyncState";
import { clearDeletedImapUidsForFolder } from "../db/deletedImapUids";
import {
  buildThreads,
  type ThreadableMessage,
  type ThreadGroup,
} from "../threading/threadBuilder";
import { getPendingOpResourceIds } from "../db/pendingOperations";
import { processThreadUrgency, type ThreadUrgencyParams } from "@/services/ai/urgencyPipeline";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Messages per IMAP fetch batch.
 * Each call to imap_fetch_and_store transmits only ~200 bytes per message back to
 * TypeScript regardless of body size — bodies go directly Rust → SQLite.
 */
const BATCH_SIZE = 25;
/**
 * How many delta sync cycles between expensive maintenance operations.
 * Every 10 cycles ≈ every ~10 minutes at the default 60 s interval.
 */
const MAINTENANCE_EVERY_N_CYCLES = 10;

/** Per-account delta sync cycle counters for throttling maintenance work. */
const _deltaSyncCycleCount = new Map<string, number>();

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_DELAY_MS = 15_000;
const CIRCUIT_BREAKER_MAX_FAILURES = 5;
const INTER_FOLDER_DELAY_MS = 1_000;

export function isConnectionError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("connection") ||
    msg.includes("tcp") ||
    msg.includes("tls") ||
    msg.includes("dns") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("socket")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// IMAP SINCE date helpers
// ---------------------------------------------------------------------------

const IMAP_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function formatImapDate(date: Date): string {
  const day = date.getUTCDate();
  const month = IMAP_MONTH_NAMES[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function computeSinceDate(daysBack: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysBack - 1);
  return formatImapDate(date);
}

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

export interface ImapSyncProgress {
  phase: "folders" | "messages" | "threading" | "storing_threads" | "done";
  current: number;
  total: number;
  folder?: string;
}

export type ImapSyncProgressCallback = (progress: ImapSyncProgress) => void;

// ---------------------------------------------------------------------------
// Threading helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ImapSyncHeader (already in DB) to a ThreadableMessage for JWZ.
 */
function headerToThreadable(h: ImapSyncHeader): ThreadableMessage {
  return {
    id: h.local_id,
    messageId: h.message_id ?? `synthetic-${h.local_id}@velo.local`,
    inReplyTo: h.in_reply_to,
    references: h.references,
    subject: h.subject,
    date: h.date * 1000,
  };
}

/**
 * Compute the final label set for a thread group given the member ImapSyncHeaders
 * and the cross-folder RFC-ID → labels accumulation map.
 */
function computeThreadLabels(
  messages: ImapSyncHeader[],
  labelsByRfcId: Map<string, Set<string>>,
): string[] {
  const allLabels = new Set<string>();
  for (const msg of messages) {
    // Primary folder label
    allLabels.add(msg.label_id);
    // Pseudo-labels
    if (!msg.is_read) allLabels.add("UNREAD");
    if (msg.is_starred) allLabels.add("STARRED");
    if (msg.is_draft) allLabels.add("DRAFT");
    // Cross-folder labels from duplicate copies (e.g., INBOX + SENT)
    if (msg.message_id) {
      const extra = labelsByRfcId.get(msg.message_id);
      if (extra) {
        const hasSent = extra.has("SENT");
        for (const lid of extra) {
          if (lid === "INBOX" && hasSent) continue; // suppress INBOX for sent messages
          allLabels.add(lid);
        }
      }
    }
  }
  return [...allLabels];
}

/**
 * Build ImapThreadUpdate records from thread groups and stored headers.
 * Called after JWZ threading to produce the payload for imap_store_threads.
 */
function buildThreadUpdates(
  threadGroups: ThreadGroup[],
  headerById: Map<string, ImapSyncHeader>,
  labelsByRfcId: Map<string, Set<string>>,
  skipThreadIds: Set<string>,
): { updates: ImapThreadUpdate[]; urgencyQueue: ThreadUrgencyParams[] } {
  const updates: ImapThreadUpdate[] = [];
  const urgencyQueue: ThreadUrgencyParams[] = [];

  for (const group of threadGroups) {
    if (skipThreadIds.has(group.threadId)) continue;

    const messages = group.messageIds
      .map((id) => headerById.get(id))
      .filter((h): h is ImapSyncHeader => h !== undefined && h.stored);

    if (messages.length === 0) continue;
    messages.sort((a, b) => a.date - b.date);

    const first = messages[0]!;
    const last = messages[messages.length - 1]!;

    const isRead = messages.every((m) => m.is_read);
    const isStarred = messages.some((m) => m.is_starred);
    const hasAttachments = messages.some((m) => m.has_attachments);
    const labelIds = computeThreadLabels(messages, labelsByRfcId);

    updates.push({
      thread_id: group.threadId,
      message_ids: group.messageIds,
      subject: first.subject,
      snippet: last.snippet,
      last_message_at: last.date * 1000,
      is_read: isRead,
      is_starred: isStarred,
      has_attachments: hasAttachments,
      label_ids: labelIds,
    });

    urgencyQueue.push({
      accountId: "", // filled in by caller
      threadId: group.threadId,
      subject: first.subject,
      bodyText: last.snippet,
      fromAddress: last.from_address,
      fromName: last.from_name,
      lastMessageAt: last.date * 1000,
      labelIds,
    });
  }

  return { updates, urgencyQueue };
}

// ---------------------------------------------------------------------------
// Deletion reconciliation
// ---------------------------------------------------------------------------

async function reconcileDeletedMessages(
  config: ImapConfig,
  accountId: string,
  folderPath: string,
): Promise<void> {
  const { getStoredImapUidsForFolder } = await import("../db/messages");
  const stored = await getStoredImapUidsForFolder(accountId, folderPath);
  if (stored.length === 0) return;

  let serverUids: number[];
  try {
    serverUids = await imapSearchAllUids(config, folderPath);
  } catch {
    return;
  }

  const serverSet = new Set(serverUids);
  const orphans = stored.filter((row) => !serverSet.has(row.uid));
  if (orphans.length === 0) return;

  console.log(`[imapSync] Reconciliation: removing ${orphans.length} message(s) deleted externally in ${folderPath}`);

  const orphanIds = orphans.map((o) => o.id);
  const { getDb } = await import("../db/connection");
  const db = await getDb();

  // Batch all deletes — 6 IPC calls total regardless of orphan count (was 4-5 × N)
  // Chunk to stay under SQLite's 999-variable limit
  const CHUNK = 500;
  for (let i = 0; i < orphanIds.length; i += CHUNK) {
    const chunk = orphanIds.slice(i, i + CHUNK);
    const ph = chunk.map((_, j) => `$${j + 2}`).join(",");

    // Collect thread IDs before deleting (needed for orphan-thread cleanup)
    const threadRows = await db.select<{ thread_id: string }[]>(
      `SELECT DISTINCT thread_id FROM messages WHERE account_id = $1 AND id IN (${ph})`,
      [accountId, ...chunk],
    );
    const affectedThreadIds = threadRows.map((r) => r.thread_id);

    await db.execute(
      `DELETE FROM message_embeddings WHERE account_id = $1 AND message_id IN (${ph})`,
      [accountId, ...chunk],
    );
    await db.execute(
      `DELETE FROM messages WHERE account_id = $1 AND id IN (${ph})`,
      [accountId, ...chunk],
    );

    // Delete thread_labels + threads where no messages remain
    if (affectedThreadIds.length > 0) {
      const tph = affectedThreadIds.map((_, j) => `$${j + 2}`).join(",");
      const surviving = await db.select<{ thread_id: string }[]>(
        `SELECT DISTINCT thread_id FROM messages WHERE account_id = $1 AND thread_id IN (${tph})`,
        [accountId, ...affectedThreadIds],
      );
      const survivingSet = new Set(surviving.map((r) => r.thread_id));
      const emptyThreadIds = affectedThreadIds.filter((id) => !survivingSet.has(id));

      if (emptyThreadIds.length > 0) {
        const eph = emptyThreadIds.map((_, j) => `$${j + 2}`).join(",");
        await db.execute(
          `DELETE FROM thread_labels WHERE account_id = $1 AND thread_id IN (${eph})`,
          [accountId, ...emptyThreadIds],
        );
        await db.execute(
          `DELETE FROM threads WHERE account_id = $1 AND id IN (${eph})`,
          [accountId, ...emptyThreadIds],
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Fetch + store in batches
// ---------------------------------------------------------------------------

/**
 * Fetch a batch of UIDs using imap_fetch_and_store.
 * Falls back to two half-batches on connection errors.
 */
async function fetchAndStoreWithRetry(
  config: ImapConfig,
  accountId: string,
  folder: string,
  labelId: string,
  uids: number[],
  cutoffDate: number,
): Promise<ImapSyncHeader[]> {
  try {
    return await imapFetchAndStore(config, accountId, folder, labelId, uids, cutoffDate);
  } catch (err) {
    if (!isConnectionError(err) || uids.length <= 1) throw err;

    const half = Math.ceil(uids.length / 2);
    console.warn(`[imapSync] FETCH failed for ${uids.length} UIDs in ${folder} — retrying as ${half}+${uids.length - half}`);
    await delay(2_000);

    const headers: ImapSyncHeader[] = [];
    for (const sub of [uids.slice(0, half), uids.slice(half)]) {
      try {
        const r = await imapFetchAndStore(config, accountId, folder, labelId, sub, cutoffDate);
        headers.push(...r);
      } catch (subErr) {
        console.warn(`[imapSync] Sub-batch FETCH failed for ${sub.length} UIDs in ${folder}, will retry next sync`);
      }
    }
    return headers;
  }
}

/**
 * Fetch and store all UIDs in BATCH_SIZE chunks.
 * Returns all ImapSyncHeaders (stored + skipped-duplicates) and the highest UID seen.
 */
async function fetchAllInBatches(
  config: ImapConfig,
  accountId: string,
  folder: string,
  labelId: string,
  uids: number[],
  cutoffDate: number,
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ headers: ImapSyncHeader[]; lastUid: number }> {
  const headers: ImapSyncHeader[] = [];
  let lastUid = 0;

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    const batchHeaders = await fetchAndStoreWithRetry(
      config, accountId, folder, labelId, batch, cutoffDate,
    );
    headers.push(...batchHeaders);
    for (const h of batchHeaders) {
      if (h.date > lastUid) lastUid = h.date; // date used as proxy; real lastUid below
    }
    // Actual lastUid: highest UID in the batch (not date)
    for (const uid of batch) {
      if (uid > lastUid) lastUid = uid;
    }
    onProgress?.(Math.min(i + BATCH_SIZE, uids.length), uids.length);
    // Small yield so other microtasks can run between batches
    await delay(0);
  }

  // Correct lastUid: it's the max UID from the original uids array
  lastUid = uids.length > 0 ? Math.max(...uids.slice(-1)) : 0;
  return { headers, lastUid };
}

// ---------------------------------------------------------------------------
// Initial sync
// ---------------------------------------------------------------------------

export async function imapInitialSync(
  accountId: string,
  daysBack = 365,
  onProgress?: ImapSyncProgressCallback,
): Promise<SyncResult> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const config = buildImapConfig(account);

  // Phase 1: List and sync folders
  onProgress?.({ phase: "folders", current: 0, total: 1 });
  let allFolders;
  try {
    allFolders = await imapListFolders(config);
  } catch (err) {
    console.error(`[imapSync] Failed to list folders:`, err);
    throw err;
  }

  const syncableFolders = getSyncableFolders(allFolders);
  await syncFoldersToLabels(accountId, syncableFolders);
  onProgress?.({ phase: "folders", current: 1, total: 1 });

  // ---------------------------------------------------------------------------
  // Phase 2: Fetch + store per folder
  // Each imap_fetch_and_store call: IMAP fetch + rusqlite write, returns ~200 B/msg.
  // Zero SQL plugin (WebKit IPC) calls during this phase.
  // ---------------------------------------------------------------------------

  const allHeaders: ImapSyncHeader[] = [];
  // RFC Message-ID → accumulated labels from all folders (for cross-folder merging)
  const labelsByRfcId = new Map<string, Set<string>>();

  let totalEstimate = syncableFolders.reduce((s, f) => s + f.exists, 0);
  let fetchedTotal = 0;
  let storedCount = 0;
  let consecutiveFailures = 0;
  const folderErrors: string[] = [];

  for (let folderIdx = 0; folderIdx < syncableFolders.length; folderIdx++) {
    const folder = syncableFolders[folderIdx]!;
    if (folder.exists === 0) continue;

    if (consecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES) {
      console.warn(`[imapSync] Circuit breaker: skipping remaining ${syncableFolders.length - folderIdx} folders`);
      break;
    }
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      await delay(CIRCUIT_BREAKER_DELAY_MS);
    }
    if (folderIdx > 0) await delay(INTER_FOLDER_DELAY_MS);

    const folderMapping = mapFolderToLabel(folder);

    try {
      let uidsToFetch: number[];
      let uidvalidity: number;

      if (daysBack > 0) {
        const sinceDate = computeSinceDate(daysBack);
        const searchResult = await imapSearchFolder(config, folder.raw_path, sinceDate);
        uidsToFetch = searchResult.uids;
        uidvalidity = searchResult.folder_status.uidvalidity;
      } else {
        const folderStatus = await imapGetFolderStatus(config, folder.raw_path);
        uidsToFetch = await imapSearchAllUids(config, folder.raw_path);
        uidvalidity = folderStatus.uidvalidity;
      }

      consecutiveFailures = 0;
      if (uidsToFetch.length === 0) continue;

      const cutoffDate = daysBack > 0 ? Math.floor(Date.now() / 1000) - daysBack * 86400 : 0;

      const { headers: folderHeaders, lastUid: folderLastUid } = await fetchAllInBatches(
        config,
        accountId,
        folder.raw_path,
        folderMapping.labelId,
        uidsToFetch,
        cutoffDate,
        (fetched) => {
          onProgress?.({
            phase: "messages",
            current: fetchedTotal + fetched,
            total: totalEstimate,
            folder: folder.path,
          });
        },
      );

      // Accumulate cross-folder label map from ALL headers (including skipped duplicates)
      for (const h of folderHeaders) {
        if (!h.message_id) continue;
        let labels = labelsByRfcId.get(h.message_id);
        if (!labels) { labels = new Set(); labelsByRfcId.set(h.message_id, labels); }
        labels.add(h.label_id);
        if (!h.is_read) labels.add("UNREAD");
        if (h.is_starred) labels.add("STARRED");
        if (h.is_draft) labels.add("DRAFT");
      }

      const folderStored = folderHeaders.filter((h) => h.stored).length;
      allHeaders.push(...folderHeaders);
      storedCount += folderStored;
      fetchedTotal += uidsToFetch.length;

      console.log(`[imapSync] Folder ${folder.path}: ${uidsToFetch.length} UIDs, ${folderStored} stored`);

      await upsertFolderSyncState({
        account_id: accountId,
        folder_path: folder.raw_path,
        uidvalidity,
        last_uid: folderLastUid,
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.error(`[imapSync] Failed to sync folder ${folder.path}:`, err);
      folderErrors.push(`${folder.path}: ${errMsg}`);
      if (isConnectionError(err)) consecutiveFailures++;
    }
  }

  if (storedCount === 0 && folderErrors.length > 0) {
    throw new Error(`All folders failed to sync: ${folderErrors[0]}`);
  }

  // ---------------------------------------------------------------------------
  // Phase 3: JWZ threading (pure in-memory — no DB reads)
  // ---------------------------------------------------------------------------
  onProgress?.({ phase: "threading", current: 0, total: allHeaders.length });

  const storedHeaders = allHeaders.filter((h) => h.stored);
  const allThreadable = storedHeaders.map(headerToThreadable);
  const threadGroups = buildThreads(allThreadable);

  console.log(`[imapSync] Threading: ${storedHeaders.length} messages → ${threadGroups.length} threads`);

  // ---------------------------------------------------------------------------
  // Phase 4: Store threads — one rusqlite transaction via imap_store_threads
  // ---------------------------------------------------------------------------
  onProgress?.({ phase: "storing_threads", current: 0, total: threadGroups.length });

  const headerById = new Map(allHeaders.map((h) => [h.local_id, h]));

  // One SQL plugin call to get ALL pending op resource IDs (replaces N per-thread calls)
  const pendingOpIds = await getPendingOpResourceIds(accountId);
  const skipThreadIds = new Set(threadGroups.map((g) => g.threadId).filter((id) => pendingOpIds.has(id)));

  const { updates, urgencyQueue } = buildThreadUpdates(
    threadGroups, headerById, labelsByRfcId, skipThreadIds,
  );

  const allLocalIds = storedHeaders.map((h) => h.local_id);
  await imapStoreThreads(accountId, updates, allLocalIds);

  onProgress?.({ phase: "storing_threads", current: threadGroups.length, total: threadGroups.length });

  // Fire urgency scoring outside of any DB lock
  for (const params of urgencyQueue) {
    processThreadUrgency({ ...params, accountId }).catch(() => {});
  }

  if (storedCount > 0) {
    await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);
  } else {
    console.warn(`[imapSync] Stored 0 messages — NOT marking sync complete so it will be retried`);
  }

  onProgress?.({ phase: "done", current: storedCount, total: storedCount });
  return { messages: [] };
}

// ---------------------------------------------------------------------------
// Delta sync
// ---------------------------------------------------------------------------

export async function imapDeltaSync(accountId: string, daysBack = 365): Promise<SyncResult> {
  const account = await getAccount(accountId);
  if (!account) throw new Error(`Account ${accountId} not found`);

  const config = buildImapConfig(account);
  const syncStates = await getAllFolderSyncStates(accountId);

  const cycleCount = (_deltaSyncCycleCount.get(accountId) ?? 0) + 1;
  _deltaSyncCycleCount.set(accountId, cycleCount);
  const isMaintenanceCycle = cycleCount % MAINTENANCE_EVERY_N_CYCLES === 1;

  let allFolders;
  if (isMaintenanceCycle || syncStates.length === 0) {
    allFolders = await imapListFolders(config);
    await syncFoldersToLabels(accountId, getSyncableFolders(allFolders));
  } else {
    allFolders = syncStates.map((s) => ({
      path: s.folder_path,
      raw_path: s.folder_path,
      name: s.folder_path.split("/").pop() ?? s.folder_path,
      delimiter: "/",
      special_use: null,
      exists: 0,
      unseen: 0,
    }));
  }
  const syncableFolders = getSyncableFolders(allFolders);

  if (isMaintenanceCycle) {
    const dupeCount = await purgeImapDuplicates(accountId).catch(() => 0);
    if (dupeCount > 0) console.log(`[imapSync] Purged ${dupeCount} duplicates for ${accountId}`);
  }

  const syncStateMap = new Map(syncStates.map((s) => [s.folder_path, s]));
  const newFolders = syncableFolders.filter((f) => !syncStateMap.has(f.raw_path));
  const existingFolders = syncableFolders.filter((f) => syncStateMap.has(f.raw_path));

  // All headers from new messages across all folders (stored + skipped duplicates)
  const allHeaders: ImapSyncHeader[] = [];
  const labelsByRfcId = new Map<string, Set<string>>();

  let consecutiveFailures = 0;
  const deltaFolderErrors: string[] = [];

  // ---- New folders ----
  for (const folder of newFolders) {
    if (consecutiveFailures >= CIRCUIT_BREAKER_MAX_FAILURES) break;
    if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) await delay(CIRCUIT_BREAKER_DELAY_MS);

    const folderMapping = mapFolderToLabel(folder);
    try {
      let uidsToFetch: number[];
      let uidvalidity: number;

      if (daysBack > 0) {
        const sinceDate = computeSinceDate(daysBack);
        const searchResult = await imapSearchFolder(config, folder.raw_path, sinceDate);
        uidsToFetch = searchResult.uids;
        uidvalidity = searchResult.folder_status.uidvalidity;
      } else {
        const folderStatus = await imapGetFolderStatus(config, folder.raw_path);
        uidsToFetch = await imapSearchAllUids(config, folder.raw_path);
        uidvalidity = folderStatus.uidvalidity;
      }
      consecutiveFailures = 0;
      if (uidsToFetch.length === 0) continue;

      const cutoffDate = daysBack > 0 ? Math.floor(Date.now() / 1000) - daysBack * 86400 : 0;
      const { headers, lastUid } = await fetchAllInBatches(
        config, accountId, folder.raw_path, folderMapping.labelId, uidsToFetch, cutoffDate,
      );

      _accumLabels(headers, labelsByRfcId);
      allHeaders.push(...headers);

      await upsertFolderSyncState({
        account_id: accountId,
        folder_path: folder.raw_path,
        uidvalidity,
        last_uid: lastUid,
        modseq: null,
        last_sync_at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.error(`Delta sync failed for new folder ${folder.path}:`, err);
      deltaFolderErrors.push(`${folder.path}: ${errMsg}`);
      if (isConnectionError(err)) consecutiveFailures++;
    }
  }

  // ---- Existing folders — batch delta check ----
  if (existingFolders.length > 0) {
    const deltaRequests: DeltaCheckRequest[] = existingFolders.map((folder) => {
      const savedState = syncStateMap.get(folder.raw_path)!;
      return {
        folder: folder.raw_path,
        last_uid: savedState.last_uid,
        uidvalidity: savedState.uidvalidity ?? 0,
        last_sync_at: savedState.last_sync_at ?? null,
      };
    });

    let deltaResultMap: Map<string, DeltaCheckResult>;
    try {
      const deltaResults = await imapDeltaCheck(config, deltaRequests);
      deltaResultMap = new Map(deltaResults.map((r) => [r.folder, r]));
    } catch (err) {
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
            let newUids = await imapFetchNewUids(config, folder.raw_path, savedState.last_uid);
            if (newUids.length === 0 && savedState.last_sync_at) {
              const sinceDate = formatImapDate(new Date((savedState.last_sync_at - 86_400) * 1000));
              const searchResult = await imapSearchFolder(config, folder.raw_path, sinceDate);
              newUids = searchResult.uids.filter((uid) => uid > savedState.last_uid);
            }
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
          console.warn(`UIDVALIDITY changed for ${folder.path} — purging and resyncing`);
          await deleteMessagesForFolder(accountId, folder.raw_path);
          await clearDeletedImapUidsForFolder(accountId, folder.raw_path).catch(() => {});

          let uidvalidityUids: number[];
          let uidvalidityVal: number;
          if (daysBack > 0) {
            const sinceDate = computeSinceDate(daysBack);
            const searchResult = await imapSearchFolder(config, folder.raw_path, sinceDate);
            uidvalidityUids = searchResult.uids;
            uidvalidityVal = searchResult.folder_status.uidvalidity;
          } else {
            const folderStatus = await imapGetFolderStatus(config, folder.raw_path);
            uidvalidityUids = await imapSearchAllUids(config, folder.raw_path);
            uidvalidityVal = folderStatus.uidvalidity;
          }
          if (uidvalidityUids.length > 0) {
            const cutoffDate = daysBack > 0 ? Math.floor(Date.now() / 1000) - daysBack * 86400 : 0;
            const { headers, lastUid } = await fetchAllInBatches(
              config, accountId, folder.raw_path, folderMapping.labelId, uidvalidityUids, cutoffDate,
            );
            _accumLabels(headers, labelsByRfcId);
            allHeaders.push(...headers);
            await upsertFolderSyncState({
              account_id: accountId,
              folder_path: folder.raw_path,
              uidvalidity: uidvalidityVal,
              last_uid: lastUid,
              modseq: null,
              last_sync_at: Math.floor(Date.now() / 1000),
            });
          }
          continue;
        }

        const uidsToFetch = deltaResult.new_uids;

        if (uidsToFetch.length === 0) {
          await upsertFolderSyncState({
            account_id: accountId,
            folder_path: folder.raw_path,
            uidvalidity: deltaResult.uidvalidity,
            last_uid: savedState.last_uid,
            modseq: null,
            last_sync_at: Math.floor(Date.now() / 1000),
          });
          if (isMaintenanceCycle) {
            await reconcileDeletedMessages(config, accountId, folder.raw_path);
          }
          continue;
        }

        const cutoffDate = 0; // delta sync: no date cutoff — fetch all new UIDs
        const { headers, lastUid } = await fetchAllInBatches(
          config, accountId, folder.raw_path, folderMapping.labelId, uidsToFetch, cutoffDate,
        );
        _accumLabels(headers, labelsByRfcId);
        allHeaders.push(...headers);

        await upsertFolderSyncState({
          account_id: accountId,
          folder_path: folder.raw_path,
          uidvalidity: deltaResult.uidvalidity,
          last_uid: Math.max(savedState.last_uid, lastUid),
          modseq: null,
          last_sync_at: Math.floor(Date.now() / 1000),
        });

        if (isMaintenanceCycle) {
          await reconcileDeletedMessages(config, accountId, folder.raw_path);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err ?? "Unknown error");
        console.error(`Delta sync failed for folder ${folder.path}:`, err);
        deltaFolderErrors.push(`${folder.path}: ${errMsg}`);
      }
    }
  }

  if (allHeaders.filter((h) => h.stored).length === 0 && deltaFolderErrors.length > 0) {
    throw new Error(`All folders failed to sync: ${deltaFolderErrors[0]}`);
  }

  const storedHeaders = allHeaders.filter((h) => h.stored);
  if (storedHeaders.length === 0) {
    return { messages: [], storedCount: 0 };
  }

  // JWZ threading
  const allThreadable = storedHeaders.map(headerToThreadable);
  const threadGroups = buildThreads(allThreadable);

  // Thread updates — one SQL plugin call for pending ops, then one Rust call for writes
  const headerById = new Map(allHeaders.map((h) => [h.local_id, h]));
  const pendingOpIds = await getPendingOpResourceIds(accountId);
  const skipThreadIds = new Set(threadGroups.map((g) => g.threadId).filter((id) => pendingOpIds.has(id)));

  const { updates, urgencyQueue } = buildThreadUpdates(
    threadGroups, headerById, labelsByRfcId, skipThreadIds,
  );

  const allLocalIds = storedHeaders.map((h) => h.local_id);
  await imapStoreThreads(accountId, updates, allLocalIds);

  for (const params of urgencyQueue) {
    processThreadUrgency({ ...params, accountId }).catch(() => {});
  }

  await updateAccountSyncState(accountId, `imap-synced-${Date.now()}`);

  return { messages: storedHeaders as unknown as ParsedMessage[], storedCount: storedHeaders.length };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Accumulate cross-folder label data from a batch of headers. */
function _accumLabels(
  headers: ImapSyncHeader[],
  labelsByRfcId: Map<string, Set<string>>,
): void {
  for (const h of headers) {
    if (!h.message_id) continue;
    let labels = labelsByRfcId.get(h.message_id);
    if (!labels) { labels = new Set(); labelsByRfcId.set(h.message_id, labels); }
    labels.add(h.label_id);
    if (!h.is_read) labels.add("UNREAD");
    if (h.is_starred) labels.add("STARRED");
    if (h.is_draft) labels.add("DRAFT");
  }
}
