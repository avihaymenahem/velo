import { getDb } from "@/services/db/connection";

export interface ActivityEvent {
  type: "email" | "task" | "calendar";
  date: number;
  summary: string;
  id: string;
}

export async function getContactActivity(
  accountId: string,
  email: string,
  limit = 20,
): Promise<ActivityEvent[]> {
  const db = await getDb();
  const rows = await db.select<ActivityEvent[]>(
    `SELECT 'email' as type, m.date, COALESCE(m.subject, '(no subject)') as summary, m.id
     FROM messages m
     WHERE m.account_id = $1 AND m.from_address = $2
     UNION ALL
     SELECT 'task' as type, t.created_at as date, t.title as summary, t.id
     FROM tasks t
     WHERE t.account_id = $1 AND t.id IN (
       SELECT p.contact_id FROM contact_tag_pivot p WHERE p.contact_id = $2
     )
     UNION ALL
     SELECT 'calendar' as type, ce.start_time as date, ce.title as summary, ce.id
     FROM calendar_events ce
     WHERE ce.account_id = $1 AND ce.id IN (
       SELECT p.contact_id FROM contact_group_pivot p WHERE p.contact_id = $2
     )
     ORDER BY date DESC
     LIMIT $3`,
    [accountId, email, limit],
  );
  return rows;
}
