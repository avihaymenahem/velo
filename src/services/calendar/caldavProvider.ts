import { DAVClient, type DAVCalendar, type DAVObject } from "tsdav";
import type {
  CalendarProvider,
  CalendarProviderType,
  CalendarInfo,
  CalendarEventData,
  CalendarSyncResult,
  CreateEventInput,
  UpdateEventInput,
} from "./types";
import { generateVEvent, parseVEvent, expandVEvents } from "./icalHelper";
import { getAccount } from "@/services/db/accounts";
import { listCalDavCalendars, fetchCalDavEvents } from "./caldavHttp";

export class CalDAVProvider implements CalendarProvider {
  readonly type: CalendarProviderType = "caldav";
  private client: DAVClient | null = null;

  constructor(readonly accountId: string) {}

  private async getClient(): Promise<DAVClient> {
    if (this.client) return this.client;

    const account = await getAccount(this.accountId);
    if (!account) throw new Error("Account not found");

    const serverUrl = account.caldav_url;
    const username = account.caldav_username ?? account.email;
    const password = account.caldav_password;

    if (!serverUrl || !password) {
      throw new Error("CalDAV credentials not configured");
    }

    this.client = new DAVClient({
      serverUrl,
      credentials: { username, password },
      authMethod: "Basic",
      defaultAccountType: "caldav",
    });

    await this.client.login();
    return this.client;
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const account = await getAccount(this.accountId);
    if (!account?.caldav_url || !account.caldav_password) {
      throw new Error("CalDAV credentials not configured");
    }
    const username = account.caldav_username ?? account.email;
    // Uses Tauri's plugin-http fetch (bypasses WebKit CORS for PROPFIND)
    return listCalDavCalendars(account.caldav_url, username, account.caldav_password);
  }

  async fetchEvents(calendarRemoteId: string, timeMin: string, timeMax: string): Promise<CalendarEventData[]> {
    const account = await getAccount(this.accountId);
    if (!account?.caldav_url || !account.caldav_password) throw new Error("CalDAV credentials not configured");
    const username = account.caldav_username ?? account.email;

    const objects = await fetchCalDavEvents(calendarRemoteId, username, account.caldav_password, timeMin, timeMax);
    const rangeStartTs = Math.floor(new Date(timeMin).getTime() / 1000);
    const rangeEndTs = Math.floor(new Date(timeMax).getTime() / 1000);
    const debug = (globalThis as { __VELO_CALDAV_DEBUG__?: boolean }).__VELO_CALDAV_DEBUG__;
    if (debug) {
      console.log("[caldav] fetchEvents response", {
        calendarRemoteId,
        timeMin,
        timeMax,
        objectCount: objects.length,
      });
    }
    const allEvents: CalendarEventData[] = [];
    for (const obj of objects) {
      if (debug && /RRULE/i.test(obj.icalData)) {
        console.log("[caldav] raw iCal with RRULE", { url: obj.url, icalData: obj.icalData });
      }
      const events = expandVEvents(obj.icalData, obj.url, rangeStartTs, rangeEndTs);
      for (const event of events) {
        event.etag = obj.etag;
        allEvents.push(event);
      }
    }
    if (debug) console.log("[caldav] fetchEvents total events after expansion", allEvents.length);
    return allEvents;
  }

  async createEvent(calendarRemoteId: string, event: CreateEventInput): Promise<CalendarEventData> {
    const client = await this.getClient();
    const uid = crypto.randomUUID();
    const icalData = generateVEvent(event, uid);
    const filename = `${uid}.ics`;

    await client.createCalendarObject({
      calendar: { url: calendarRemoteId } as DAVCalendar,
      filename,
      iCalString: icalData,
    });

    const parsed = parseVEvent(icalData, `${calendarRemoteId}${filename}`);
    return parsed;
  }

  async updateEvent(
    calendarRemoteId: string,
    remoteEventId: string,
    event: UpdateEventInput,
    etag?: string,
  ): Promise<CalendarEventData> {
    const client = await this.getClient();

    // Fetch the existing object to get its current data
    const objects = await client.fetchCalendarObjects({
      calendar: { url: calendarRemoteId } as DAVCalendar,
      objectUrls: [remoteEventId],
    });

    const existing = objects[0];
    if (!existing?.data) throw new Error("Event not found on server");

    // Parse existing, merge updates, regenerate
    const parsed = parseVEvent(existing.data, remoteEventId);
    const merged: CreateEventInput = {
      summary: event.summary ?? parsed.summary ?? "",
      description: event.description ?? parsed.description ?? undefined,
      location: event.location ?? parsed.location ?? undefined,
      startTime: event.startTime ?? new Date(parsed.startTime * 1000).toISOString(),
      endTime: event.endTime ?? new Date(parsed.endTime * 1000).toISOString(),
      isAllDay: event.isAllDay ?? parsed.isAllDay,
    };

    const icalData = generateVEvent(merged, parsed.uid ?? undefined);

    const headers: Record<string, string> = {};
    if (etag) headers["If-Match"] = etag;

    await client.updateCalendarObject({
      calendarObject: {
        url: remoteEventId,
        data: icalData,
        etag: etag ?? existing.etag ?? undefined,
      } as DAVObject,
      headers,
    });

    const result = parseVEvent(icalData, remoteEventId);
    return result;
  }

  async deleteEvent(_calendarRemoteId: string, remoteEventId: string, etag?: string): Promise<void> {
    const client = await this.getClient();

    const headers: Record<string, string> = {};
    if (etag) headers["If-Match"] = etag;

    await client.deleteCalendarObject({
      calendarObject: {
        url: remoteEventId,
        etag: etag ?? undefined,
      } as DAVObject,
      headers,
    });
  }

  async syncEvents(calendarRemoteId: string, _syncToken?: string): Promise<CalendarSyncResult> {
    const account = await getAccount(this.accountId);
    if (!account?.caldav_url || !account.caldav_password) throw new Error("CalDAV credentials not configured");
    const username = account.caldav_username ?? account.email;

    const now = new Date();
    const timeMin = new Date(now);
    timeMin.setDate(timeMin.getDate() - 90);
    const timeMax = new Date(now);
    timeMax.setFullYear(timeMax.getFullYear() + 1);

    const objects = await fetchCalDavEvents(
      calendarRemoteId,
      username,
      account.caldav_password,
      timeMin.toISOString(),
      timeMax.toISOString(),
    );

    const rangeStartTs = Math.floor(timeMin.getTime() / 1000);
    const rangeEndTs = Math.floor(timeMax.getTime() / 1000);
    const created: CalendarEventData[] = [];
    for (const obj of objects) {
      const events = expandVEvents(obj.icalData, obj.url, rangeStartTs, rangeEndTs);
      for (const event of events) {
        event.etag = obj.etag;
        created.push(event);
      }
    }

    return { created, updated: [], deletedRemoteIds: [], newSyncToken: null, newCtag: null };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.getClient();
      const calendars = await client.fetchCalendars();
      return {
        success: true,
        message: `Connected — found ${calendars.length} calendar${calendars.length !== 1 ? "s" : ""}`,
      };
    } catch (err) {
      // Reset client on failure so next attempt can retry
      this.client = null;
      return { success: false, message: err instanceof Error ? err.message : "Connection failed" };
    }
  }
}

