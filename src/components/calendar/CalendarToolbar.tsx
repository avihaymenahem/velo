import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, CalendarDays } from "lucide-react";
import { t, getLocale } from "@/i18n";

export type CalendarView = "day" | "week" | "month";

interface CalendarToolbarProps {
  currentDate: Date;
  view: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onViewChange: (view: CalendarView) => void;
  onCreateEvent: () => void;
  onDateSelect?: (date: Date) => void;
  onToggleCalendarList?: () => void;
  showCalendarListButton?: boolean;
}

const MINI_DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Date(2023, 0, i + 2).toLocaleDateString(undefined, { weekday: "narrow" }),
);

function MiniCalendarPicker({
  currentDate,
  onSelect,
}: {
  currentDate: Date;
  onSelect: (date: Date) => void;
}) {
  const [pickerDate, setPickerDate] = useState(
    new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
  );
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const year = pickerDate.getFullYear();
  const month = pickerDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = pickerDate.toLocaleDateString(undefined, { month: "long" });

  return (
    <div className="absolute left-0 top-full mt-2 z-50 bg-bg-primary border border-border-primary rounded-xl shadow-lg p-3 w-[220px]">
      {/* Picker header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setPickerDate(new Date(year, month - 1, 1))}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-text-primary">
          {monthLabel}{" "}
          <span className="text-text-tertiary font-normal">{year}</span>
        </span>
        <button
          onClick={() => setPickerDate(new Date(year, month + 1, 1))}
          className="p-1 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day name headers */}
      <div className="grid grid-cols-7 mb-1">
        {MINI_DAY_NAMES.map((name) => (
          <div key={name} className="text-[0.6rem] text-text-tertiary text-center py-0.5">
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`e-${idx}`} />;
          }
          const isToday = `${year}-${month}-${day}` === todayStr;
          const isSelected =
            day === currentDate.getDate() &&
            month === currentDate.getMonth() &&
            year === currentDate.getFullYear();

          return (
            <button
              key={day}
              onClick={() => onSelect(new Date(year, month, day))}
              className={`text-[0.65rem] w-7 h-7 mx-auto flex items-center justify-center rounded-full transition-colors ${
                isToday
                  ? "bg-accent text-white font-semibold"
                  : isSelected
                    ? "bg-bg-selected text-text-primary font-medium"
                    : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarToolbar({
  currentDate,
  view,
  onPrev,
  onNext,
  onToday,
  onViewChange,
  onCreateEvent,
  onDateSelect,
  onToggleCalendarList,
  showCalendarListButton,
}: CalendarToolbarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [pickerOpen]);

  const locale = getLocale();
  const monthName = currentDate.toLocaleDateString(locale, { month: "long" });
  const yearStr = String(currentDate.getFullYear());
  const showPicker = (view === "month" || view === "week" || view === "day") && !!onDateSelect;
  const weekRangeLabel = (view === "week" || view === "day") ? formatWeekRange(currentDate, locale) : null;
  const weekYear = (view === "week" || view === "day") ? String(weekRangeStart(currentDate).getFullYear()) : null;

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border-primary">
      <div className="flex items-center gap-3">
        {showPicker ? (
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
            >
              {(view === "week" || view === "day") ? (
                <>
                  <span className="text-lg font-semibold text-text-primary">{weekRangeLabel}</span>
                  <span className="text-lg font-semibold text-text-tertiary">{weekYear}</span>
                </>
              ) : (
                <>
                  <span className="text-lg font-semibold text-text-primary capitalize">{monthName}</span>
                  <span className="text-lg font-semibold text-text-tertiary">{yearStr}</span>
                </>
              )}
              <ChevronDown
                size={14}
                className={`text-text-tertiary transition-transform ${pickerOpen ? "rotate-180" : ""}`}
              />
            </button>
            {pickerOpen && (
              <MiniCalendarPicker
                currentDate={currentDate}
                onSelect={(date) => {
                  onDateSelect!(date);
                  setPickerOpen(false);
                }}
              />
            )}
          </div>
        ) : (
          <h2 className="text-lg font-semibold">
            <span className="text-text-primary">{formatMonthPart(currentDate, view)}</span>
            {view !== "day" && (
              <span className="text-text-tertiary ml-1.5">{yearStr}</span>
            )}
          </h2>
        )}

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
            {t("calendar.today")}
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
            title={t("calendar.toggleCalendarList")}
          >
            <CalendarDays size={16} />
          </button>
        )}
        <div className="flex bg-bg-tertiary rounded-md p-0.5">
          {(["day", "week", "month"] as CalendarView[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                view === v
                  ? "bg-bg-primary text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {t(`calendar.view${v.charAt(0).toUpperCase()}${v.slice(1)}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        <button
          onClick={onCreateEvent}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
        >
          <Plus size={14} />
          {t("calendar.createEvent")}
        </button>
      </div>
    </div>
  );
}

function weekRangeStart(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function formatWeekRange(date: Date, locale: string): string {
  const start = weekRangeStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  if (start.getMonth() === end.getMonth()) {
    const monthName = start.toLocaleDateString(locale, { month: "long" });
    return `${start.getDate()}–${end.getDate()} ${monthName}`;
  }
  const startStr = start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const endStr = end.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${startStr} – ${endStr}`;
}

function formatMonthPart(date: Date, view: CalendarView): string {
  const locale = getLocale();
  if (view === "month") {
    return date.toLocaleDateString(locale, { month: "long" });
  }
  if (view === "week") {
    return formatWeekRange(date, locale);
  }
  return date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
}
