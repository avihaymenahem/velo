import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";

export type CalendarView = "day" | "week" | "month";

interface CalendarToolbarProps {
  currentDate: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCreateEvent: () => void;
  onToggleCalendarList?: () => void;
  showCalendarListButton?: boolean;
}

export function CalendarToolbar({
  currentDate,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreateEvent,
  onToggleCalendarList,
  showCalendarListButton,
}: CalendarToolbarProps) {
  const { t, i18n } = useTranslation("calendar");
  const title = formatTitle(currentDate, view, i18n.language);

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
            {t("toolbar.today")}
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
            title={t("toolbar.toggleList")}
          >
            <CalendarDays size={16} />
          </button>
        )}
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
              {t(`toolbar.views.${v}`)}
            </button>
          ))}
        </div>
        <button
          onClick={onCreateEvent}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
        >
          <Plus size={14} />
          {t("toolbar.create")}
        </button>
      </div>
    </div>
  );
}

function formatTitle(date: Date, view: CalendarView, language: string): string {
  if (language === "zh-CN") {
    if (view === "month") {
      return date.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
    }
    if (view === "week") {
      const start = new Date(date);
      start.setDate(start.getDate() - start.getDay());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${start.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}`;
    }
    return date.toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  if (view === "month") {
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (view === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return `${months[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${months[start.getMonth()]?.slice(0, 3)} ${start.getDate()} - ${months[end.getMonth()]?.slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
