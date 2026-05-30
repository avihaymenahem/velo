import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { t } from "@/i18n";
import { useAccountStore } from "@/stores/accountStore";
import { getCalendarEventsInRangeForCalendars, upsertCalendarEvent, type DbCalendarEvent } from "@/services/db/calendarEvents";
import { getVisibleCalendars, getCalendarsForAccount, upsertCalendar, calColor, type DbCalendar } from "@/services/db/calendars";
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

  // In unified mode (activeAccountId = null), target all accounts
  const targetAccountIds = useMemo(() => {
    if (activeAccountId) return [activeAccountId];
    return accounts.map((a) => a.id);
  }, [activeAccountId, accounts]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>("month");
  const [events, setEvents] = useState<DbCalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<DbCalendar[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<DbCalendarEvent | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthAccountId, setReauthAccountId] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [showCalendarList, setShowCalendarList] = useState(false);
  const [hasCalendar, setHasCalendar] = useState(true);
  const reauthDoneRef = useRef(false);

  const colorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const cal of calendars) {
      const color = calColor(cal);
      if (color) map[cal.id] = color;
    }
    return map;
  }, [calendars]);

  const getRange = useCallback((): { start: Date; end: Date } => {
    const d = new Date(currentDate);
    if (view === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      // Monday-first: pad back to the previous Monday
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      // Pad forward to the next Sunday
      end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (view === "week") {
      const start = new Date(d);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    // Day view: fetch ±8 weeks from today (list shows ±52 but syncs ±8)
    const todayForDay = new Date();
    todayForDay.setHours(0, 0, 0, 0);
    const dayOffset = (todayForDay.getDay() + 6) % 7;
    const weekStart = new Date(todayForDay);
    weekStart.setDate(weekStart.getDate() - dayOffset - 56); // 8 weeks back
    const weekEnd = new Date(todayForDay);
    weekEnd.setDate(weekEnd.getDate() - dayOffset + 6 + 56); // 8 weeks forward
    weekEnd.setHours(23, 59, 59, 999);
    return { start: weekStart, end: weekEnd };
  }, [currentDate, view]);

  const loadCalendars = useCallback(async () => {
    const allCals: DbCalendar[] = [];
    let anySupported = false;
    for (const accountId of targetAccountIds) {
      try {
        const supported = await hasCalendarSupport(accountId);
        if (!supported) continue;
        anySupported = true;
        const cals = await getCalendarsForAccount(accountId);
        allCals.push(...cals);
      } catch {
        // ignore per-account errors
      }
    }
    setHasCalendar(anySupported);
    setCalendars(allCals);
  }, [targetAccountIds]);

  const loadEvents = useCallback(async () => {
    setLoading(true);

    const { start, end } = getRange();
    const startTs = Math.floor(start.getTime() / 1000);
    const endTs = Math.floor(end.getTime() / 1000);

    // Load from local cache first (across all target accounts)
    try {
      const allVisibleCals: DbCalendar[] = [];
      for (const accountId of targetAccountIds) {
        const supported = await hasCalendarSupport(accountId);
        if (!supported) continue;
        const visible = await getVisibleCalendars(accountId);
        allVisibleCals.push(...visible);
      }
      const calendarIds = allVisibleCals.map((c) => c.id);
      if (calendarIds.length > 0) {
        const cached = await getCalendarEventsInRangeForCalendars(calendarIds, startTs, endTs);
        setEvents(cached);
      }
    } catch {
      // ignore cache errors
    }

    // Fetch from provider API per account
    let firstReauthAccountId: string | null = null;
    for (const accountId of targetAccountIds) {
      try {
        const supported = await hasCalendarSupport(accountId);
        if (!supported) continue;

        const provider = await getCalendarProvider(accountId);

        // Discover/update calendars
        const providerCalendars = await provider.listCalendars();
        for (const cal of providerCalendars) {
          await upsertCalendar({
            accountId,
            provider: provider.type,
            remoteId: cal.remoteId,
            displayName: cal.displayName,
            color: cal.color,
            isPrimary: cal.isPrimary,
          });
        }

        // Fetch events for visible calendars
        const visibleCals = await getVisibleCalendars(accountId);
        for (const cal of visibleCals) {
          const apiEvents = await provider.fetchEvents(
            cal.remote_id,
            start.toISOString(),
            end.toISOString(),
          );
          for (const event of apiEvents) {
            await upsertCalendarEventFromProvider(accountId, cal.id, event);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("403") || message.includes("insufficient")) {
          if (!firstReauthAccountId) firstReauthAccountId = accountId;
        } else {
          console.error(`Failed to load calendar events for account ${accountId}:`, err);
        }
      }
    }

    // Reload calendars and events from DB after API sync
    try {
      const allCals: DbCalendar[] = [];
      for (const accountId of targetAccountIds) {
        const supported = await hasCalendarSupport(accountId);
        if (!supported) continue;
        const cals = await getCalendarsForAccount(accountId);
        allCals.push(...cals);
      }
      setCalendars(allCals);

      const allVisibleCals: DbCalendar[] = [];
      for (const accountId of targetAccountIds) {
        const supported = await hasCalendarSupport(accountId);
        if (!supported) continue;
        const visible = await getVisibleCalendars(accountId);
        allVisibleCals.push(...visible);
      }
      const calendarIds = allVisibleCals.map((c) => c.id);
      if (calendarIds.length > 0) {
        const fresh = await getCalendarEventsInRangeForCalendars(calendarIds, startTs, endTs);
        setEvents(fresh);
      }
    } catch {
      // ignore
    }

    if (firstReauthAccountId) {
      if (reauthDoneRef.current) {
        reauthDoneRef.current = false;
        setCalendarError(
          "Calendar access is still denied after re-authorization. " +
          "Make sure the Google Calendar API is enabled in your Google Cloud Console project.",
        );
      } else {
        setNeedsReauth(true);
        setReauthAccountId(firstReauthAccountId);
      }
    } else {
      setNeedsReauth(false);
      setCalendarError(null);
    }

    setLoading(false);
  }, [targetAccountIds, getRange]);

  useEffect(() => {
    loadCalendars();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId, accounts, currentDate, view]);

  const handlePrev = useCallback(() => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() - 1);
      else if (view === "week") next.setDate(next.getDate() - 7);
      else next.setDate(next.getDate() - 7);
      return next;
    });
  }, [view]);

  const handleNext = useCallback(() => {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() + 1);
      else if (view === "week") next.setDate(next.getDate() + 7);
      else next.setDate(next.getDate() + 7);
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
    // In unified mode, pick the account from the selected calendar
    let targetAccountId = activeAccountId;
    if (!targetAccountId && eventData.calendarId) {
      const cal = calendars.find((c) => c.id === eventData.calendarId);
      targetAccountId = cal?.account_id ?? null;
    }
    if (!targetAccountId) {
      // Fall back to first account with calendar support
      for (const accountId of targetAccountIds) {
        const supported = await hasCalendarSupport(accountId);
        if (supported) { targetAccountId = accountId; break; }
      }
    }
    if (!targetAccountId) return;

    try {
      const provider = await getCalendarProvider(targetAccountId);
      let calendarRemoteId: string | undefined;
      let calendarDbId: string | undefined;
      if (eventData.calendarId) {
        const cal = calendars.find((c) => c.id === eventData.calendarId);
        if (cal) { calendarRemoteId = cal.remote_id; calendarDbId = cal.id; }
      }
      if (!calendarRemoteId) {
        const primary = calendars.find((c) => c.account_id === targetAccountId && c.is_primary)
          ?? calendars.find((c) => c.account_id === targetAccountId);
        if (primary) { calendarRemoteId = primary.remote_id; calendarDbId = primary.id; }
      }
      if (!calendarRemoteId) calendarRemoteId = "primary";

      const input: CreateEventInput = {
        summary: eventData.summary,
        description: eventData.description || undefined,
        location: eventData.location || undefined,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
      };

      const created = await provider.createEvent(calendarRemoteId, input);
      await upsertCalendarEventFromProvider(targetAccountId, calendarDbId ?? null, created);

      setShowCreate(false);
      loadEvents();
    } catch (err) {
      console.error("Failed to create event:", err);
    }
  }, [activeAccountId, targetAccountIds, calendars, loadEvents]);

  const handleEventClick = useCallback((event: DbCalendarEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleEventUpdated = useCallback(() => {
    setSelectedEvent(null);
    loadEvents();
  }, [loadEvents]);

  const reauthAccount = reauthAccountId
    ? (accounts.find((a) => a.id === reauthAccountId) ?? activeAccount)
    : activeAccount;

  if (!hasCalendar) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
        <div className="text-center">
          <p>{t("calendar.notConfigured")}</p>
          <p className="mt-1 text-xs">{t("calendar.notConfiguredHint")}</p>
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
        onDateSelect={setCurrentDate}
        onToggleCalendarList={() => setShowCalendarList((v) => !v)}
        showCalendarListButton={calendars.length > 1}
      />

      {needsReauth && reauthAccount && (
        <CalendarReauthBanner
          accountId={reauthAccount.id}
          email={reauthAccount.email}
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
            <p className="text-sm font-medium text-text-primary">{t("calendar.calendarAccessError")}</p>
            <p className="text-xs text-text-secondary mt-1">{calendarError}</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {view === "month" && (
            <MonthView
              currentDate={currentDate}
              events={events}
              colorMap={colorMap}
              onEventClick={handleEventClick}
            />
          )}
          {view === "week" && (
            <WeekView
              currentDate={currentDate}
              events={events}
              colorMap={colorMap}
              onEventClick={handleEventClick}
            />
          )}
          {view === "day" && (
            <DayView
              currentDate={currentDate}
              events={events}
              colorMap={colorMap}
              onEventClick={handleEventClick}
              onDayClick={setCurrentDate}
            />
          )}
        </div>

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

        {loading && events.length === 0 && (
          <div className="absolute bottom-3 left-3 text-[0.625rem] text-text-tertiary pointer-events-none">
            {t("calendar.loadingCalendar")}
          </div>
        )}
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
          accountId={selectedEvent.account_id}
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
