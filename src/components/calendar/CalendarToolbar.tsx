import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { i18n } from "@/locales/i18n";

export type CalendarView = "day" | "week" | "month";

export type CalendarType = "gregorian" | "islamic";

interface CalendarToolbarProps {
  currentDate: Date;
  view: CalendarView;
  calendarType: CalendarType;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCalendarTypeChange: (type: CalendarType) => void;
  onCreateEvent: () => void;
  onToggleCalendarList?: () => void;
  showCalendarListButton?: boolean;
}

export function CalendarToolbar({
  currentDate,
  view,
  calendarType,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCalendarTypeChange,
  onCreateEvent,
  onToggleCalendarList,
  showCalendarListButton,
}: CalendarToolbarProps) {
  const { t } = useTranslation();
  const title = formatTitle(currentDate, view, calendarType);

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border-primary">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={onToday}
            className="px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          >
            {t("date.today")}
          </button>
          <button
            onClick={onNext}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showCalendarListButton && onToggleCalendarList && (
          <button
            onClick={onToggleCalendarList}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
            title="Toggle calendar list"
          >
            <CalendarDays size={16} />
          </button>
        )}
        <div className="flex bg-bg-tertiary rounded-md p-0.5">
          {(["gregorian", "islamic"] as const).map((type) => (
            <button
              key={type}
              onClick={() => onCalendarTypeChange(type)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                calendarType === type
                  ? "bg-bg-primary text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t(`calendar.${type}`)}
            </button>
          ))}
        </div>
        <div className="flex bg-bg-tertiary rounded-md p-0.5">
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors capitalize ${
                view === v
                  ? "bg-bg-primary text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={onCreateEvent}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
        >
          <Plus size={14} />
          Create
        </button>
      </div>
    </div>
  );
}

function formatTitle(date: Date, view: CalendarView, calendarType: CalendarType): string {
  const calendar = calendarType === "islamic" ? "islamic" : undefined;

  if (view === "month") {
    return new Intl.DateTimeFormat(i18n.language, {
      calendar,
      year: "numeric",
      month: "long",
    }).format(date);
  }

  if (view === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fmt = new Intl.DateTimeFormat(i18n.language, {
      calendar,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  return new Intl.DateTimeFormat(i18n.language, {
    calendar,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
