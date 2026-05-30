import { useMemo, useRef, useEffect, useState } from "react";
import { t, getLocale } from "@/i18n";
import { Video } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getMeetingUrl, isMeetingActive } from "@/utils/meetingUrl";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface WeekViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  colorMap?: Record<string, string>;
  onEventClick: (event: DbCalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 72; // 1.5× the original 48px
const MIN_EVENT_HEIGHT = 20;
// Monday-first week — Jan 2 2023 is a Monday, so i+2 maps to Mon..Sun
const DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, i + 2).toLocaleDateString(undefined, { weekday: "short" }),
);

export function WeekView({ currentDate, events, colorMap = {}, onEventClick }: WeekViewProps) {
  const weekStart = new Date(currentDate);
  // Roll back to Monday: Mon→0, Tue→1, ..., Sun→6
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date();
  const todayStr = today.toDateString();
  const isCurrentWeek = days.some((d) => d.toDateString() === todayStr);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
      setNowTs(Math.floor(Date.now() / 1000));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const todayMidnightTs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, []);

  useEffect(() => {
    if (!isCurrentWeek || !scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, (nowMinutes / 60 - 2) * HOUR_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentWeek]);

  const { allDayByDay, timedByDay } = useMemo(() => {
    const adMap = new Map<number, DbCalendarEvent[]>();
    const tdMap = new Map<number, DbCalendarEvent[]>();

    for (const day of days) {
      const dayTs = day.getTime() / 1000;
      const dayKey = day.getDate();

      for (const e of events) {
        if (e.is_all_day) {
          if (e.start_time < dayTs + 86400 && e.end_time > dayTs) {
            const list = adMap.get(dayKey);
            if (list) list.push(e);
            else adMap.set(dayKey, [e]);
          }
        } else {
          if (e.start_time >= dayTs && e.start_time < dayTs + 86400) {
            const list = tdMap.get(dayKey);
            if (list) list.push(e);
            else tdMap.set(dayKey, [e]);
          }
        }
      }
    }

    return { allDayByDay: adMap, timedByDay: tdMap };
  }, [events, days]);

  const locale = getLocale();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Sticky day headers + all-day row sit inside a single scroll container
          so the scrollbar width never misaligns headers with the time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* Day headers — sticky */}
        <div className="sticky top-0 z-20 bg-bg-primary grid grid-cols-[90px_repeat(7,1fr)] border-b border-border-primary">
          <div className="border-r border-border-secondary" />
          {days.map((day, i) => {
            const isToday = day.toDateString() === todayStr;
            return (
              <div key={i} className="px-2 py-2 text-center border-r border-border-secondary">
                <div className="text-xs text-text-tertiary">{DAY_NAMES[(day.getDay() + 6) % 7]}</div>
                <div className={`text-sm font-medium mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full ${
                  isToday ? "bg-accent text-white" : "text-text-primary"
                }`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* All-day events row — sticky below day headers */}
        <div className="sticky top-[52px] z-20 bg-bg-primary grid grid-cols-[90px_repeat(7,1fr)] border-b border-border-primary">
          <div className="border-r border-border-secondary px-1 py-1 text-[0.625rem] text-text-tertiary flex items-center justify-center">{t("calendar.allDayLabel")}</div>
          {days.map((day, i) => {
            const allDay = allDayByDay.get(day.getDate()) ?? [];
            return (
              <div key={i} className="border-r border-border-secondary px-1 py-1 space-y-0.5">
                {allDay.map((e) => {
                  const c = colorMap[e.calendar_id ?? ""] ?? "var(--color-accent)";
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="w-full text-left text-[0.625rem] px-1 py-0.5 rounded truncate transition-colors hover:opacity-80"
                      style={{ backgroundColor: `${c}1a`, color: c }}
                    >
                      {e.summary ?? t("calendar.eventFallback")}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative">
          {/* Background: hour label column + 7 day columns with horizontal lines */}
          <div className="grid grid-cols-[90px_repeat(7,1fr)]">
            {HOURS.map((hour) => (
              <div key={hour} className="contents">
                <div className="border-r border-b border-border-secondary px-1 relative" style={{ height: HOUR_HEIGHT }}>
                  {hour !== 0 && (
                    <span className="absolute -top-[9px] right-[10px] text-[0.625rem] text-text-tertiary leading-none">
                      {new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {days.map((day, di) => {
                  const isColToday = day.toDateString() === todayStr;
                  return (
                    <div
                      key={di}
                      className={`border-r border-b border-border-secondary ${
                        isColToday ? "bg-black/[0.06] dark:bg-black/[0.15]" : ""
                      }`}
                      style={{ height: HOUR_HEIGHT }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Event overlay — absolutely positioned on top of the background grid */}
          <div
            className="absolute top-0 left-[90px] right-0 flex pointer-events-none"
            style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}
          >
            {days.map((day, di) => {
              const dayTs = day.getTime() / 1000;
              const dayEvents = timedByDay.get(day.getDate()) ?? [];
              return (
                <div key={di} className="flex-1 relative">
                  {dayEvents.map((e) => {
                    const c = colorMap[e.calendar_id ?? ""] ?? "var(--color-accent)";
                    const startOffset = e.start_time - dayTs;
                    const endTs = Math.min(e.end_time, dayTs + 86400);
                    const top = (startOffset / 3600) * HOUR_HEIGHT;
                    const height = Math.max(((endTs - e.start_time) / 3600) * HOUR_HEIGHT, MIN_EVENT_HEIGHT);
                    const startLabel = new Date(e.start_time * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
                    const endLabel = new Date(e.end_time * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
                    const meetingUrl = getMeetingUrl(e);
                    const isUpcoming = e.start_time >= todayMidnightTs;
                    const isActive = meetingUrl && isMeetingActive(e, nowTs);
                    const showJoin = meetingUrl && isUpcoming && height >= 48;
                    return (
                      <div
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") onEventClick(e); }}
                        className="pointer-events-auto absolute inset-x-0.5 overflow-hidden rounded text-left transition-opacity hover:opacity-80 flex cursor-pointer"
                        style={{ top, height, backgroundColor: `${c}26` }}
                      >
                        <div className="w-0.5 shrink-0 rounded-l" style={{ backgroundColor: c }} />
                        <div className="flex flex-col min-w-0 px-1 py-0.5 flex-1">
                          <div className="text-[0.625rem] font-semibold leading-tight whitespace-nowrap text-text-tertiary">
                            {startLabel}–{endLabel}
                          </div>
                          <div className="text-[0.625rem] leading-tight text-text-primary">
                            {e.summary ?? t("calendar.eventFallback")}
                          </div>
                          {showJoin && (
                            <button
                              onClick={(ev) => { ev.stopPropagation(); openUrl(meetingUrl).catch(() => {}); }}
                              className={`mt-auto self-end mb-1 flex items-center gap-0.5 text-[0.55rem] font-semibold px-1 py-0.5 rounded transition-all ${
                                isActive
                                  ? "bg-accent/90 text-white animate-pulse shadow-sm"
                                  : "bg-black/10 text-text-primary hover:bg-black/20 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
                              }`}
                            >
                              <Video size={8} />
                              {t("calendar.joinButton")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Current time indicator — spans the full width of the time grid */}
          {isCurrentWeek && (
            <div
              className="absolute left-0 right-0 pointer-events-none z-10 flex items-center -translate-y-1/2"
              style={{ top: `${(nowMinutes / 60) * HOUR_HEIGHT}px` }}
            >
              <div className="w-[90px] flex justify-end pr-1.5 shrink-0">
                <span className="text-[0.6rem] font-semibold bg-accent text-white px-1 py-0.5 rounded leading-none">
                  {new Date(2000, 0, 1, Math.floor(nowMinutes / 60), nowMinutes % 60).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-accent -ml-0.5 shrink-0" />
              <div className="flex-1 h-px bg-accent" />
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
