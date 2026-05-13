import { queryWithRetry } from "@/services/db/connection";

export function computeEngagementScore(contact: {
  daysSinceLastContact: number;
  contactsLast30d: number;
  repliesSent: number;
  emailsReceived: number;
}): number {
  const recencyFactor = Math.min(1.0, 30 / Math.max(1, contact.daysSinceLastContact));
  const frequencyFactor = Math.min(1.0, contact.contactsLast30d / 10);
  const replyRate = contact.emailsReceived > 0
    ? Math.min(1.0, contact.repliesSent / contact.emailsReceived)
    : 0;
  return 0.4 * recencyFactor + 0.3 * frequencyFactor + 0.3 * replyRate;
}

export function getHealthStatus(score: number): 'cold' | 'lukewarm' | 'warm' | 'hot' {
  if (score >= 0.7) return 'hot';
  if (score >= 0.4) return 'warm';
  if (score >= 0.2) return 'lukewarm';
  return 'cold';
}

export interface ContactEngagementInput {
  daysSinceLastContact: number;
  contactsLast30d: number;
  repliesSent: number;
  emailsReceived: number;
}

export async function getEngagementDataForContact(email: string): Promise<ContactEngagementInput> {
  return queryWithRetry(async (db) => {
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    const contactRow = await db.select<{ last_contacted_at: number | null }[]>(
      `SELECT last_contacted_at FROM contacts WHERE email = $1`,
      [email],
    );

    const lastContacted = contactRow[0]?.last_contacted_at;
    const daysSinceLastContact = lastContacted
      ? Math.max(0, Math.floor((now - lastContacted) / 86400))
      : 999;

    const countRow = await db.select<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM messages
       WHERE from_address = $1 AND date >= $2`,
      [email, thirtyDaysAgo],
    );
    const contactsLast30d = countRow[0]?.cnt ?? 0;

    const fromRow = await db.select<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM messages WHERE from_address = $1`,
      [email],
    );
    const emailsReceived = fromRow[0]?.cnt ?? 0;

    const replyRow = await db.select<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM messages
       WHERE to_addresses LIKE '%' || $1 || '%' AND body_text IS NOT NULL AND body_text != ''`,
      [email],
    );
    const repliesSent = replyRow[0]?.cnt ?? 0;

    return { daysSinceLastContact, contactsLast30d, repliesSent, emailsReceived };
  });
}

export async function updateContactScore(contactId: string): Promise<void> {
  const dbRow = await queryWithRetry(async (db) => {
    return db.select<{ email: string }[]>(
      "SELECT email FROM contacts WHERE id = $1",
      [contactId],
    );
  });

  if (dbRow.length === 0) return;

  const email = dbRow[0]!.email;
  const input = await getEngagementDataForContact(email);
  const score = computeEngagementScore(input);
  const healthStatus = getHealthStatus(score);
  const now = Math.floor(Date.now() / 1000);

  await queryWithRetry(async (db) => {
    await db.execute(
      `UPDATE contacts SET engagement_score = $1, health_status = $2, last_engaged_at = $3, updated_at = $4 WHERE id = $5`,
      [score, healthStatus, now, now, contactId],
    );
  });
}

export async function batchUpdateScores(): Promise<void> {
  const contacts = await queryWithRetry(async (db) => {
    return db.select<{ id: string; email: string }[]>(
      "SELECT id, email FROM contacts",
    );
  });

  for (const contact of contacts) {
    try {
      await updateContactScore(contact.id);
    } catch (err) {
      console.error(`Failed to update score for contact ${contact.id}:`, err);
    }
  }
}
