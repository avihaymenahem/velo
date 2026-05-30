import { extractMeetingUrl } from "@/services/calendar/icalHelper";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

const MEETING_URL_RE =
  /https?:\/\/(?:[^\s"<>]+\.zoom\.us|teams\.microsoft\.com|meet\.google\.com|[^\s"<>]+\.webex\.com|[^\s"<>]+\.gotomeeting\.com)\/[^\s"<>]*/i;

function fromText(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(MEETING_URL_RE);
  return m ? m[0] : null;
}

/** Returns the first conference/meeting URL found in the event, or null. */
export function getMeetingUrl(event: DbCalendarEvent): string | null {
  if (event.ical_data) {
    const url = extractMeetingUrl(event.ical_data);
    if (url) return url;
  }
  return fromText(event.location) ?? fromText(event.description);
}

/** True when nowTs falls in [start − 30 min, end + 30 min]. */
export function isMeetingActive(event: DbCalendarEvent, nowTs: number): boolean {
  return nowTs >= event.start_time - 30 * 60 && nowTs <= event.end_time + 30 * 60;
}
