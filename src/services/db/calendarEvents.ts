import { getDb } from "./connection";

export interface DbCalendarEvent {
  id: string;
  account_id: string;
  google_event_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start_time: number;
  end_time: number;
  is_all_day: number;
  status: string;
  organizer_email: string | null;
  attendees_json: string | null;
  html_link: string | null;
  updated_at: number;
}

export async function upsertCalendarEvent(event: {
  accountId: string;
  googleEventId: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startTime: number;
  endTime: number;
  isAllDay: boolean;
  status: string;
  organizerEmail: string | null;
  attendeesJson: string | null;
  htmlLink: string | null;
}): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO calendar_events (id, account_id, google_event_id, summary, description, location, start_time, end_time, is_all_day, status, organizer_email, attendees_json, html_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT(account_id, google_event_id) DO UPDATE SET
       summary = $4, description = $5, location = $6, start_time = $7, end_time = $8,
       is_all_day = $9, status = $10, organizer_email = $11, attendees_json = $12,
       html_link = $13, updated_at = unixepoch()`,
    [
      id, event.accountId, event.googleEventId, event.summary, event.description,
      event.location, event.startTime, event.endTime, event.isAllDay ? 1 : 0,
      event.status, event.organizerEmail, event.attendeesJson, event.htmlLink,
    ],
  );
}

export async function getCalendarEventsInRange(
  accountId: string,
  startTime: number,
  endTime: number,
): Promise<DbCalendarEvent[]> {
  const db = await getDb();
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1 AND start_time < $3 AND end_time > $2
     ORDER BY start_time ASC`,
    [accountId, startTime, endTime],
  );
}
