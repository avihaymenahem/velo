import type { GmailClient } from "./client";
import { deleteThread as deleteThreadFromDb } from "../db/threads";

/**
 * Delete all drafts for a given thread via the Gmail Drafts API, then remove the thread from local DB.
 * This is the correct way to delete drafts — using the Drafts API permanently removes them,
 * unlike modifyThread(["TRASH"]) which only trashes but leaves the DRAFT label intact.
 */
export async function deleteDraftsForThread(
  client: GmailClient,
  accountId: string,
  threadId: string,
): Promise<void> {
  // Fetch metadata and draft list in parallel to check thread composition before deleting
  const [threadDrafts, threadMeta] = await Promise.all([
    client.listDrafts({ q: `threadId:${threadId}` }),
    client.getThread(threadId, "minimal").catch(() => null),
  ]);

  // Delete all drafts in parallel
  await Promise.all(threadDrafts.map((d) => client.deleteDraft(d.id)));

  // If the thread contained only draft messages, permanently delete it so delta sync
  // never re-fetches it (avoids eventual-consistency re-sync bug where the thread
  // reappears because modifyThread created a new History event before Gmail propagated
  // the draft deletion). For threads that also have non-draft messages (e.g. a draft
  // reply on an existing conversation) just strip the DRAFT label instead.
  const isDraftOnly =
    !threadMeta || threadMeta.messages.every((m) => m.labelIds?.includes("DRAFT"));

  if (isDraftOnly) {
    try {
      await client.deleteThread(threadId);
    } catch {
      // Thread might already be gone
    }
  } else {
    try {
      await client.modifyThread(threadId, [], ["DRAFT"]);
    } catch {
      // Thread might already be gone
    }
  }

  // Clean up local DB (deleteThreadFromDb is now atomic and clears everything)
  await deleteThreadFromDb(accountId, threadId);
}
