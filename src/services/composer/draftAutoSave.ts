import { useComposerStore } from "@/stores/composerStore";
import { tombstoneImapDraft } from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { useAccountStore } from "@/stores/accountStore";
import { getSetting, setSetting, deleteSetting } from "@/services/db/settings";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let localDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let serverDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let currentAccountId: string | null = null;
let isDiscarding = false;
let isSaveLocalInFlight = false;
let isSaveServerInFlight = false;
let serverSavePromise: Promise<void> | null = null;
let openTime: number = 0;
let lastPersistenceKey: string | null = null;

// IMAP two-tier: tracks the currently-appended server UID.
// Null means no server draft exists yet (or this is a Gmail account).
let currentServerUid: number | null = null;
let currentServerFolder: string | null = null;

// Whether the current account uses IMAP (vs Gmail API).
// Set once in startAutoSave and reset in stopAutoSave.
let isImap = false;

// Draft that was APPENDed to the IMAP server and pre-tombstoned (local DB cleaned)
// but never EXPUNGEd, because isDiscarding was true when saveServer() completed.
// Composer reads this after waitForSave() and schedules the server EXPUNGE.
let preTombstonedDraftId: string | null = null;

const LOCAL_DEBOUNCE_MS = 3000;
const SERVER_DEBOUNCE_MS = 18000; // 18 seconds
const OPEN_COOLDOWN_MS = 2000;

// ---------------------------------------------------------------------------
// Public getters for Composer.tsx
// ---------------------------------------------------------------------------

/**
 * Returns a draft ID that was APPENDed to the IMAP server and pre-tombstoned
 * (local DB cleaned) while discarding, but never EXPUNGEd from the server.
 * Composer reads this after waitForSave() to issue the server EXPUNGE.
 * Resets to null on the next startAutoSave() call.
 */
export function getPreTombstonedDraftId(): string | null {
  return preTombstonedDraftId;
}

/**
 * Returns the IMAP UID-based draft ID of the current server-side draft,
 * or null if no server draft has been appended yet (IMAP) or not applicable (Gmail).
 * The composer window uses this to tombstone the server draft before closing.
 */
export function getServerDraftId(): string | null {
  if (!currentAccountId || currentServerUid === null || !currentServerFolder) return null;
  return `imap-${currentAccountId}-${currentServerFolder}-${currentServerUid}`;
}

/**
 * Returns the active draft ID to use for cleanup on send/discard:
 * - IMAP: the server UID-based ID (if a server draft exists)
 * - Gmail: composerStore.draftId (the Gmail draft API ID)
 */
export function getActiveDraftId(): string | null {
  const serverDraftId = getServerDraftId();
  if (serverDraftId) return serverDraftId;
  return useComposerStore.getState().draftId;
}

/** Returns true while a discard is in progress. */
export function getIsDiscarding(): boolean {
  return isDiscarding;
}

// ---------------------------------------------------------------------------
// IMAP Tier 1: local SQLite UPSERT (stable UUID)
// ---------------------------------------------------------------------------

