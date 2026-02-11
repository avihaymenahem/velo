import type { GmailClient } from "@/services/gmail/client";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  organizer?: { email: string; displayName?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  htmlLink?: string;
  updated?: string;
}

interface EventListResponse {
  items?: CalendarEvent[];
  nextPageToken?: string;
}

export async function listCalendarEvents(
  client: GmailClient,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const url = `${CALENDAR_API_BASE}/calendars/primary/events?${params}`;
  const response = await client.request<EventListResponse>(url);
  return response.items ?? [];
}

export async function createCalendarEvent(
  client: GmailClient,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: { email: string }[];
  },
): Promise<CalendarEvent> {
  const url = `${CALENDAR_API_BASE}/calendars/primary/events`;
  return client.request<CalendarEvent>(url, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export async function deleteCalendarEvent(
  client: GmailClient,
  eventId: string,
): Promise<void> {
  const url = `${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`;
  await client.request(url, { method: "DELETE" });
}
