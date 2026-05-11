import { searchContacts } from "@/services/db/contacts";

export async function evaluateSegmentQuery(accountId: string, query: string): Promise<string[]> {
  const trimmed = query.trim().toLowerCase();

  if (trimmed.startsWith("from:")) {
    const domain = trimmed.slice(5).trim();
    if (domain.startsWith("@")) {
      const contacts = await searchContacts(domain, 1000);
      return contacts.map((c) => c.id);
    }
  }

  if (trimmed === "has:attachment") {
    const db = await (await import("@/services/db/connection")).getDb();
    const rows = await db.select<{ contact_id: string }[]>(
      `SELECT DISTINCT m.from_address as contact_id
       FROM messages m
       INNER JOIN attachments a ON a.account_id = m.account_id AND a.id = m.id
       WHERE m.account_id = $1 AND a.is_inline = 0`,
      [accountId],
    );
    return rows.map((r) => r.contact_id);
  }

  if (trimmed.startsWith("last_contact:<")) {
    const days = parseInt(trimmed.slice("last_contact:<".length), 10);
    if (!isNaN(days)) {
      const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
      const db = await (await import("@/services/db/connection")).getDb();
      const rows = await db.select<{ id: string }[]>(
        `SELECT id FROM contacts
         WHERE last_contacted_at IS NOT NULL AND last_contacted_at < $1
         LIMIT 1000`,
        [cutoff],
      );
      return rows.map((r) => r.id);
    }
  }

  const contacts = await searchContacts(query, 100);
  return contacts.map((c) => c.id);
}
