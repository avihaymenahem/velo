import { useComposerStore } from "@/stores/composerStore";
import { createDraft as createDraftAction, updateDraft as updateDraftAction } from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { useAccountStore } from "@/stores/accountStore";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribe: (() => void) | null = null;
let currentAccountId: string | null = null;
let isDiscarding = false;
let isSaveInFlight = false;
let savePromise: Promise<void> | null = null;
let openTime: number = 0;

const DEBOUNCE_MS = 3000;
const OPEN_COOLDOWN_MS = 2000; // Don't save in first 2s after opening (user hasn't interacted)

function getPersistenceKey(accountId: string): string {
  const state = useComposerStore.getState();
  return `v_draft_${accountId}_${state.threadId ?? "new"}`;
}

/**
 * Remove the stale DB record of a draft that was replaced by a newer IMAP append.
 * IMAP has no in-place update — every save does delete+append, giving the message a new UID.
 * The sync detects new UIDs but NOT deleted ones, so without this cleanup the old record
 * accumulates and the user sees multiple copies of the same draft.
 */
async function cleanupOldDraftFromDb(accountId: string, oldDraftId: string): Promise<void> {
  try {
    const { getDb } = await import("@/services/db/connection");
    const db = await getDb();
    const rows = await db.select<{ thread_id: string }[]>(
      "SELECT thread_id FROM messages WHERE id = $1 AND account_id = $2",
      [oldDraftId, accountId],
    );
    if (rows.length === 0) return;
    const threadId = rows[0]!.thread_id;
    await db.execute(
      "DELETE FROM messages WHERE id = $1 AND account_id = $2",
      [oldDraftId, accountId],
    );
    const remaining = await db.select<{ c: number }[]>(
      "SELECT COUNT(*) as c FROM messages WHERE thread_id = $1 AND account_id = $2",
      [threadId, accountId],
    );
    if ((remaining[0]?.c ?? 1) === 0) {
      await db.execute(
        "DELETE FROM thread_labels WHERE thread_id = $1 AND account_id = $2",
        [threadId, accountId],
      );
      await db.execute(
        "DELETE FROM threads WHERE id = $1 AND account_id = $2",
        [threadId, accountId],
      );
    }
  } catch (err) {
    console.warn("[draftAutoSave] cleanupOldDraft failed:", err);
  }
}

async function saveDraft(): Promise<void> {
  // Skip if discarding or another save is already running (prevents duplicate creates)
  if (isDiscarding || isSaveInFlight) return;
  
  // Don't save in the first few seconds after opening - user hasn't interacted yet
  if (openTime && Date.now() - openTime < OPEN_COOLDOWN_MS) return;
  
  isSaveInFlight = true;

  const state = useComposerStore.getState();
  // Capture the accountId at save time to avoid mismatch if user switches accounts during debounce
  const accountId = currentAccountId;

  try {
    if (!state.isOpen || !accountId) return;

    const accounts = useAccountStore.getState().accounts;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    // Don't save empty drafts (user hasn't typed anything)
    // In reply/forward, to/subject/quotedHtml are pre-filled, so we only check bodyHtml
    if (!state.bodyHtml) return;

    if (isDiscarding) return;

    state.setIsSaving(true);

    // Build full HTML including quoted content (same logic as getFullHtml in Composer.tsx)
    let htmlBody = state.bodyHtml;
    if (state.quotedHtml) {
      htmlBody = `${htmlBody}${state.quotedHtml}`;
    }

    const raw = buildRawEmail({
      from: account.email,
      to: state.to.length > 0 ? state.to : [""],
      subject: state.subject,
      htmlBody,
      threadId: state.threadId ?? undefined,
      attachments: state.attachments.length > 0
        ? state.attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            content: a.content,
          }))
        : undefined,
    });

    if (state.draftId) {
      if (isDiscarding) return;
      const oldDraftId = state.draftId;
      const result = await updateDraftAction(accountId, oldDraftId, raw, state.threadId ?? undefined);
      // IMAP updateDraft deletes old UID and appends a new message — always update store
      // with the new draftId so handleDiscard can find and delete it even if we're discarding.
      if (result.data && typeof result.data === "object" && "draftId" in result.data) {
        const data = result.data as { draftId: string; threadId?: string };
        if (data.draftId !== oldDraftId) {
          state.setDraftId(data.draftId);
          // Remove the stale DB record for the old UID so the user doesn't see duplicate drafts
          void cleanupOldDraftFromDb(accountId, oldDraftId);
          if (!isDiscarding) {
            const key = getPersistenceKey(accountId);
            localStorage.setItem(key, data.draftId);
          }
        }
      }
    } else {
      // Recovery: check if we have a persisted draftId for this context (survives reload)
      const key = getPersistenceKey(accountId);
      const persistedId = localStorage.getItem(key);
      if (persistedId) {
        try {
          if (isDiscarding) return;
          const result = await updateDraftAction(accountId, persistedId, raw, state.threadId ?? undefined);
          if (result.data && typeof result.data === "object" && "draftId" in result.data) {
            const data = result.data as { draftId: string; threadId?: string };
            state.setDraftId(data.draftId);
            if (data.draftId !== persistedId) {
              void cleanupOldDraftFromDb(accountId, persistedId);
            }
            if (!isDiscarding) {
              localStorage.setItem(key, data.draftId);
              if (data.threadId && !state.threadId) {
                useComposerStore.setState({ threadId: data.threadId });
              }
            }
          } else if (!isDiscarding) {
            state.setDraftId(persistedId);
          }
        } catch {
          // Persisted draft is gone (sent/deleted) — create a fresh one
          if (isDiscarding) return;
          const result = await createDraftAction(accountId, raw, state.threadId ?? undefined);
          // Always set draftId so handleDiscard can delete it if we're mid-discard
          if (result.data && typeof result.data === "object" && "draftId" in result.data) {
            const data = result.data as { draftId: string; threadId?: string };
            state.setDraftId(data.draftId);
            if (!isDiscarding) {
              localStorage.setItem(key, data.draftId);
              if (data.threadId && !state.threadId) {
                useComposerStore.setState({ threadId: data.threadId });
              }
            }
          }
        }
      } else {
        if (isDiscarding) return;
        const result = await createDraftAction(accountId, raw, state.threadId ?? undefined);
        // Always set draftId so handleDiscard can delete it if we're mid-discard
        if (result.data && typeof result.data === "object" && "draftId" in result.data) {
          const data = result.data as { draftId: string; threadId?: string };
          state.setDraftId(data.draftId);
          if (!isDiscarding) {
            localStorage.setItem(key, data.draftId);
            if (data.threadId && !state.threadId) {
              useComposerStore.setState({ threadId: data.threadId });
            }
          }
        }
      }
    }

    if (!isDiscarding) state.setLastSavedAt(Date.now());
  } catch (err) {
    console.error("Failed to auto-save draft:", err);
  } finally {
    isSaveInFlight = false;
    state.setIsSaving(false);
  }
}

