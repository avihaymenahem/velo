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
  // Delete via Drafts API first
  const drafts = await client.listDrafts();
  const threadDrafts = drafts.filter((d) => d.message.threadId === threadId);
  for (const d of threadDrafts) {
    await client.deleteDraft(d.id);
  }

  // Remove DRAFT label from thread to prevent re-sync from recreating it in Drafts folder
  try {
    await client.modifyThread(threadId, [], ["DRAFT"]);
  } catch {
    // Thread might already be gone, ignore
  }

  // Clean up local DB (deleteThreadFromDb is now atomic and clears everything)
  await deleteThreadFromDb(accountId, threadId);
}
