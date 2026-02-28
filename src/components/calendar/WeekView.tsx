import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface WeekViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  onEventClick: (event: DbCalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ currentDate, events, onEventClick }: WeekViewProps) {
  const { t } = useTranslation("calendar");
  const dayNames = [t("daysShort.sun"), t("daysShort.mon"), t("daysShort.tue"), t("daysShort.wed"), t("daysShort.thu"), t("daysShort.fri"), t("daysShort.sat")];
  const weekStart = new Date(currentDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date();
  const todayStr = today.toDateString();

  // Pre-bucket events by day+hour and all-day per day (O(E) instead of O(168×E))
  const { dayHourEvents, allDayByDay } = useMemo(() => {
    const dhMap = new Map<string, DbCalendarEvent[]>();
    const adMap = new Map<number, DbCalendarEvent[]>();

    for (const day of days) {
      const dayTs = day.getTime() / 1000;
      const dayKey = day.getDate();

      for (const e of events) {
        if (e.is_all_day) {
          const dayEnd = dayTs + 86400;
          if (e.start_time < dayEnd && e.end_time > dayTs) {
            const list = adMap.get(dayKey);
            if (list) list.push(e);
            else adMap.set(dayKey, [e]);
          }
        } else {
          for (const hour of HOURS) {
            const hStart = dayTs + hour * 3600;
            const hEnd = hStart + 3600;
            if (e.start_time < hEnd && e.end_time > hStart) {
              const key = `${dayKey}-${hour}`;
              const list = dhMap.get(key);
              if (list) list.push(e);
              else dhMap.set(key, [e]);
            }
          }
        }
      }
    }

    return { dayHourEvents: dhMap, allDayByDay: adMap };
  }, [events, days]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border-primary shrink-0">
        <div className="border-r border-border-secondary" />
        {days.map((day, i) => {
          const isToday = day.toDateString() === todayStr;
          return (
            <div key={i} className="px-2 py-2 text-center border-r border-border-secondary">
              <div className="text-xs text-text-tertiary">{dayNames[day.getDay()]}</div>
              <div className={`text-sm font-medium mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full ${
                isToday ? "bg-accent text-white" : "text-text-primary"
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border-primary shrink-0">
        <div className="border-r border-border-secondary px-1 py-1 text-[0.625rem] text-text-tertiary">{t("allDay")}</div>
        {days.map((day, i) => {
          const allDay = allDayByDay.get(day.getDate()) ?? [];
          return (
            <div key={i} className="border-r border-border-secondary px-1 py-1 space-y-0.5">
              {allDay.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className="w-full text-left text-[0.625rem] px-1 py-0.5 rounded bg-accent/10 text-accent truncate hover:bg-accent/20 transition-colors"
                >
                  {e.summary ?? t("event")}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-r border-b border-border-secondary h-12 px-1 flex items-start justify-end">
                <span className="text-[0.625rem] text-text-tertiary -mt-1.5">
                  {hour === 0 ? "" : `${hour % 12 || 12}${hour < 12 ? t("am") : t("pm")}`}
                </span>
              </div>
              {days.map((day, di) => {
                const hourEvents = dayHourEvents.get(`${day.getDate()}-${hour}`) ?? [];
                return (
                  <div key={di} className="border-r border-b border-border-secondary h-12 relative px-0.5">
                    {hourEvents.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        className="absolute inset-x-0.5 text-[0.625rem] px-1 py-0.5 rounded bg-accent/15 text-accent truncate hover:bg-accent/25 transition-colors"
                        title={e.summary ?? t("event")}
                      >
                        {e.summary ?? t("event")}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