function scheduleSave(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    // Don't overwrite savePromise if a save is already in-flight — waitForSave() must
    // await the real in-flight promise, not an immediately-resolved no-op.
    if (!isSaveInFlight) {
      savePromise = saveDraft().finally(() => { savePromise = null; });
    }
  }, DEBOUNCE_MS);
}

/**
 * Save the draft immediately, cancelling any pending debounce.
 * Call this before stopAutoSave so currentAccountId is still set.
 */
export async function saveNow(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await saveDraft();
}

/**
 * Signal that the composer is being discarded. Stops the timer and subscription
 * immediately, and prevents any in-flight save from writing to IMAP.
 * Call waitForSave() after this to ensure the in-flight save has fully aborted.
 */
export function startDiscard(): void {
  isDiscarding = true;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

/**
 * Wait for any in-flight saveDraft() call to finish (either complete or abort).
 * Must be called after startDiscard() so the in-flight save sees isDiscarding=true
 * and bails out before touching IMAP.
 */
export async function waitForSave(): Promise<void> {
  if (savePromise) await savePromise;
}

/**
 * Start watching composerStore changes and auto-saving drafts.
 */
export function startAutoSave(accountId: string): void {
  isDiscarding = false;
  isSaveInFlight = false;
  stopAutoSave();
  currentAccountId = accountId;
  openTime = Date.now();

  // Subscribe to store changes — trigger debounced save on any field change
  unsubscribe = useComposerStore.subscribe(
    (state, prevState) => {
      if (!state.isOpen) return;
      // Only save when content-relevant fields change
      if (
        state.bodyHtml !== prevState.bodyHtml ||
        state.subject !== prevState.subject ||
        state.to !== prevState.to ||
        state.cc !== prevState.cc ||
        state.bcc !== prevState.bcc ||
        state.attachments !== prevState.attachments
      ) {
        scheduleSave();
      }
    },
  );

  // If the composer opens with pre-filled body (e.g. expand from inline reply),
  // the subscription above misses the "" → content transition that already
  // happened before startAutoSave was called. Schedule an immediate save.
  const initialState = useComposerStore.getState();
  if (initialState.isOpen && initialState.bodyHtml) {
    openTime = 0; // bypass the open-cooldown: user already typed in the inline editor
    scheduleSave();
  }
}

/**
 * Stop auto-saving and clean up.
 */
export function stopAutoSave(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  // Clear persistence ONLY if the composer is actually closed (not just HMR)
  if (currentAccountId && !useComposerStore.getState().isOpen) {
    localStorage.removeItem(getPersistenceKey(currentAccountId));
  }
  currentAccountId = null;
  isDiscarding = false;
  isSaveInFlight = false;
}
