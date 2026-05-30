import { getDb } from "./db/connection";
import { getSetting, setSetting } from "./db/settings";
import { updateSmartFolder } from "./db/smartFolders";
import { archiveThread } from "./emailActions";

const PRUNING_TOKEN_MAP: Record<string, string> = {
  "3": "__LAST_3_MONTHS__",
  "6": "__LAST_6_MONTHS__",
  "12": "__LAST_12_MONTHS__",
};

export function pruningMonthsToQuery(months: string): string {
  const token = PRUNING_TOKEN_MAP[months];
  if (!token) return "has:calendar";
  return `has:calendar after:${token}`;
}

export async function updateCalendarPruningMonths(months: string): Promise<void> {
  await setSetting("calendar_invite_pruning_months", months);
  await updateSmartFolder("sf-calendar", { query: pruningMonthsToQuery(months) });
}

interface ThreadRow {
  account_id: string;
  thread_id: string;
  message_ids: string;
}

/**
 * Archives calendar invite threads in INBOX that are older than the configured
 * pruning period. No-ops if the setting is "0" (never prune).
 */
export async function pruneCalendarInvites(): Promise<void> {
  try {
    const raw = await getSetting("calendar_invite_pruning_months");
    const months = raw ? parseInt(raw, 10) : 6;
    if (isNaN(months) || months <= 0) return;

    const cutoffMs = Date.now() - months * 30 * 24 * 60 * 60 * 1000;

    const db = await getDb();
    const rows = await db.select<ThreadRow[]>(
      `SELECT m.account_id, m.thread_id,
              GROUP_CONCAT(m.id) as message_ids
       FROM messages m
       WHERE m.date < $1
         AND m.is_deleted = 0
         AND EXISTS (
           SELECT 1 FROM attachments a
           WHERE a.account_id = m.account_id
             AND a.message_id = m.id
             AND (a.mime_type LIKE '%calendar%' OR a.filename LIKE '%.ics')
         )
         AND EXISTS (
           SELECT 1 FROM thread_labels tl
           WHERE tl.account_id = m.account_id
             AND tl.thread_id = m.thread_id
             AND tl.label_id = 'INBOX'
         )
       GROUP BY m.account_id, m.thread_id`,
      [cutoffMs],
    );

    for (const row of rows) {
      const messageIds = row.message_ids.split(",");
      await archiveThread(row.account_id, row.thread_id, messageIds);
    }
  } catch (err) {
    console.warn("[calendarInviteManager] pruneCalendarInvites failed:", err);
  }
}