async function saveLocal(): Promise<void> {
  if (isDiscarding || isSaveLocalInFlight) return;
  if (openTime && Date.now() - openTime < OPEN_COOLDOWN_MS) return;

  isSaveLocalInFlight = true;
  const state = useComposerStore.getState();
  const accountId = currentAccountId;
  const localId = state.localDraftId;

  try {
    if (!state.isOpen || !accountId || !localId || !state.bodyHtml) return;

    const accounts = useAccountStore.getState().accounts;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    state.setIsSaving(true);

    const now = Date.now();
    // For new drafts, use localId as the thread ID so the thread is stable too.
    const effectiveThreadId = state.threadId ?? localId;

    const [
      { upsertMessage },
      { upsertThread, getThreadLabelIds, setThreadLabels },
    ] = await Promise.all([
      import("@/services/db/messages"),
      import("@/services/db/threads"),
    ]);

    // For reply drafts the original thread already exists — don't modify it
    // (keeps is_read, snippet, messageCount and sort position intact).
    // For brand-new drafts create the thread row, always read (you authored it).
    if (!state.threadId) {
      await upsertThread({
        id: effectiveThreadId,
        accountId,
        subject: state.subject || null,
        snippet: "",
        lastMessageAt: now,
        messageCount: 1,
        isRead: true,
        isStarred: false,
        isImportant: false,
        hasAttachments: state.attachments.length > 0,
      });
    }

    const existingLabels = await getThreadLabelIds(accountId, effectiveThreadId);
    if (!existingLabels.includes("DRAFT")) {
      await setThreadLabels(accountId, effectiveThreadId, [...existingLabels, "DRAFT"]);
    }

    // UPSERT the stable UUID row — always the same row for this composer session
    await upsertMessage({
      id: localId,
      accountId,
      threadId: effectiveThreadId,
      fromAddress: account.email,
      fromName: account.displayName ?? null,
      toAddresses: state.to.join(", ") || "",
      ccAddresses: state.cc.length > 0 ? state.cc.join(", ") : null,
      bccAddresses: null,
      replyTo: null,
      subject: state.subject || null,
      snippet: "",
      date: now,
      isRead: false,
      isStarred: false,
      bodyHtml: state.bodyHtml.slice(0, 50000),
      bodyText: null,
      rawSize: state.bodyHtml.length,
      internalDate: now,
      isDraft: true,
      // Mirror any existing server coords so resolveGrouped can find the draft by UID
      imapUid: currentServerUid ?? undefined,
      imapFolder: currentServerFolder ?? undefined,
    });

    // If a server-side draft existed before this session (opening existing draft),
    // the old UID-based row must be removed so the user sees no duplicates.
    if (currentServerUid !== null && currentServerFolder !== null) {
      const oldDraftId = `imap-${accountId}-${currentServerFolder}-${currentServerUid}`;
      if (oldDraftId !== localId) {
        const { getDb } = await import("@/services/db/connection");
        const db = await getDb();
        await db.execute(
          "DELETE FROM message_embeddings WHERE account_id=$1 AND message_id=$2",
          [accountId, oldDraftId],
        );
        await db.execute(
          "DELETE FROM messages WHERE account_id=$1 AND id=$2",
          [accountId, oldDraftId],
        );
      }
    }

    // Pin the thread ID in store for new-draft sessions
    if (!state.threadId && !isDiscarding) {
      useComposerStore.setState({ threadId: localId });
    }

    if (!isDiscarding) {
      state.setLastSavedAt(Date.now());
      const key = `v_draft_${accountId}_${state.threadId ?? localId}`;
      lastPersistenceKey = key;
      await setSetting(key, localId);
    }
  } catch (err) {
    console.error("[draftAutoSave] Local save failed:", err);
  } finally {
    isSaveLocalInFlight = false;
    state.setIsSaving(false);
  }
}

// ---------------------------------------------------------------------------
// IMAP Tier 2: server APPEND (heavy debounce)
// ---------------------------------------------------------------------------

