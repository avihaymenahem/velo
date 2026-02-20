import { useState, useEffect, useCallback, useRef } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { getCalendarEventsInRangeMulti, upsertCalendarEvent, type DbCalendarEvent } from "@/services/db/calendarEvents";
import { getVisibleCalendars, getCalendarsForAccount, upsertCalendar, type DbCalendar } from "@/services/db/calendars";
import { getCalendarProvider, hasCalendarSupport } from "@/services/calendar/providerFactory";
import type { CalendarEventData, CreateEventInput } from "@/services/calendar/types";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventCreateModal } from "./EventCreateModal";
import { EventDetailModal } from "./EventDetailModal";
import { CalendarList } from "./CalendarList";
import { CalendarReauthBanner } from "./CalendarReauthBanner";

export function CalendarPage() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<DbCalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<DbCalendar[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DbCalendarEvent | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [showCalendarList, setShowCalendarList] = useState(false);
  const [hasCalendar, setHasCalendar] = useState(true);
  const reauthDoneRef = useRef(false);

  const getRange = useCallback((): { start: Date; end: Date } => {
    const d = new Date(currentDate);
    if (view === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setDate(end.getDate() + (6 - end.getDay()));
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (view === "week") {
      const start = new Date(d);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [currentDate, view]);

  const loadCalendars = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const supported = await hasCalendarSupport(activeAccountId);
      setHasCalendar(supported);
      if (!supported) return;

      const cals = await getCalendarsForAccount(activeAccountId);
      setCalendars(cals);
    } catch {
      // ignore
    }
  }, [activeAccountId]);

  const loadEvents = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);

    const { start, end } = getRange();
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    // Load from local cache first
    try {
      const visibleCals = await getVisibleCalendars(activeAccountId);
      const calendarIds = visibleCals.map((c) => c.id);
      const cached = await getCalendarEventsInRangeMulti(activeAccountId, calendarIds, startTs, endTs);
      setEvents(cached);
    } catch {
      // ignore cache errors
    }

    // Fetch from provider API
    try {
      const supported = await hasCalendarSupport(activeAccountId);
      if (!supported) {
        setLoading(false);
        return;
      }

      const provider = await getCalendarProvider(activeAccountId);

      // Discover/update calendars
      const providerCalendars = await provider.listCalendars();
      for (const cal of providerCalendars) {
        await upsertCalendar({
          accountId: activeAccountId,
          provider: provider.type,
          remoteId: cal.remoteId,
          displayName: cal.displayName,
          color: cal.color,
          isPrimary: cal.isPrimary,
        });
      }

      // Reload calendars from DB
      const allCals = await getCalendarsForAccount(activeAccountId);
      setCalendars(allCals);

      // Fetch events for visible calendars
      const visibleCals = await getVisibleCalendars(activeAccountId);
      for (const cal of visibleCals) {
        const apiEvents = await provider.fetchEvents(
          cal.remote_id,
          start.toISOString(),
          end.toISOString(),
        );

        for (const event of apiEvents) {
          await upsertCalendarEventFromProvider(activeAccountId, cal.id, event);
        }
      }

      // Reload events from DB
      const calendarIds = visibleCals.map((c) => c.id);
      const fresh = await getCalendarEventsInRangeMulti(activeAccountId, calendarIds, startTs, endTs);
      setEvents(fresh);
      setNeedsReauth(false);
      setCalendarError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("403") || message.includes("insufficient")) {
        if (reauthDoneRef.current) {
          reauthDoneRef.current = false;
          setCalendarError(
            "Calendar access is still denied after re-authorization. " +
            "Make sure the Google Calendar API is enabled in your Google Cloud Console project. " +
            "Visit console.cloud.google.com → APIs & Services → Enable the \"Google Calendar API\".",
          );
        } else {
          setNeedsReauth(true);
        }
      } else {
        console.error("Failed to load calendar events:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, getRange]);

  useEffect(() => {
    loadCalendars();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, currentDate, view]);

  const handlePrev = useCallback(() => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() - 1);
      else if (view === "week") next.setDate(next.getDate() - 7);
      else next.setDate(next.getDate() - 1);
      return next;
    });
  }, [view]);

  const handleNext = useCallback(() => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() + 1);
      else if (view === "week") next.setDate(next.getDate() + 7);
      else next.setDate(next.getDate() + 1);
      return next;
    });
  }, [view]);

  const handleToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleCreateEvent = useCallback(async (eventData: {
    summary: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
    calendarId?: string;
  }) => {
    if (!activeAccountId) return;
    try {
      const provider = await getCalendarProvider(activeAccountId);

      // Find the target calendar
      let calendarRemoteId: string | undefined;
      let calendarDbId: string | undefined;
      if (eventData.calendarId) {
        const cal = calendars.find((c) => c.id === eventData.calendarId);
        if (cal) {
          calendarRemoteId = cal.remote_id;
          calendarDbId = cal.id;
        }
      }

      // Fallback to primary calendar
      if (!calendarRemoteId) {
        const primary = calendars.find((c) => c.is_primary) ?? calendars[0];
        if (primary) {
          calendarRemoteId = primary.remote_id;
          calendarDbId = primary.id;
        }
      }

      if (!calendarRemoteId) {
        // For Google, use "primary" as fallback
        calendarRemoteId = "primary";
      }

      const input: CreateEventInput = {
        summary: eventData.summary,
        description: eventData.description || undefined,
        location: eventData.location || undefined,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
      };

      const created = await provider.createEvent(calendarRemoteId, input);

      // Save to local DB
      await upsertCalendarEventFromProvider(activeAccountId, calendarDbId ?? null, created);

      setShowCreate(false);
      loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
  }, [activeAccountId, calendars, loadEvents]);

  const handleEventClick = useCallback((event: DbCalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleEventUpdated = useCallback(() => {
    setSelectedEvent(null);
    loadEvents();
  }, [loadEvents]);

  if (!activeAccountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Connect an account to use Calendar
      </div>
    );
  }

  if (!hasCalendar) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        <div className="text-center">
          <p>Calendar is not configured for this account.</p>
          <p className="mt-1 text-xs">For IMAP accounts, configure CalDAV in Settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-bg-primary">
      <CalendarToolbar
        currentDate={currentDate}
        view={view}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onViewChange={setView}
        onCreateEvent={() => setShowCreate(true)}
        onToggleCalendarList={() => setShowCalendarList((v) => !v)}
        showCalendarListButton={calendars.length > 1}
      />

      {needsReauth && activeAccount && (
        <CalendarReauthBanner
          accountId={activeAccount.id}
          email={activeAccount.email}
          onReauthSuccess={() => {
            reauthDoneRef.current = true;
            setNeedsReauth(false);
            setCalendarError(null);
            loadEvents();
          }}
        />
      )}

      {calendarError && !needsReauth && (
        <div className="mx-6 my-4 p-4 rounded-lg bg-danger/10 border border-danger/30 flex items-start gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Calendar access error</p>
            <p className="text-xs text-text-secondary mt-1">{calendarError}</p>
          </div>
        </div>
      )}

      {loading && events.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
          Loading calendar...
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {showCalendarList && calendars.length > 1 && (
          <CalendarList
            calendars={calendars}
            onVisibilityChange={async (calendarId, visible) => {
              const { setCalendarVisibility } = await import("@/services/db/calendars");
              await setCalendarVisibility(calendarId, visible);
              await loadCalendars();
              loadEvents();
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              onEventClick={handleEventClick}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              onEventClick={handleEventClick}
            />
          )}
          {view === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {showCreate && (
        <EventCreateModal
          calendars={calendars}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateEvent}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          calendars={calendars}
          accountId={activeAccountId}
          onClose={() => setSelectedEvent(null)}
          onUpdated={handleEventUpdated}
        />
      )}
    </div>
  );
}

async function upsertCalendarEventFromProvider(
  accountId: string,
  calendarId: string | null,
  event: CalendarEventData,
): Promise<void> {
  await upsertCalendarEvent({
    accountId,
    googleEventId: event.remoteEventId,
    summary: event.summary,
    description: event.description,
    location: event.location,
    startTime: event.startTime,
    endTime: event.endTime,
    isAllDay: event.isAllDay,
    status: event.status,
    organizerEmail: event.organizerEmail,
    attendeesJson: event.attendeesJson,
    htmlLink: event.htmlLink,
    calendarId,
    remoteEventId: event.remoteEventId,
    etag: event.etag,
    icalData: event.icalData,
    uid: event.uid,
  });
}
