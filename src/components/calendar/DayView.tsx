import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { t, getLocale } from "@/i18n";
import { CalendarX2, Video } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getMeetingUrl, isMeetingActive } from "@/utils/meetingUrl";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface DayViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  colorMap?: Record<string, string>;
  onEventClick: (event: DbCalendarEvent) => void;
  onDayClick?: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 84;
const MIN_EVENT_HEIGHT = 24;
const WEEK_RADIUS = 52; // ±52 weeks from today visible in the left list

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatWeekDateRange(start: Date, end: Date, locale: string): string {
  if (start.getMonth() === end.getMonth()) {
    const month = start.toLocaleDateString(locale, { month: "short" });
    return `${start.getDate()}–${end.getDate()} ${month}`;
  }
  const s = start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const e = end.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function getWeekLabel(weekStart: Date, todayWeekStart: Date, locale: string): string {
  const diffWeeks = Math.round(
    (weekStart.getTime() - todayWeekStart.getTime()) / (7 * 86400000),
  );
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  const range = formatWeekDateRange(weekStart, weekEnd, locale);

  if (diffWeeks === -1) return `${t("calendar.dayView.lastWeek")} (${range})`;
  if (diffWeeks === 0) return `${t("calendar.dayView.thisWeek")} (${range})`;
  if (diffWeeks === 1) return `${t("calendar.dayView.nextWeek")} (${range})`;
  return `${t("calendar.dayView.weekNumber", { n: String(getISOWeek(weekStart)) })} (${range})`;
}

export function DayView({
  currentDate,
  events,
  colorMap = {},
  onEventClick,
  onDayClick,
}: DayViewProps) {
  const locale = getLocale();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // todayWeekTs is STABLE — the list is always anchored to today
  const todayWeekTs = useMemo(() => getWeekStart(today).getTime(), [today]);
  const currentWeekTs = useMemo(() => getWeekStart(currentDate).getTime(), [currentDate]);

  // ── Left panel: fixed ±WEEK_RADIUS weeks from today ──────────────────
  const weeks = useMemo(() => {
    return Array.from({ length: WEEK_RADIUS * 2 + 1 }, (_, i) => {
      const weekStart = new Date(todayWeekTs + (i - WEEK_RADIUS) * 7 * 86400000);
      const days = Array.from({ length: 7 }, (_, d) => {
        const date = new Date(weekStart.getTime() + d * 86400000);
        const dayTs = Math.floor(date.getTime() / 1000);
        const dayEvents = events
          .filter((e) =>
            e.is_all_day
              ? e.start_time < dayTs + 86400 && e.end_time > dayTs
              : e.start_time >= dayTs && e.start_time < dayTs + 86400,
          )
          .sort((a, b) => {
            if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
            return a.start_time - b.start_time;
          });
        return { date, events: dayEvents };
      });
      return { weekStart, days };
    });
  }, [todayWeekTs, events]); // stable — does NOT depend on currentWeekTs

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const currentWeekRef = useRef<HTMLDivElement>(null);
  // When true, the next scroll-effect fires from a list-click and is suppressed
  const skipScrollRef = useRef(false);

  const scrollToCurrentWeek = useCallback(() => {
    if (leftScrollRef.current && currentWeekRef.current) {
      leftScrollRef.current.scrollTop = Math.max(
        0,
        currentWeekRef.current.offsetTop - 8,
      );
    }
  }, []);

  // Scroll when currentWeekTs changes, UNLESS triggered by a list-click
  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    scrollToCurrentWeek();
  }, [currentWeekTs, scrollToCurrentWeek]);

  // Initial scroll on mount
  useEffect(() => {
    scrollToCurrentWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = useCallback(
    (date: Date) => {
      // Same week → suppress scroll (user is already looking at it)
      if (getWeekStart(date).getTime() === currentWeekTs) {
        skipScrollRef.current = true;
      }
      onDayClick?.(date);
    },
    [currentWeekTs, onDayClick],
  );

  const todayStr = today.toDateString();
  const currentDateStr = currentDate.toDateString();

  // ── Right panel: time grid ───────────────────────────────────────────
  const dayStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentDate]);
  const dayTs = Math.floor(dayStart.getTime() / 1000);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const timed: DbCalendarEvent[] = [];
    const allDay: DbCalendarEvent[] = [];
    for (const e of events) {
      if (e.is_all_day) {
        if (e.start_time < dayTs + 86400 && e.end_time > dayTs) allDay.push(e);
      } else if (e.start_time >= dayTs && e.start_time < dayTs + 86400) {
        timed.push(e);
      }
    }
    return { timedEvents: timed, allDayEvents: allDay };
  }, [events, dayTs]);

  const isToday = currentDate.toDateString() === todayStr;
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const nowMinutes = useMemo(() => {
    const d = new Date(nowTs * 1000);
    return d.getHours() * 60 + d.getMinutes();
  }, [nowTs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Math.floor(Date.now() / 1000));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayMidnightTs = Math.floor(today.getTime() / 1000);

  useEffect(() => {
    if (!isToday || !rightScrollRef.current) return;
    rightScrollRef.current.scrollTop = Math.max(0, (nowMinutes / 60 - 2) * HOUR_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, currentDate]);

  const isoWeek = getISOWeek(currentDate);
  const weekSubtitle = t("calendar.dayView.weekSubtitle", {
    n: String(isoWeek),
    year: String(currentDate.getFullYear()),
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Left: scrollable week list ─────────────────────────────── */}
      <div
        ref={leftScrollRef}
        className="w-[340px] shrink-0 border-r border-border-primary overflow-y-auto bg-bg-secondary"
      >
        {weeks.map(({ weekStart, days }) => {
          const isCurrentWeek = weekStart.getTime() === currentWeekTs;
          const label = getWeekLabel(weekStart, new Date(todayWeekTs), locale);

          return (
            <div
              key={weekStart.getTime()}
              ref={isCurrentWeek ? currentWeekRef : undefined}
            >
              {/* Week header */}
              <div
                className={`px-4 py-2 text-[0.68rem] font-semibold sticky top-0 z-10 bg-bg-secondary border-b border-border-secondary ${
                  isCurrentWeek ? "text-accent" : "text-text-tertiary"
                }`}
              >
                {label}
              </div>

              {/* Day rows */}
              {days.map(({ date, events: dayEvents }) => {
                const isThisToday = date.toDateString() === todayStr;
                const isSelected = date.toDateString() === currentDateStr;
                const weekdayAbbr = date.toLocaleDateString(locale, { weekday: "short" });
                const monthAbbr = date
                  .toLocaleDateString(locale, { month: "short" })
                  .toUpperCase();

                return (
                  <div
                    key={date.getTime()}
                    onClick={() => handleDayClick(date)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") handleDayClick(date); }}
                    className={`w-full flex items-stretch border-b border-border-secondary cursor-pointer transition-colors hover:bg-bg-hover ${
                      isThisToday
                        ? "bg-accent/15"
                        : isSelected
                          ? "bg-bg-selected"
                          : ""
                    }`}
                  >
                    {/* Date column */}
                    <div
                      className={`w-14 shrink-0 flex flex-col items-center justify-center py-3 ${
                        isThisToday ? "text-accent" : "text-text-tertiary"
                      }`}
                    >
                      <span className="text-[0.6rem] font-medium leading-none mb-1">
                        {weekdayAbbr}
                      </span>
                      <span
                        className={`text-xl font-bold leading-none ${
                          isThisToday ? "text-accent" : "text-text-primary"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      <span className="text-[0.6rem] font-medium leading-none mt-1">
                        {monthAbbr}
                      </span>
                    </div>

                    {/* Events column */}
                    <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-0.5">
                      {dayEvents.length === 0 ? (
                        <span className="text-xs text-text-tertiary flex items-center gap-1.5 opacity-40 pl-2">
                          <CalendarX2 size={11} />
                          {t("calendar.dayView.noEvents")}
                        </span>
                      ) : (
                        dayEvents.map((e) => {
                          const c =
                            colorMap[e.calendar_id ?? ""] ?? "var(--color-accent)";
                          const prefix = e.is_all_day
                            ? t("calendar.dayView.allDayShort")
                            : new Date(e.start_time * 1000).toLocaleTimeString(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                          const meetingUrl = !e.is_all_day && e.start_time >= todayMidnightTs
                            ? getMeetingUrl(e)
                            : null;
                          const isActive = meetingUrl ? isMeetingActive(e, nowTs) : false;
                          return (
                            <div
                              key={e.id}
                              className="text-xs flex items-center gap-1 min-w-0"
                            >
                              <span className="w-14 shrink-0 text-center text-text-tertiary tabular-nums">
                                {prefix}
                              </span>
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: c }}
                              />
                              <span className="text-text-primary truncate flex-1">
                                {e.summary ?? t("calendar.eventFallback")}
                              </span>
                              {meetingUrl && (
                                <button
                                  onClick={(ev) => { ev.stopPropagation(); openUrl(meetingUrl).catch(() => {}); }}
                                  className={`ml-1 shrink-0 flex items-center gap-0.5 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full transition-all ${
                                    isActive
                                      ? "bg-accent text-white animate-pulse shadow-sm shadow-accent/40"
                                      : "bg-accent/15 text-accent hover:bg-accent/25"
                                  }`}
                                >
                                  <Video size={8} />
                                  {t("calendar.joinButton")}
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── Right: time grid ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div ref={rightScrollRef} className="flex-1 overflow-y-auto">
          {/* Sticky header */}
          <div className="sticky top-0 z-20 bg-bg-primary border-b border-border-primary">
            <div className="px-6 py-3 flex items-center gap-3">
              <div
                className={`text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full ${
                  isToday ? "bg-accent text-white" : "text-text-primary"
                }`}
              >
                {currentDate.getDate()}
              </div>
              <div>
                <div className="text-sm text-text-secondary leading-tight">
                  {currentDate.toLocaleDateString(locale, { weekday: "long" })}
                </div>
                <div className="text-[0.7rem] text-text-tertiary leading-tight mt-0.5">
                  {weekSubtitle}
                </div>
              </div>
            </div>

            {allDayEvents.length > 0 && (
              <div className="px-6 pb-2 space-y-1">
                {allDayEvents.map((e) => {
                  const c = colorMap[e.calendar_id ?? ""] ?? "var(--color-accent)";
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded transition-colors hover:opacity-80"
                      style={{ backgroundColor: `${c}1a`, color: c }}
                    >
                      {e.summary ?? t("calendar.eventFallback")} ·{" "}
                      {t("calendar.eventAllDay")}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Time grid */}
          <div className="relative flex">
            <div className="w-24 shrink-0 border-r border-border-secondary">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border-secondary px-2 relative"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {hour !== 0 && (
                    <span className="absolute -top-[9px] right-[10px] text-[0.625rem] text-text-tertiary leading-none">
                      {new Date(2000, 0, 1, hour).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border-secondary"
                  style={{ height: HOUR_HEIGHT }}
                />
              ))}

              {timedEvents.map((e) => {
                const c = colorMap[e.calendar_id ?? ""] ?? "var(--color-accent)";
                const startOffset = e.start_time - dayTs;
                const endTs = Math.min(e.end_time, dayTs + 86400);
                const top = (startOffset / 3600) * HOUR_HEIGHT;
                const height = Math.max(
                  ((endTs - e.start_time) / 3600) * HOUR_HEIGHT,
                  MIN_EVENT_HEIGHT,
                );
                const startLabel = new Date(e.start_time * 1000).toLocaleTimeString(
                  locale,
                  { hour: "2-digit", minute: "2-digit" },
                );
                const endLabel = new Date(e.end_time * 1000).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const meetingUrl = e.start_time >= todayMidnightTs ? getMeetingUrl(e) : null;
                const isActive = meetingUrl ? isMeetingActive(e, nowTs) : false;
                const showJoin = meetingUrl && height >= 48;
                return (
                  <div
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") onEventClick(e); }}
                    className="absolute inset-x-1 overflow-hidden rounded text-left transition-opacity hover:opacity-80 flex cursor-pointer"
                    style={{ top, height, backgroundColor: `${c}26` }}
                  >
                    <div
                      className="w-0.5 shrink-0 rounded-l"
                      style={{ backgroundColor: c }}
                    />
                    <div className="flex flex-col min-w-0 px-1.5 py-0.5 flex-1">
                      <div className="text-xs font-semibold leading-tight whitespace-nowrap text-text-tertiary">
                        {startLabel}–{endLabel}
                      </div>
                      <div className="text-xs leading-tight text-text-primary">
                        {e.summary ?? t("calendar.eventFallback")}
                        {e.location && (
                          <span className="opacity-70"> · {e.location}</span>
                        )}
                      </div>
                      {showJoin && (
                        <button
                          onClick={(ev) => { ev.stopPropagation(); openUrl(meetingUrl).catch(() => {}); }}
                          className={`mt-auto self-end mb-1 flex items-center gap-0.5 text-[0.6rem] font-semibold px-1.5 py-0.5 rounded-full transition-all ${
                            isActive
                              ? "bg-accent/90 text-white animate-pulse shadow-sm"
                              : "bg-black/10 text-text-primary hover:bg-black/20 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
                          }`}
                        >
                          <Video size={9} />
                          {t("calendar.joinButton")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isToday && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10 flex items-center -translate-y-1/2"
                style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT}px` }}
              >
                <div className="w-24 flex justify-end pr-1.5 shrink-0">
                  <span className="text-[0.6rem] font-semibold bg-accent text-white px-1 py-0.5 rounded leading-none">
                    {new Date(
                      2000,
                      0,
                      1,
                      Math.floor(nowMinutes / 60),
                      nowMinutes % 60,
                    ).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-accent -ml-0.5 shrink-0" />
                <div className="flex-1 h-px bg-accent" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
