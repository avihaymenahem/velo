import { useMemo } from "react";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface DayViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  onEventClick: (event: DbCalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ currentDate, events, onEventClick }: DayViewProps) {
  const dayStart = new Date(currentDate);
  dayStart.setHours(0, 0, 0, 0);

  // Pre-bucket events by hour (O(E) instead of O(24×E))
  const { hourEvents: hourEventMap, allDayEvents } = useMemo(() => {
    const hMap = new Map<number, DbCalendarEvent[]>();
    const allDay: DbCalendarEvent[] = [];
    const dayTs = dayStart.getTime() / 1000;

    for (const e of events) {
      if (e.is_all_day) {
        allDay.push(e);
      } else {
        for (const hour of HOURS) {
          const hStart = dayTs + hour * 3600;
          const hEnd = hStart + 3600;
          if (e.start_time < hEnd && e.end_time > hStart) {
            const list = hMap.get(hour);
            if (list) list.push(e);
            else hMap.set(hour, [e]);
          }
        }
      }
    }

    return { hourEvents: hMap, allDayEvents: allDay };
  }, [events, dayStart]);
  const isToday = new Date().toDateString() === currentDate.toDateString();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border-primary flex items-center gap-3 shrink-0">
        <div className={`text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full ${
          isToday ? "bg-accent text-white" : "text-text-primary"
        }`}>
          {currentDate.getDate()}
        </div>
        <div className="text-sm text-text-secondary">
          {currentDate.toLocaleDateString(undefined, { weekday: "long" })}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="px-6 py-2 border-b border-border-secondary space-y-1">
          {allDayEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => onEventClick(e)}
              className="w-full text-left text-xs px-2 py-1.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              {e.summary ?? "Event"} · All day
            </button>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => {
          const hourEvents = hourEventMap.get(hour) ?? [];
          return (
            <div key={hour} className="flex border-b border-border-secondary h-14">
              <div className="w-16 shrink-0 px-2 flex items-start justify-end -mt-1.5">
                <span className="text-[0.625rem] text-text-tertiary">
                  {hour === 0 ? "" : `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`}
                </span>
              </div>
              <div className="flex-1 relative px-1">
                {hourEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onEventClick(e)}
                    className="w-full text-left text-xs px-2 py-1 rounded bg-accent/15 text-accent truncate hover:bg-accent/25 transition-colors mb-0.5"
                  >
                    {e.summary ?? "Event"}
                    {e.location && <span className="text-text-tertiary"> · {e.location}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
