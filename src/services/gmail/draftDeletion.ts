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
  const drafts = await client.listDrafts();
  const threadDrafts = drafts.filter((d) => d.message.threadId === threadId);
  for (const d of threadDrafts) {
    await client.deleteDraft(d.id);
  }
  await deleteThreadFromDb(accountId, threadId);
}
