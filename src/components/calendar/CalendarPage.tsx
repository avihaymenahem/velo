import { useState, useEffect, useCallback, useRef } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { getGmailClient } from "@/services/gmail/tokenManager";
import { listCalendarEvents, createCalendarEvent } from "@/services/google/calendar";
import { upsertCalendarEvent, getCalendarEventsInRange, type DbCalendarEvent } from "@/services/db/calendarEvents";
import { CalendarToolbar, type CalendarView } from "./CalendarToolbar";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventCreateModal } from "./EventCreateModal";
import { CalendarReauthBanner } from "./CalendarReauthBanner";

export function CalendarPage() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<DbCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const reauthDoneRef = useRef(false);

  const getRange = useCallback((): { start: Date; end: Date } => {
    const d = new Date(currentDate);
    if (view === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay()); // include prev month days
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      end.setDate(end.getDate() + (6 - end.getDay())); // include next month days
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
    // day
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [currentDate, view]);

  const loadEvents = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);

    const { start, end } = getRange();
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    // Load from local cache first
    try {
      const cached = await getCalendarEventsInRange(activeAccountId, startTs, endTs);
      setEvents(cached);
    } catch {
      // ignore cache errors
    }

    // Fetch from API
    try {
      const client = await getGmailClient(activeAccountId);
      const apiEvents = await listCalendarEvents(
        client,
        start.toISOString(),
        end.toISOString(),
      );

      // Upsert into local DB
      for (const event of apiEvents) {
        const startTime = event.start.dateTime
          ? Math.floor(new Date(event.start.dateTime).getTime() / 1000)
          : Math.floor(new Date(event.start.date + "T00:00:00").getTime() / 1000);
        const endTime = event.end.dateTime
          ? Math.floor(new Date(event.end.dateTime).getTime() / 1000)
          : Math.floor(new Date(event.end.date + "T23:59:59").getTime() / 1000);

        await upsertCalendarEvent({
          accountId: activeAccountId,
          googleEventId: event.id,
          summary: event.summary ?? null,
          description: event.description ?? null,
          location: event.location ?? null,
          startTime,
          endTime,
          isAllDay: !!event.start.date,
          status: event.status ?? "confirmed",
          organizerEmail: event.organizer?.email ?? null,
          attendeesJson: event.attendees ? JSON.stringify(event.attendees) : null,
          htmlLink: event.htmlLink ?? null,
        });
      }

      // Reload from DB to get consistent data
      const fresh = await getCalendarEventsInRange(activeAccountId, startTs, endTs);
      setEvents(fresh);
      setNeedsReauth(false);
      setCalendarError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("403") || message.includes("insufficient")) {
        if (reauthDoneRef.current) {
          // Already re-authorized but still failing — not a scope issue
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
    loadEvents();
  }, [loadEvents]);

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
  }) => {
    if (!activeAccountId) return;
    try {
      const client = await getGmailClient(activeAccountId);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await createCalendarEvent(client, {
        summary: eventData.summary,
        description: eventData.description || undefined,
        location: eventData.location || undefined,
        start: { dateTime: new Date(eventData.startTime).toISOString(), timeZone: tz },
        end: { dateTime: new Date(eventData.endTime).toISOString(), timeZone: tz },
      });
      setShowCreate(false);
      loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
  }, [activeAccountId, loadEvents]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEventClick = useCallback((_event: DbCalendarEvent) => {
    // Could open event detail modal - for now just a placeholder
  }, []);

  if (!activeAccountId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        Connect an account to use Calendar
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

      {showCreate && (
        <EventCreateModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateEvent}
        />
      )}
    </div>
  );
}
