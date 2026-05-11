import { withTransaction } from "@/services/db/connection";
import { getAllContacts, deleteContact } from "@/services/db/contacts";

export interface MergeCandidate {
  contactId: string;
  email: string;
  displayName: string | null;
  matchScore: number;
}

export async function findMergeCandidates(): Promise<MergeCandidate[]> {
  const contacts = await getAllContacts(5000);
  const emailMap = new Map<string, typeof contacts>();

  for (const c of contacts) {
    const key = c.email.toLowerCase().trim();
    const existing = emailMap.get(key) ?? [];
    existing.push(c);
    emailMap.set(key, existing);
  }

  const candidates: MergeCandidate[] = [];
  for (const [, group] of emailMap) {
    if (group.length > 1) {
      const sorted = group.sort((a, b) => b.frequency - a.frequency);
      for (let i = 1; i < sorted.length; i++) {
        const dup = sorted[i]!;
        candidates.push({
          contactId: dup.id,
          email: dup.email,
          displayName: dup.display_name,
          matchScore: 100,
        });
      }
    }
  }

  return candidates;
}

export async function mergeContacts(keepId: string, mergeId: string): Promise<void> {
  await withTransaction(async (db) => {
    await db.execute(
      `UPDATE contact_tag_pivot SET contact_id = $1 WHERE contact_id = $2`,
      [keepId, mergeId],
    );
    await db.execute(
      `UPDATE contact_group_pivot SET contact_id = $1 WHERE contact_id = $2`,
      [keepId, mergeId],
    );
    await db.execute(
      `DELETE FROM contact_tag_pivot WHERE contact_id = $1 AND rowid NOT IN (
        SELECT MIN(rowid) FROM contact_tag_pivot WHERE contact_id = $1 GROUP BY tag_id
      )`,
      [keepId],
    );
    await db.execute(
      `DELETE FROM contact_group_pivot WHERE contact_id = $1 AND rowid NOT IN (
        SELECT MIN(rowid) FROM contact_group_pivot WHERE contact_id = $1 GROUP BY group_id
      )`,
      [keepId],
    );
    await deleteContact(mergeId);
  });
}
