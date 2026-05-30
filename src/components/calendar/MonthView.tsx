import { useMemo } from "react";
import { t } from "@/i18n";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";
import { EventCard } from "./EventCard";

interface MonthViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  colorMap?: Record<string, string>;
  onEventClick: (event: DbCalendarEvent) => void;
}

// Monday-first week — Jan 2 2023 is a Monday, so i+2 maps to Mon..Sun
const DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, i + 2).toLocaleDateString(undefined, { weekday: "short" }),
);

export function MonthView({ currentDate, events, colorMap = {}, onEventClick }: MonthViewProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday-first: Mon→0, Tue→1, ..., Sun→6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  // Build grid of weeks
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Pre-bucket events by day (O(E×D) → O(E)) instead of filtering per cell
  const eventsByDay = useMemo(() => {
    const map = new Map<number, DbCalendarEvent[]>();
    for (let d = 1; d <= totalDays; d++) {
      const dayStart = new Date(year, month, d).getTime() / 1000;
      const dayEnd = new Date(year, month, d + 1).getTime() / 1000;
      const dayEvents = events.filter((e) => e.start_time < dayEnd && e.end_time > dayStart);
      if (dayEvents.length > 0) map.set(d, dayEvents);
    }
    return map;
  }, [events, year, month, totalDays]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border-primary">
        {DAY_NAMES.map((name) => (
          <div key={name} className="px-2 py-2 text-xs font-medium text-text-tertiary text-center">
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto">
        {cells.map((day, idx) => {
          const isWeekend = idx % 7 >= 5;

          if (day === null) {
            const outBg = isWeekend
              ? "bg-black/[0.06] dark:bg-white/[0.09]"
              : "bg-black/[0.04] dark:bg-white/[0.03]";
            return <div key={`empty-${idx}`} className={`border-b border-r border-border-secondary ${outBg}`} />;
          }

          const isToday = `${year}-${month}-${day}` === todayStr;
          const dayEvents = eventsByDay.get(day) ?? [];

          const cellBg = isToday
            ? "bg-white/35 dark:bg-black/20"
            : isWeekend
              ? "bg-black/[0.05] dark:bg-white/[0.02]"
              : "";

          return (
            <div
              key={day}
              className={`border-b border-r border-border-secondary p-1 min-h-[80px] ${cellBg}`}
            >
              <div className="flex justify-end mb-1">
                <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-accent text-white" : "text-text-secondary"
                  }`}>
                  {day}
                </div>
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    compact
                    color={colorMap[event.calendar_id ?? ""]}
                    onClick={() => onEventClick(event)}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[0.625rem] text-text-tertiary pl-1">
                    {t("calendar.moreEvents", { count: dayEvents.length - 3 })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
