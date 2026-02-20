import { getDb, selectFirstBy } from "./connection";

export interface DbCalendar {
  id: string;
  account_id: string;
  provider: string;
  remote_id: string;
  display_name: string | null;
  color: string | null;
  is_primary: number;
  is_visible: number;
  sync_token: string | null;
  ctag: string | null;
  created_at: number;
  updated_at: number;
}

export async function upsertCalendar(calendar: {
  accountId: string;
  provider: string;
  remoteId: string;
  displayName: string | null;
  color: string | null;
  isPrimary: boolean;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.execute(
    `INSERT INTO calendars (id, account_id, provider, remote_id, display_name, color, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(account_id, remote_id) DO UPDATE SET
       display_name = $5, color = $6, is_primary = $7, updated_at = unixepoch()`,
    [id, calendar.accountId, calendar.provider, calendar.remoteId, calendar.displayName, calendar.color, calendar.isPrimary ? 1 : 0],
  );
  // Return the actual ID (could be existing row on conflict)
  const existing = await selectFirstBy<{ id: string }>(
    "SELECT id FROM calendars WHERE account_id = $1 AND remote_id = $2",
    [calendar.accountId, calendar.remoteId],
  );
  return existing?.id ?? id;
}

export async function getCalendarsForAccount(accountId: string): Promise<DbCalendar[]> {
  const db = await getDb();
  return db.select<DbCalendar[]>(
    "SELECT * FROM calendars WHERE account_id = $1 ORDER BY is_primary DESC, display_name ASC",
    [accountId],
  );
}

export async function getVisibleCalendars(accountId: string): Promise<DbCalendar[]> {
  const db = await getDb();
  return db.select<DbCalendar[]>(
    "SELECT * FROM calendars WHERE account_id = $1 AND is_visible = 1 ORDER BY is_primary DESC, display_name ASC",
    [accountId],
  );
}

export async function setCalendarVisibility(calendarId: string, visible: boolean): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendars SET is_visible = $1, updated_at = unixepoch() WHERE id = $2",
    [visible ? 1 : 0, calendarId],
  );
}

export async function updateCalendarSyncToken(
  calendarId: string,
  syncToken: string | null,
  ctag?: string | null,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE calendars SET sync_token = $1, ctag = $2, updated_at = unixepoch() WHERE id = $3",
    [syncToken, ctag ?? null, calendarId],
  );
}

export async function deleteCalendarsForAccount(accountId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM calendars WHERE account_id = $1", [accountId]);
}

export async function getCalendarById(calendarId: string): Promise<DbCalendar | null> {
  return selectFirstBy<DbCalendar>(
    "SELECT * FROM calendars WHERE id = $1",
    [calendarId],
  );
}