async function saveServer(): Promise<void> {
  if (isDiscarding || isSaveServerInFlight) return;

  const accountId = currentAccountId;
  const state = useComposerStore.getState();
  const localId = state.localDraftId;

  if (!state.isOpen || !accountId || !localId || !state.bodyHtml) return;

  isSaveServerInFlight = true;

  try {
    let htmlBody = state.bodyHtml;
    if (state.quotedHtml) htmlBody = `${htmlBody}${state.quotedHtml}`;

    const accounts = useAccountStore.getState().accounts;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    const raw = buildRawEmail({
      from: account.email,
      to: state.to.length > 0 ? state.to : [""],
      subject: state.subject,
      htmlBody,
      threadId: state.threadId ?? undefined,
      attachments:
        state.attachments.length > 0
          ? state.attachments.map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              content: a.content,
            }))
          : undefined,
    });

    const { getEmailProvider } = await import("@/services/email/providerFactory");
    const provider = await getEmailProvider(accountId);

    // Use localId as thread so the provider attaches the server draft to the same thread
    const effectiveThreadId = state.threadId ?? localId;
    const currentSrvId = getServerDraftId();

    let newDraftId: string;
    if (currentSrvId === null) {
      const result = await provider.createDraft(raw, effectiveThreadId);
      newDraftId = result.draftId;
    } else {
      const result = await provider.updateDraft(currentSrvId, raw, effectiveThreadId);
      newDraftId = result.draftId;
    }

    // If a discard arrived while the IMAP APPEND was in-flight, pre-tombstone the new UID.
    // Record the draft ID so Composer can EXPUNGE it from the server after waitForSave().
    if (isDiscarding) {
      await tombstoneImapDraft(accountId, newDraftId).catch(() => {});
      preTombstonedDraftId = newDraftId;
      return;
    }

    // Parse new UID from the returned draftId ("imap-{accountId}-{folder}-{uid}")
    const prefix = `imap-${accountId}-`;
    if (newDraftId.startsWith(prefix)) {
      const remainder = newDraftId.slice(prefix.length);
      const lastDash = remainder.lastIndexOf("-");
      if (lastDash !== -1) {
        const folder = remainder.slice(0, lastDash);
        const uid = parseInt(remainder.slice(lastDash + 1), 10);
        if (folder && !isNaN(uid)) {
          const { getDb } = await import("@/services/db/connection");
          const db = await getDb();

          // Delete the UID-based row created by provider.saveDraftLocally
          // (we keep only the stable UUID row)
          await db.execute(
            "DELETE FROM message_embeddings WHERE account_id=$1 AND message_id=$2",
            [accountId, newDraftId],
          );
          await db.execute(
            "DELETE FROM messages WHERE account_id=$1 AND id=$2",
            [accountId, newDraftId],
          );

          // Stamp the stable UUID row with the fresh server coordinates
          await db.execute(
            "UPDATE messages SET imap_uid=$1, imap_folder=$2 WHERE account_id=$3 AND id=$4",
            [uid, folder, accountId, localId],
          );

          currentServerUid = uid;
          currentServerFolder = folder;
        }
      }
    }
  } catch (err) {
    console.error("[draftAutoSave] Server save failed:", err);
  } finally {
    isSaveServerInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Gmail path (unchanged from previous architecture)
// ---------------------------------------------------------------------------

async function saveGmail(): Promise<void> {
  if (isDiscarding || isSaveLocalInFlight) return;
  if (openTime && Date.now() - openTime < OPEN_COOLDOWN_MS) return;

  isSaveLocalInFlight = true;
  const state = useComposerStore.getState();
  const accountId = currentAccountId;

  try {
    if (!state.isOpen || !accountId) return;

    const accounts = useAccountStore.getState().accounts;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    if (!state.bodyHtml) return;
    if (isDiscarding) return;

    state.setIsSaving(true);

    let htmlBody = state.bodyHtml;
    if (state.quotedHtml) htmlBody = `${htmlBody}${state.quotedHtml}`;

    const raw = buildRawEmail({
      from: account.email,
      to: state.to.length > 0 ? state.to : [""],
      subject: state.subject,
      htmlBody,
      threadId: state.threadId ?? undefined,
      attachments:
        state.attachments.length > 0
          ? state.attachments.map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              content: a.content,
            }))
          : undefined,
    });

    const { createDraft: createDraftAction, updateDraft: updateDraftAction } =
      await import("@/services/emailActions");

    const key = getPersistenceKey(accountId);
    lastPersistenceKey = key;

    if (state.draftId) {
      if (isDiscarding) return;
      const oldDraftId = state.draftId;
      const result = await updateDraftAction(accountId, oldDraftId, raw, state.threadId ?? undefined);
      if (result.data && typeof result.data === "object" && "draftId" in result.data) {
        const data = result.data as { draftId: string; threadId?: string };
        if (data.draftId !== oldDraftId) {
          state.setDraftId(data.draftId);
          if (!isDiscarding) {
            await setSetting(key, data.draftId);
          }
        }
      }
    } else {
      const persistedId = await getSetting(key);
      if (persistedId) {
        try {
          if (isDiscarding) return;
          const result = await updateDraftAction(accountId, persistedId, raw, state.threadId ?? undefined);
          if (result.data && typeof result.data === "object" && "draftId" in result.data) {
            const data = result.data as { draftId: string; threadId?: string };
            state.setDraftId(data.draftId);
            if (!isDiscarding) {
              await setSetting(key, data.draftId);
              if (data.threadId && !state.threadId) {
                useComposerStore.setState({ threadId: data.threadId });
              }
            }
          } else if (!isDiscarding) {
            state.setDraftId(persistedId);
          }
        } catch {
          if (isDiscarding) return;
          const result = await createDraftAction(accountId, raw, state.threadId ?? undefined);
          if (result.data && typeof result.data === "object" && "draftId" in result.data) {
            const data = result.data as { draftId: string; threadId?: string };
            state.setDraftId(data.draftId);
            if (!isDiscarding) {
              await setSetting(key, data.draftId);
              if (data.threadId && !state.threadId) {
                useComposerStore.setState({ threadId: data.threadId });
              }
            }
          }
        }
      } else {
        if (isDiscarding) return;
        const result = await createDraftAction(accountId, raw, state.threadId ?? undefined);
        if (result.data && typeof result.data === "object" && "draftId" in result.data) {
          const data = result.data as { draftId: string; threadId?: string };
          state.setDraftId(data.draftId);
          if (!isDiscarding) {
            await setSetting(key, data.draftId);
            if (data.threadId && !state.threadId) {
              useComposerStore.setState({ threadId: data.threadId });
            }
          }
        }
      }
    }

    if (!isDiscarding) state.setLastSavedAt(Date.now());
  } catch (err) {
    console.error("[draftAutoSave] Gmail save failed:", err);
  } finally {
    isSaveLocalInFlight = false;
    state.setIsSaving(false);
  }
}

