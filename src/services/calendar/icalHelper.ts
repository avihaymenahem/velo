import type { CalendarEventData, CreateEventInput, UpdateEventInput } from "./types";

/**
 * Generate a VEVENT iCalendar string from event input.
 */
export function generateVEvent(event: CreateEventInput | UpdateEventInput, uid?: string): string {
  const eventUid = uid ?? crypto.randomUUID();
  const now = formatDateTimeUTC(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Melo Mail//CalDAV Client//EN",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${now}`,
  ];

  if (event.summary) {
    lines.push(`SUMMARY:${escapeICalText(event.summary)}`);
  }

  if (event.startTime && event.endTime) {
    if (event.isAllDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(new Date(event.startTime))}`);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(new Date(event.endTime))}`);
    } else {
      lines.push(`DTSTART:${formatDateTimeUTC(new Date(event.startTime))}`);
      lines.push(`DTEND:${formatDateTimeUTC(new Date(event.endTime))}`);
    }
  }

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  if ("attendees" in event && event.attendees) {
    for (const attendee of event.attendees) {
      lines.push(`ATTENDEE;RSVP=TRUE:mailto:${attendee.email}`);
    }
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Parse a VEVENT from iCalendar data into CalendarEventData.
 */
export function parseVEvent(icalData: string, href?: string): CalendarEventData {
  const lines = unfoldLines(icalData);

  let uid: string | null = null;
  let summary: string | null = null;
  let description: string | null = null;
  let location: string | null = null;
  let dtstart: string | null = null;
  let dtend: string | null = null;
  let status = "confirmed";
  let organizerEmail: string | null = null;
  let isAllDay = false;
  let recurrenceId: number | null = null;
  let recurrenceIdIsAllDay = false;
  const attendees: { email: string; displayName?: string; responseStatus?: string }[] = [];

  for (const line of lines) {
    const [nameWithParams, ...valueParts] = line.split(":");
    if (!nameWithParams) continue;
    const value = valueParts.join(":");
    const nameParts = nameWithParams.split(";");
    const propName = nameParts[0]!.toUpperCase();
    const params = nameParts.slice(1).join(";").toUpperCase();

    switch (propName) {
      case "UID":
        uid = value;
        break;
      case "SUMMARY":
        summary = unescapeICalText(value);
        break;
      case "DESCRIPTION":
        description = unescapeICalText(value);
        break;
      case "LOCATION":
        location = unescapeICalText(value);
        break;
      case "DTSTART":
        dtstart = value;
        if (params.includes("VALUE=DATE") && !params.includes("VALUE=DATE-TIME")) {
          isAllDay = true;
        }
        break;
      case "DTEND":
        dtend = value;
        break;
      case "RECURRENCE-ID": {
        recurrenceIdIsAllDay = params.includes("VALUE=DATE") && !params.includes("VALUE=DATE-TIME");
        try { recurrenceId = parseICalDateTime(value, recurrenceIdIsAllDay); } catch { /* ignore */ }
        break;
      }
      case "STATUS":
        status = value.toLowerCase();
        break;
      case "ORGANIZER": {
        const mailto = value.match(/mailto:(.+)/i);
        if (mailto) organizerEmail = mailto[1]!;
        break;
      }
      case "ATTENDEE": {
        const attendeeMailto = value.match(/mailto:(.+)/i);
        if (attendeeMailto) {
          const cnMatch = nameWithParams.match(/CN=([^;]+)/i);
          const statusMatch = nameWithParams.match(/PARTSTAT=([^;]+)/i);
          attendees.push({
            email: attendeeMailto[1]!,
            displayName: cnMatch?.[1]?.replace(/^"(.*)"$/, "$1"),
            responseStatus: statusMatch?.[1]?.toLowerCase(),
          });
        }
        break;
      }
    }
  }

  const startTime = dtstart ? parseICalDateTime(dtstart, isAllDay) : 0;
  // DTEND for all-day events is exclusive (RFC 5545 §3.6.1), subtract 1s to get the true end
  const endTime = dtend
    ? parseICalDateTime(dtend, isAllDay) - (isAllDay ? 1 : 0)
    : startTime + 3600;

  return {
    remoteEventId: href ?? uid ?? crypto.randomUUID(),
    uid,
    etag: null,
    summary,
    description,
    location,
    startTime,
    endTime,
    isAllDay,
    status,
    organizerEmail,
    attendeesJson: attendees.length > 0 ? JSON.stringify(attendees) : null,
    htmlLink: null,
    icalData,
    recurrenceId,
  };
}

/**
 * Parse all VEVENTs from iCalendar data, returning one entry per occurrence.
 * Used for CalDAV objects with `expand` that return multiple instances in one blob.
 * Each recurring instance gets a stable unique ID: `uid_startTimestamp`.
 */
export function parseVEvents(icalData: string, href?: string): CalendarEventData[] {
  // Split on BEGIN:VEVENT (case-insensitive)
  const blocks = icalData.split(/BEGIN:VEVENT/i);
  if (blocks.length <= 1) return [parseVEvent(icalData, href)];

  const events: CalendarEventData[] = [];
  const isMultiple = blocks.length > 2;

  for (let i = 1; i < blocks.length; i++) {
    const raw = blocks[i]!;
    const endIdx = raw.search(/END:VEVENT/i);
    const veventBody = endIdx >= 0 ? raw.slice(0, endIdx) : raw;
    const wrapped = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT${veventBody}END:VEVENT\r\nEND:VCALENDAR`;
    const event = parseVEvent(wrapped, href);
    if (isMultiple && event.uid) {
      // Use uid + startTime for a stable per-instance key
      event.remoteEventId = `${event.uid}_${event.startTime}`;
    }
    events.push(event);
  }

  return events.length > 0 ? events : [parseVEvent(icalData, href)];
}

// ---------------------------------------------------------------------------
// RRULE client-side expansion
// Used when the CalDAV server does not support the <C:expand> report element
// ---------------------------------------------------------------------------

interface RRuleParsed {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  until: number | null;    // unix seconds
  count: number | null;
  byDay: number[];         // 0=Sun … 6=Sat
  byMonthDay: number[];
}

/**
 * Return only the lines inside the VEVENT block, skipping VTIMEZONE/VALARM
 * subcomponents. Crucial because VTIMEZONE blocks contain their own RRULE
 * (DST transition rules) that must NOT be confused with the event's RRULE.
 */
function veventLines(icalData: string): string[] {
  const all = unfoldLines(icalData);
  const out: string[] = [];
  let inVevent = false;
  let nestedDepth = 0; // depth of nested components inside VEVENT (e.g. VALARM)
  for (const line of all) {
    const upper = line.toUpperCase();
    if (!inVevent) {
      if (upper === "BEGIN:VEVENT") inVevent = true;
      continue;
    }
    if (upper === "END:VEVENT") { inVevent = false; nestedDepth = 0; continue; }
    if (upper.startsWith("BEGIN:")) { nestedDepth++; continue; }
    if (upper.startsWith("END:")) { if (nestedDepth > 0) nestedDepth--; continue; }
    if (nestedDepth === 0) out.push(line);
  }
  return out;
}

function extractRRuleValue(icalData: string): string | null {
  for (const line of veventLines(icalData)) {
    if (line.toUpperCase().startsWith("RRULE:")) return line.slice(6).trim();
  }
  return null;
}

function extractExDates(icalData: string): Set<number> {
  const out = new Set<number>();
  for (const line of veventLines(icalData)) {
    if (!line.toUpperCase().startsWith("EXDATE")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const params = line.slice(0, colonIdx).toUpperCase();
    const isDate = params.includes("VALUE=DATE") && !params.includes("VALUE=DATE-TIME");
    for (const v of line.slice(colonIdx + 1).split(",")) {
      try { out.add(parseICalDateTime(v.trim(), isDate)); } catch { /* skip malformed */ }
    }
  }
  return out;
}

function parseRRuleStr(raw: string): RRuleParsed | null {
  const parts: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) parts[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  const freq = parts["FREQ"]?.toUpperCase();
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;

  const interval = parts["INTERVAL"] ? Math.max(1, parseInt(parts["INTERVAL"], 10)) : 1;

  let until: number | null = null;
  if (parts["UNTIL"]) {
    const u = parts["UNTIL"];
    try { until = parseICalDateTime(u, u.length === 8); } catch { /* ignore */ }
  }
  const count = parts["COUNT"] ? parseInt(parts["COUNT"], 10) : null;

  const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const byDay = (parts["BYDAY"] ?? "").split(",")
    .map((d) => DAY_MAP[d.replace(/^[+-]?\d+/, "").toUpperCase()])
    .filter((n): n is number => n !== undefined);
  const byMonthDay = (parts["BYMONTHDAY"] ?? "").split(",")
    .map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));

  return { freq: freq as RRuleParsed["freq"], interval, until, count, byDay, byMonthDay };
}

function generateOccurrences(
  dtStart: number,
  rrule: RRuleParsed,
  rangeStart: number,
  rangeEnd: number,
  exDates: Set<number>,
): number[] {
  if (rrule.freq === "WEEKLY" && rrule.byDay.length > 0) {
    return generateWeeklyByDay(dtStart, rrule, rangeStart, rangeEnd, exDates);
  }

  const results: number[] = [];
  let current = dtStart;
  let n = 0;

  // Fast-forward past occurrences before the query window to avoid hitting
  // the 500-iteration cap for events that started years ago.
  if (current < rangeStart) {
    const diff = rangeStart - current;
    let stepsToSkip = 0;
    const d = new Date(current * 1000);
    switch (rrule.freq) {
      case "DAILY":
        stepsToSkip = Math.max(0, Math.floor(diff / (rrule.interval * 86400)) - 1);
        d.setDate(d.getDate() + rrule.interval * stepsToSkip);
        break;
      case "WEEKLY":
        stepsToSkip = Math.max(0, Math.floor(diff / (rrule.interval * 7 * 86400)) - 1);
        d.setDate(d.getDate() + 7 * rrule.interval * stepsToSkip);
        break;
      case "MONTHLY":
        stepsToSkip = Math.max(0, Math.floor(diff / (rrule.interval * 30 * 86400)) - 2);
        d.setMonth(d.getMonth() + rrule.interval * stepsToSkip);
        break;
      case "YEARLY":
        stepsToSkip = Math.max(0, Math.floor(diff / (rrule.interval * 365 * 86400)) - 1);
        d.setFullYear(d.getFullYear() + rrule.interval * stepsToSkip);
        break;
    }
    n += stepsToSkip;
    current = Math.floor(d.getTime() / 1000);
  }

  while (results.length + n < 500) {
    if (rrule.until !== null && current > rrule.until) break;
    if (rrule.count !== null && n >= rrule.count) break;
    if (current > rangeEnd) break;

    if (current >= rangeStart && !exDates.has(current)) results.push(current);
    n++;

    const d = new Date(current * 1000);
    switch (rrule.freq) {
      case "DAILY":   d.setDate(d.getDate() + rrule.interval); break;
      case "WEEKLY":  d.setDate(d.getDate() + 7 * rrule.interval); break;
      case "MONTHLY": d.setMonth(d.getMonth() + rrule.interval); break;
      case "YEARLY":  d.setFullYear(d.getFullYear() + rrule.interval); break;
    }
    current = Math.floor(d.getTime() / 1000);
  }

  return results;
}

function generateWeeklyByDay(
  dtStart: number,
  rrule: RRuleParsed,
  rangeStart: number,
  rangeEnd: number,
  exDates: Set<number>,
): number[] {
  const results: number[] = [];
  const sortedDays = [...rrule.byDay].sort((a, b) => a - b);
  let count = 0;

  // Anchor on the Sunday of the week containing dtStart, preserving event time
  const startDate = new Date(dtStart * 1000);
  const weekAnchor = new Date(startDate);
  weekAnchor.setDate(weekAnchor.getDate() - weekAnchor.getDay());

  // Fast-forward to near rangeStart to avoid iterating all past weeks
  const anchorTs = Math.floor(weekAnchor.getTime() / 1000);
  if (anchorTs < rangeStart) {
    const weeksToSkip = Math.max(
      0,
      Math.floor((rangeStart - anchorTs) / (7 * 86400 * rrule.interval)) - 1,
    );
    if (weeksToSkip > 0) {
      count += weeksToSkip * sortedDays.length;
      weekAnchor.setDate(weekAnchor.getDate() + 7 * rrule.interval * weeksToSkip);
    }
  }

  while (results.length + count < 500) {
    for (const dow of sortedDays) {
      const d = new Date(weekAnchor);
      d.setDate(d.getDate() + dow);
      const ts = Math.floor(d.getTime() / 1000);

      if (ts < dtStart) continue;
      if (rrule.until !== null && ts > rrule.until) return results;
      if (rrule.count !== null && count >= rrule.count) return results;
      if (ts > rangeEnd) return results;

      count++;
      if (ts >= rangeStart && !exDates.has(ts)) results.push(ts);
    }
    weekAnchor.setDate(weekAnchor.getDate() + 7 * rrule.interval);
    if (Math.floor(weekAnchor.getTime() / 1000) > rangeEnd) break;
  }

  return results;
}

/**
 * Like parseVEvents but also expands RRULE recurring events for servers that
 * do not support CalDAV <C:expand> (Nextcloud, Fastmail, etc.).
 * When the server already expanded instances, they come back as multiple VEVENT
 * blocks → parseVEvents returns >1 → we skip expansion and return as-is.
 * rangeStart/rangeEnd are unix timestamps defining the query window.
 */
export function expandVEvents(
  icalData: string,
  href: string | undefined,
  rangeStart: number,
  rangeEnd: number,
): CalendarEventData[] {
  const events = parseVEvents(icalData, href);
  const debug = (globalThis as { __VELO_CALDAV_DEBUG__?: boolean }).__VELO_CALDAV_DEBUG__;

  if (events.length === 0) return [];

  // Exchange and many other CalDAV servers return a recurring series as:
  //   - one "master" VEVENT (carries the RRULE, no RECURRENCE-ID)
  //   - zero or more "override" VEVENTs (each with a RECURRENCE-ID matching the
  //     instance slot they replace; may have modified summary/time/etc.)
  // We must expand the master's RRULE AND splice in the overrides.
  const masters = events.filter((e) => e.recurrenceId == null);
  const overrides = events.filter((e) => e.recurrenceId != null);

  // Pathological: only overrides, no master → treat them as standalone events
  if (masters.length === 0) {
    if (debug) console.log("[caldav] orphan overrides", { href, count: overrides.length });
    return overrides.map((ov) => ({
      ...ov,
      remoteEventId: `${ov.uid ?? ov.remoteEventId}_${ov.recurrenceId}`,
    }));
  }

  // Multiple masters in one .ics: not expected from Exchange; bail out and
  // return everything as-is (likely already-expanded instances from a server
  // that uses <C:expand>).
  if (masters.length > 1) {
    if (debug) console.log("[caldav] multiple masters — returning as-is", { href, count: events.length });
    return events;
  }

  const master = masters[0]!;
  // RRULE/EXDATE may live in the wrapped master icalData (from parseVEvents) or
  // in the original blob if there's only one VEVENT. Look in both.
  const masterIcal = master.icalData ?? "";
  const rruleValue = extractRRuleValue(masterIcal) ?? extractRRuleValue(icalData);

  if (!rruleValue) {
    if (debug) {
      console.log("[caldav] no RRULE — returning master+overrides as-is", {
        href, summary: master.summary, overrides: overrides.length,
      });
    }
    return events;
  }

  const rrule = parseRRuleStr(rruleValue);
  if (!rrule) {
    if (debug) console.warn("[caldav] RRULE present but failed to parse", { href, rruleValue });
    return events;
  }

  const exDates = extractExDates(masterIcal);
  for (const ex of extractExDates(icalData)) exDates.add(ex);
  // Overrides replace specific slots — exclude those from RRULE expansion to
  // avoid showing both the original and the override.
  for (const ov of overrides) {
    if (ov.recurrenceId != null) exDates.add(ov.recurrenceId);
  }

  const duration = Math.max(0, master.endTime - master.startTime);
  const times = generateOccurrences(master.startTime, rrule, rangeStart, rangeEnd, exDates);

  if (debug) {
    console.log("[caldav] expanded RRULE", {
      href,
      summary: master.summary,
      rrule: rruleValue,
      parsedRrule: rrule,
      dtStart: new Date(master.startTime * 1000).toISOString(),
      rangeStart: new Date(rangeStart * 1000).toISOString(),
      rangeEnd: new Date(rangeEnd * 1000).toISOString(),
      occurrences: times.length,
      overrideCount: overrides.length,
      firstFew: times.slice(0, 5).map((t) => new Date(t * 1000).toISOString()),
    });
  }

  const generated: CalendarEventData[] = times.map((startTs) => ({
    ...master,
    startTime: startTs,
    endTime: startTs + duration,
    remoteEventId: `${master.uid ?? master.remoteEventId}_${startTs}`,
    recurrenceId: null,
  }));

  // Include overrides whose actual instance time falls inside the range
  const visibleOverrides = overrides
    .filter((ov) => ov.startTime < rangeEnd && ov.endTime > rangeStart)
    .map((ov) => ({
      ...ov,
      remoteEventId: `${ov.uid ?? ov.remoteEventId}_override_${ov.recurrenceId}`,
    }));

  return [...generated, ...visibleOverrides];
}

/** Extract the METHOD property from iCalendar data (REQUEST, REPLY, CANCEL, etc.) */
export function extractIcsMethod(icalData: string): string {
  const match = icalData.match(/^METHOD:(.+)$/im);
  return match?.[1] ? match[1].trim().toUpperCase() : "REQUEST";
}

/** Extract a meeting URL (Teams/Zoom/Meet/Webex) from iCalendar DESCRIPTION or LOCATION */
export function extractMeetingUrl(icalData: string): string | null {
  const meetingPatterns = [
    /https?:\/\/[^\s"<>]+\.zoom\.us\/[^\s"<>]+/i,
    /https?:\/\/teams\.microsoft\.com\/[^\s"<>]+/i,
    /https?:\/\/meet\.google\.com\/[a-z\-]+/i,
    /https?:\/\/[^\s"<>]+\.webex\.com\/[^\s"<>]+/i,
    /https?:\/\/[^\s"<>]+\.gotomeeting\.com\/[^\s"<>]+/i,
  ];
  const text = icalData.replace(/\r\n[ \t]/g, "").replace(/\\n/gi, " ");
  for (const pattern of meetingPatterns) {
    const m = text.match(pattern);
    if (m) return m[0].replace(/\\$/, "");
  }
  return null;
}

export interface RsvpReplyParams {
  uid: string;
  summary: string;
  dtstart: string;
  dtend: string;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeName?: string;
  partstat: "ACCEPTED" | "DECLINED" | "TENTATIVE";
}

/** Generate a METHOD:REPLY iCalendar string for responding to an invite */
export function generateRsvpReply(params: RsvpReplyParams): string {
  const { uid, summary, dtstart, dtend, organizerEmail, attendeeEmail, attendeeName, partstat } = params;
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "") + "Z";
  const cn = attendeeName ? `CN=${attendeeName};` : "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Velo Mail//Calendar//EN",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeICalText(summary)}`,
    `ORGANIZER:mailto:${organizerEmail}`,
    `ATTENDEE;${cn}PARTSTAT=${partstat};RSVP=FALSE:mailto:${attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

/** Unfold continuation lines (RFC 5545 §3.1) */
function unfoldLines(icalData: string): string[] {
  const raw = icalData.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return raw.split("\n").filter((l) => l.length > 0);
}

function formatDateTimeUTC(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseICalDateTime(value: string, isAllDay: boolean): number {
  if (isAllDay) {
    // Format: YYYYMMDD
    const y = parseInt(value.substring(0, 4), 10);
    const m = parseInt(value.substring(4, 6), 10) - 1;
    const d = parseInt(value.substring(6, 8), 10);
    return Math.floor(new Date(y, m, d).getTime() / 1000);
  }

  // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const isUTC = value.endsWith("Z");
  const cleaned = value.replace("Z", "");
  const y = parseInt(cleaned.substring(0, 4), 10);
  const m = parseInt(cleaned.substring(4, 6), 10) - 1;
  const d = parseInt(cleaned.substring(6, 8), 10);
  const h = parseInt(cleaned.substring(9, 11), 10);
  const min = parseInt(cleaned.substring(11, 13), 10);
  const s = parseInt(cleaned.substring(13, 15), 10) || 0;

  const date = isUTC
    ? new Date(Date.UTC(y, m, d, h, min, s))
    : new Date(y, m, d, h, min, s);

  return Math.floor(date.getTime() / 1000);
}
