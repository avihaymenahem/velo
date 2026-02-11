import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface WeekViewProps {
  currentDate: Date;
  events: DbCalendarEvent[];
  onEventClick: (event: DbCalendarEvent) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekView({ currentDate, events, onEventClick }: WeekViewProps) {
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

  const getEventsForDayHour = (day: Date, hour: number): DbCalendarEvent[] => {
    const hourStart = new Date(day);
    hourStart.setHours(hour, 0, 0, 0);
    const hourEnd = new Date(day);
    hourEnd.setHours(hour + 1, 0, 0, 0);
    const hStart = hourStart.getTime() / 1000;
    const hEnd = hourEnd.getTime() / 1000;
    return events.filter((e) => !e.is_all_day && e.start_time < hEnd && e.end_time > hStart);
  };

  const getAllDayEvents = (day: Date): DbCalendarEvent[] => {
    const dayStart = new Date(day).setHours(0, 0, 0, 0) / 1000;
    const dayEnd = new Date(day).setHours(23, 59, 59, 999) / 1000;
    return events.filter((e) => e.is_all_day && e.start_time < dayEnd && e.end_time > dayStart);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border-primary shrink-0">
        <div className="border-r border-border-secondary" />
        {days.map((day, i) => {
          const isToday = day.toDateString() === todayStr;
          return (
            <div key={i} className="px-2 py-2 text-center border-r border-border-secondary">
              <div className="text-xs text-text-tertiary">{DAY_NAMES[day.getDay()]}</div>
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
        <div className="border-r border-border-secondary px-1 py-1 text-[10px] text-text-tertiary">all-day</div>
        {days.map((day, i) => {
          const allDay = getAllDayEvents(day);
          return (
            <div key={i} className="border-r border-border-secondary px-1 py-1 space-y-0.5">
              {allDay.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent truncate hover:bg-accent/20 transition-colors"
                >
                  {e.summary ?? "Event"}
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
                <span className="text-[10px] text-text-tertiary -mt-1.5">
                  {hour === 0 ? "" : `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`}
                </span>
              </div>
              {days.map((day, di) => {
                const hourEvents = getEventsForDayHour(day, hour);
                return (
                  <div key={di} className="border-r border-b border-border-secondary h-12 relative px-0.5">
                    {hourEvents.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => onEventClick(e)}
                        className="absolute inset-x-0.5 text-[10px] px-1 py-0.5 rounded bg-accent/15 text-accent truncate hover:bg-accent/25 transition-colors"
                        title={e.summary ?? "Event"}
                      >
                        {e.summary ?? "Event"}
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
