import { getDb, selectFirstBy } from "./connection";

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
  // New CalDAV fields (nullable for backward compat)
  calendar_id: string | null;
  remote_event_id: string | null;
  etag: string | null;
  ical_data: string | null;
  uid: string | null;
  // Email invite fields (v45)
  source_message_id: string | null;
  rsvp_status: string | null;
  last_notified_at: number | null;
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
  calendarId?: string | null;
  remoteEventId?: string | null;
  etag?: string | null;
  icalData?: string | null;
  uid?: string | null;
}): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO calendar_events (id, account_id, google_event_id, summary, description, location, start_time, end_time, is_all_day, status, organizer_email, attendees_json, html_link, calendar_id, remote_event_id, etag, ical_data, uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT(account_id, google_event_id) DO UPDATE SET
       summary = $4, description = $5, location = $6, start_time = $7, end_time = $8,
       is_all_day = $9, status = $10, organizer_email = $11, attendees_json = $12,
       html_link = $13, calendar_id = $14, remote_event_id = $15, etag = $16,
       ical_data = $17, uid = $18, updated_at = unixepoch()`,
    [
      id, event.accountId, event.googleEventId, event.summary, event.description,
      event.location, event.startTime, event.endTime, event.isAllDay ? 1 : 0,
      event.status, event.organizerEmail, event.attendeesJson, event.htmlLink,
      event.calendarId ?? null, event.remoteEventId ?? null, event.etag ?? null,
      event.icalData ?? null, event.uid ?? null,
    ],
  );
  // Remove any orphan row that was created from an email invite with the same uid
  // (upsertEmailInviteEvent uses uid as google_event_id, so a different google_event_id
  // but identical uid means a stale duplicate from a prior RSVP flow).
  // IMPORTANT: scope to email-invite rows (source_message_id IS NOT NULL).
  // Recurring CalDAV instances all share the master's uid but have distinct
  // google_event_id values (`uid_<startTs>`), so an unscoped DELETE here would
  // wipe every sibling instance and leave only the last-upserted occurrence.
  if (event.uid) {
    await db.execute(
      `DELETE FROM calendar_events
       WHERE account_id = $1 AND uid = $2 AND google_event_id != $3
         AND source_message_id IS NOT NULL`,
      [event.accountId, event.uid, event.googleEventId],
    );
  }
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

export async function getCalendarEventsInRangeMulti(
  accountId: string,
  calendarIds: string[],
  startTime: number,
  endTime: number,
): Promise<DbCalendarEvent[]> {
  if (calendarIds.length === 0) {
    return getCalendarEventsInRange(accountId, startTime, endTime);
  }
  const db = await getDb();
  const placeholders = calendarIds.map((_, i) => `$${i + 4}`).join(", ");
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE account_id = $1 AND start_time < $3 AND end_time > $2
       AND (calendar_id IN (${placeholders}) OR calendar_id IS NULL)
     ORDER BY start_time ASC`,
    [accountId, startTime, endTime, ...calendarIds],
  );
}

export async function getCalendarEventsInRangeForCalendars(
  calendarIds: string[],
  startTime: number,
  endTime: number,
): Promise<DbCalendarEvent[]> {
  if (calendarIds.length === 0) return [];
  const db = await getDb();
  const placeholders = calendarIds.map((_, i) => `$${i + 3}`).join(", ");
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE start_time < $2 AND end_time > $1
       AND calendar_id IN (${placeholders})
     ORDER BY start_time ASC`,
    [startTime, endTime, ...calendarIds],
  );
}

export async function deleteEventsForCalendar(calendarId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM calendar_events WHERE calendar_id = $1", [calendarId]);
}

export async function getEventByRemoteId(
  calendarId: string,
  remoteEventId: string,
): Promise<DbCalendarEvent | null> {
  return selectFirstBy<DbCalendarEvent>(
    "SELECT * FROM calendar_events WHERE calendar_id = $1 AND remote_event_id = $2",
    [calendarId, remoteEventId],
  );
}

export async function deleteEventByRemoteId(
  calendarId: string,
  remoteEventId: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM calendar_events WHERE calendar_id = $1 AND remote_event_id = $2",
    [calendarId, remoteEventId],
  );
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM calendar_events WHERE id = $1", [eventId]);
}

export async function getCalendarEventByMessageId(messageId: string): Promise<DbCalendarEvent | null> {
  return selectFirstBy<DbCalendarEvent>(
    "SELECT * FROM calendar_events WHERE source_message_id = $1 LIMIT 1",
    [messageId],
  );
}

export async function upsertEmailInviteEvent(event: {
  accountId: string;
  sourceMessageId: string;
  uid: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  startTime: number;
  endTime: number;
  isAllDay: boolean;
  status: string;
  organizerEmail: string | null;
  attendeesJson: string | null;
  icalData: string;
  rsvpStatus: string | null;
}): Promise<void> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO calendar_events
       (id, account_id, google_event_id, summary, description, location, start_time, end_time,
        is_all_day, status, organizer_email, attendees_json, html_link, ical_data, uid,
        source_message_id, rsvp_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL,$13,$14,$15,$16)
     ON CONFLICT(account_id, google_event_id) DO UPDATE SET
       summary=$4, description=$5, location=$6, start_time=$7, end_time=$8,
       is_all_day=$9, status=$10, organizer_email=$11, attendees_json=$12,
       ical_data=$13, uid=$14, source_message_id=$15, rsvp_status=$16,
       updated_at=unixepoch()`,
    [
      id, event.accountId, event.uid,
      event.summary, event.description, event.location,
      event.startTime, event.endTime, event.isAllDay ? 1 : 0,
      event.status, event.organizerEmail, event.attendeesJson,
      event.icalData, event.uid, event.sourceMessageId, event.rsvpStatus,
    ],
  );
}

export async function updateCalendarEventRsvp(
  sourceMessageId: string,
  rsvpStatus: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendar_events SET rsvp_status = $1, updated_at = unixepoch() WHERE source_message_id = $2",
    [rsvpStatus, sourceMessageId],
  );
}

/**
 * Return events that start within [windowStartSec, windowEndSec] (unix timestamps),
 * are not all-day, not cancelled, and have not yet been notified.
 */
export async function getUpcomingEventsToNotify(
  windowStartSec: number,
  windowEndSec: number,
): Promise<DbCalendarEvent[]> {
  const db = await getDb();
  return db.select<DbCalendarEvent[]>(
    `SELECT * FROM calendar_events
     WHERE is_all_day = 0
       AND status != 'cancelled'
       AND start_time >= $1
       AND start_time <= $2
       AND last_notified_at IS NULL`,
    [windowStartSec, windowEndSec],
  );
}

export async function markCalendarEventNotified(eventId: string, notifiedAt: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendar_events SET last_notified_at = $1 WHERE id = $2",
    [notifiedAt, eventId],
  );
}