function getPersistenceKey(accountId: string): string {
  const state = useComposerStore.getState();
  return `v_draft_${accountId}_${state.threadId ?? "new"}`;
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

function scheduleLocalSave(): void {
  if (localDebounceTimer) clearTimeout(localDebounceTimer);
  localDebounceTimer = setTimeout(() => {
    localDebounceTimer = null;
    if (!isSaveLocalInFlight) {
      void saveLocal();
    }
  }, LOCAL_DEBOUNCE_MS);
}

function scheduleServerSave(): void {
  if (serverDebounceTimer) clearTimeout(serverDebounceTimer);
  serverDebounceTimer = setTimeout(() => {
    serverDebounceTimer = null;
    if (!isSaveServerInFlight) {
      serverSavePromise = saveServer().finally(() => {
        serverSavePromise = null;
      });
    }
  }, SERVER_DEBOUNCE_MS);
}

function scheduleGmailSave(): void {
  if (localDebounceTimer) clearTimeout(localDebounceTimer);
  localDebounceTimer = setTimeout(() => {
    localDebounceTimer = null;
    if (!isSaveLocalInFlight) {
      serverSavePromise = saveGmail().finally(() => {
        serverSavePromise = null;
      });
    }
  }, LOCAL_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Save the draft immediately, cancelling any pending debounces.
 * Call this before stopAutoSave so currentAccountId is still set.
 */
export async function saveNow(): Promise<void> {
  if (localDebounceTimer) {
    clearTimeout(localDebounceTimer);
    localDebounceTimer = null;
  }
  if (serverDebounceTimer) {
    clearTimeout(serverDebounceTimer);
    serverDebounceTimer = null;
  }
  if (isImap) {
    await saveLocal();
    await saveServer();
  } else {
    await saveGmail();
  }
}

/**
 * Signal that the composer is being discarded. Stops all timers and the
 * Zustand subscription immediately so no new saves are triggered.
 * The in-flight server save (if any) will see isDiscarding=true and
 * pre-tombstone the new UID instead of committing it.
 */
export function startDiscard(): void {
  isDiscarding = true;
  if (localDebounceTimer) {
    clearTimeout(localDebounceTimer);
    localDebounceTimer = null;
  }
  if (serverDebounceTimer) {
    clearTimeout(serverDebounceTimer);
    serverDebounceTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Wait for any in-flight server save to finish.
 * Call after startDiscard() so the save sees isDiscarding=true and
 * pre-tombstones any newly appended IMAP UID before returning.
 */
export async function waitForSave(): Promise<void> {
  if (serverSavePromise) await serverSavePromise;
}

/**
 * Delete a locally-stored IMAP draft row (stable UUID) when the user discards
 * before the 18-second server debounce fires (so no server draft exists yet).
 * Also cleans up the thread if no other messages remain.
 */
export async function deleteLocalImapDraft(
  accountId: string,
  localDraftId: string,
): Promise<void> {
  try {
    const { getDb } = await import("@/services/db/connection");
    const db = await getDb();
    const rows = await db.select<{ thread_id: string }[]>(
      "SELECT thread_id FROM messages WHERE account_id=$1 AND id=$2",
      [accountId, localDraftId],
    );
    if (rows.length === 0) return;
    const threadId = rows[0]!.thread_id;

    await db.execute(
      "DELETE FROM messages WHERE account_id=$1 AND id=$2",
      [accountId, localDraftId],
    );

    const remaining = await db.select<{ id: string }[]>(
      "SELECT id FROM messages WHERE account_id=$1 AND thread_id=$2 LIMIT 1",
      [accountId, threadId],
    );
    if (remaining.length === 0) {
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id=$1 AND thread_id=$2",
        [accountId, threadId],
      );
      await db.execute(
        "DELETE FROM threads WHERE account_id=$1 AND id=$2",
        [accountId, threadId],
      );
    } else {
      // Reply draft: keep the original thread messages, just remove DRAFT label
      await db.execute(
        "DELETE FROM thread_labels WHERE account_id=$1 AND thread_id=$2 AND label_id='DRAFT'",
        [accountId, threadId],
      );
    }
  } catch (err) {
    console.warn("[draftAutoSave] deleteLocalImapDraft failed:", err);
  }
}

/**
 * Start watching composerStore changes and auto-saving drafts.
 * For IMAP: two-tier (local SQLite every 3s + server APPEND every 18s).
 * For Gmail: existing single-tier (provider-based, 3s debounce).
 */
export function startAutoSave(accountId: string): void {
  isDiscarding = false;
  isSaveLocalInFlight = false;
  isSaveServerInFlight = false;
  preTombstonedDraftId = null;
  stopAutoSave();
  currentAccountId = accountId;
  lastPersistenceKey = null;
  openTime = Date.now();

  // Detect account type
  const account = useAccountStore.getState().accounts.find((a) => a.id === accountId);
  isImap = !!account && account.provider !== "gmail_api";

  // If opening an existing IMAP draft (draftId is set), initialize server UID tracking
  // so the first saveServer() call does updateDraft instead of createDraft.
  if (isImap) {
    currentServerUid = null;
    currentServerFolder = null;
    const existingDraftId = useComposerStore.getState().draftId;
    if (existingDraftId && existingDraftId.startsWith(`imap-${accountId}-`)) {
      const prefix = `imap-${accountId}-`;
      const remainder = existingDraftId.slice(prefix.length);
      const lastDash = remainder.lastIndexOf("-");
      if (lastDash !== -1) {
        const folder = remainder.slice(0, lastDash);
        const uid = parseInt(remainder.slice(lastDash + 1), 10);
        if (folder && !isNaN(uid)) {
          currentServerUid = uid;
          currentServerFolder = folder;
        }
      }
    }
  }

  unsubscribe = useComposerStore.subscribe((state, prevState) => {
    if (!state.isOpen) return;
    if (
      state.bodyHtml !== prevState.bodyHtml ||
      state.subject !== prevState.subject ||
      state.to !== prevState.to ||
      state.cc !== prevState.cc ||
      state.bcc !== prevState.bcc ||
      state.attachments !== prevState.attachments
    ) {
      if (isImap) {
        scheduleLocalSave();
        scheduleServerSave();
      } else {
        scheduleGmailSave();
      }
    }
  });

  // If the composer opens with pre-filled body (e.g. expand from inline reply),
  // the subscription misses the "" → content transition that already happened.
  const initialState = useComposerStore.getState();
  if (initialState.isOpen && initialState.bodyHtml) {
    openTime = 0; // bypass cooldown: user already typed in the inline editor
    if (isImap) {
      scheduleLocalSave();
    } else {
      scheduleGmailSave();
    }
  }
}

/**
 * Stop auto-saving and clean up persistence key.
 */
export function stopAutoSave(): void {
  if (localDebounceTimer) {
    clearTimeout(localDebounceTimer);
    localDebounceTimer = null;
  }
  if (serverDebounceTimer) {
    clearTimeout(serverDebounceTimer);
    serverDebounceTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  // Delete the persistence key only when the composer is fully closed —
  // not on HMR or temporary unmounts.
  if (lastPersistenceKey && !useComposerStore.getState().isOpen) {
    void deleteSetting(lastPersistenceKey);
  }
  currentAccountId = null;
  lastPersistenceKey = null;
  // Keep isDiscarding and serverSavePromise alive: a discard may have an
  // in-flight IMAP save that still needs to pre-tombstone before resolving.
  // They are reset by the next startAutoSave() call.
}
