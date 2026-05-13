import { searchContacts } from "@/services/db/contacts";
import { queryWithRetry } from "@/services/db/connection";

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

  if (trimmed.startsWith("health:")) {
    const status = trimmed.slice(7).trim();
    if (["cold", "lukewarm", "warm", "hot"].includes(status)) {
      const db = await (await import("@/services/db/connection")).getDb();
      const rows = await db.select<{ id: string }[]>(
        "SELECT id FROM contacts WHERE health_status = $1 LIMIT 1000",
        [status],
      );
      return rows.map((r) => r.id);
    }
  }

  if (trimmed.startsWith("score>=")) {
    const threshold = parseFloat(trimmed.slice(7).trim());
    if (!isNaN(threshold)) {
      const db = await (await import("@/services/db/connection")).getDb();
      const rows = await db.select<{ id: string }[]>(
        "SELECT id FROM contacts WHERE engagement_score >= $1 LIMIT 1000",
        [threshold],
      );
      return rows.map((r) => r.id);
    }
  }

  if (trimmed.startsWith("score<=")) {
    const threshold = parseFloat(trimmed.slice(7).trim());
    if (!isNaN(threshold)) {
      const db = await (await import("@/services/db/connection")).getDb();
      const rows = await db.select<{ id: string }[]>(
        "SELECT id FROM contacts WHERE engagement_score <= $1 LIMIT 1000",
        [threshold],
      );
      return rows.map((r) => r.id);
    }
  }

  const contacts = await searchContacts(trimmed, 100);
  return contacts.map((c) => c.id);
}

export interface DynamicSegment {
  id: string;
  account_id: string;
  name: string;
  query: string;
  refreshed_at: number | null;
}

export async function getDynamicSegments(accountId: string): Promise<DynamicSegment[]> {
  return queryWithRetry(async (db) =>
    db.select<DynamicSegment[]>(
      "SELECT * FROM dynamic_segments WHERE account_id = $1 ORDER BY name ASC",
      [accountId],
    )
  );
}

export async function createDynamicSegment(
  accountId: string,
  name: string,
  query: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await queryWithRetry(async (db) => {
    await db.execute(
      "INSERT INTO dynamic_segments (id, account_id, name, query) VALUES ($1, $2, $3, $4)",
      [id, accountId, name, query],
    );
  });
  return id;
}

export async function refreshDynamicSegment(segmentId: string): Promise<string[]> {
  const segment = await queryWithRetry(async (db) => {
    const rows = await db.select<DynamicSegment[]>(
      "SELECT * FROM dynamic_segments WHERE id = $1",
      [segmentId],
    );
    return rows[0] ?? null;
  });

  if (!segment) return [];

  const contactIds = await evaluateSegmentQuery(segment.account_id, segment.query);
  const now = Math.floor(Date.now() / 1000);

  await queryWithRetry(async (db) => {
    await db.execute(
      "UPDATE dynamic_segments SET refreshed_at = $1 WHERE id = $2",
      [now, segmentId],
    );
  });

  return contactIds;
}

export async function getDynamicSegmentMembers(segmentId: string): Promise<string[]> {
  const segment = await queryWithRetry(async (db) => {
    const rows = await db.select<DynamicSegment[]>(
      "SELECT * FROM dynamic_segments WHERE id = $1",
      [segmentId],
    );
    return rows[0] ?? null;
  });

  if (!segment) return [];

  return evaluateSegmentQuery(segment.account_id, segment.query);
}

export async function refreshAllDynamicSegments(accountId: string): Promise<void> {
  const segments = await getDynamicSegments(accountId);

  for (const segment of segments) {
    try {
      await refreshDynamicSegment(segment.id);
    } catch (err) {
      console.error(`Failed to refresh dynamic segment ${segment.id}:`, err);
    }
  }
}
