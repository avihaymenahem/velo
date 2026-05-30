import { t, getLocale } from "@/i18n";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface EventCardProps {
  event: DbCalendarEvent;
  compact?: boolean;
  onClick?: () => void;
  color?: string;
}

export function EventCard({ event, compact, onClick, color }: EventCardProps) {
  const startDate = new Date(event.start_time * 1000);
  const timeStr = event.is_all_day
    ? t("calendar.eventAllDay")
    : startDate.toLocaleTimeString(getLocale(), { hour: "numeric", minute: "2-digit" });

  const accentColor = color ?? "var(--color-accent)";

  if (compact) {
    if (event.is_all_day) {
      return (
        <button
          onClick={onClick}
          className="w-full text-left text-[0.625rem] px-1 py-0.5 rounded truncate transition-colors hover:opacity-80"
          style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
          title={event.summary ?? t("calendar.eventFallback")}
        >
          {event.summary ?? t("calendar.eventFallback")}
        </button>
      );
    }

    return (
      <button
        onClick={onClick}
        className="w-full text-left text-[0.625rem] px-1 py-0.5 rounded flex items-start gap-1 transition-colors hover:bg-bg-hover group"
        title={event.summary ?? t("calendar.eventFallback")}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-[0.15rem]"
          style={{ backgroundColor: accentColor }}
        />
        <span className="line-clamp-2 flex-1 text-text-primary">
          {event.summary ?? t("calendar.eventFallback")}
        </span>
        <span className="shrink-0 text-text-tertiary">
          {startDate.toLocaleTimeString(getLocale(), { hour: "numeric", minute: "2-digit" })}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-md border border-border-secondary hover:bg-bg-hover transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="w-1 h-full min-h-[24px] rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">
            {event.summary ?? t("calendar.eventNoTitle")}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {timeStr}
            {event.location && ` · ${event.location}`}
          </div>
        </div>
      </div>
    </button>
  );
}
