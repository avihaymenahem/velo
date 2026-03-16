import { useTranslation } from "react-i18next";
import type { DbCalendarEvent } from "@/services/db/calendarEvents";

interface EventCardProps {
  event: DbCalendarEvent;
  compact?: boolean;
  onClick?: () => void;
}

export function EventCard({ event, compact, onClick }: EventCardProps) {
  const { t } = useTranslation("calendar");
  const startDate = new Date(event.start_time * 1000);
  const timeStr = event.is_all_day
    ? t("allDay")
    : startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left text-[0.625rem] px-1 py-0.5 rounded bg-accent/10 text-accent truncate hover:bg-accent/20 transition-colors"
        title={event.summary ?? t("event")}
      >
        {event.summary ?? t("event")}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-md border border-border-secondary hover:bg-bg-hover transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="w-1 h-full min-h-[24px] rounded-full bg-accent shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">
            {event.summary ?? t("noTitle")}
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
