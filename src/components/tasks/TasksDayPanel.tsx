import { useMemo, useRef, useEffect, useCallback } from "react";
import { t, getLocale } from "@/i18n";
import { Crosshair } from "lucide-react";
import type { DbTaskWithSubject } from "@/services/db/tasks";

interface TasksDayPanelProps {
  tasks: DbTaskWithSubject[];
  colorMap: Record<string, string>;
  selectedDate: Date;
  onDayClick: (date: Date) => void;
  onHighlightTask: (taskId: string) => void;
}

const WEEK_RADIUS = 52;

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatWeekDateRange(start: Date, end: Date, locale: string): string {
  if (start.getMonth() === end.getMonth()) {
    const month = start.toLocaleDateString(locale, { month: "short" });
    return `${start.getDate()}–${end.getDate()} ${month}`;
  }
  const s = start.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const e = end.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return `${s} – ${e}`;
}

function getWeekLabel(weekStart: Date, todayWeekStart: Date, locale: string): string {
  const diffWeeks = Math.round(
    (weekStart.getTime() - todayWeekStart.getTime()) / (7 * 86400000),
  );
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  const range = formatWeekDateRange(weekStart, weekEnd, locale);

  if (diffWeeks === -1) return `${t("calendar.dayView.lastWeek")} (${range})`;
  if (diffWeeks === 0) return `${t("calendar.dayView.thisWeek")} (${range})`;
  if (diffWeeks === 1) return `${t("calendar.dayView.nextWeek")} (${range})`;
  return `${t("calendar.dayView.weekNumber", { n: String(getISOWeek(weekStart)) })} (${range})`;
}

export function TasksDayPanel({ tasks, colorMap, selectedDate, onDayClick, onHighlightTask }: TasksDayPanelProps) {
  const locale = getLocale();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayWeekTs = useMemo(() => getWeekStart(today).getTime(), [today]);
  const currentWeekTs = useMemo(() => getWeekStart(selectedDate).getTime(), [selectedDate]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, DbTaskWithSubject[]>();
    for (const task of tasks) {
      if (task.due_date === null) continue;
      const key = new Date(task.due_date * 1000).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return map;
  }, [tasks]);

  const weeks = useMemo(() => {
    return Array.from({ length: WEEK_RADIUS * 2 + 1 }, (_, i) => {
      const weekStart = new Date(todayWeekTs + (i - WEEK_RADIUS) * 7 * 86400000);
      const days = Array.from({ length: 7 }, (_, d) => {
        const date = new Date(weekStart.getTime() + d * 86400000);
        const dayTasks = tasksByDay.get(date.toDateString()) ?? [];
        return { date, tasks: dayTasks };
      });
      return { weekStart, days };
    });
  }, [todayWeekTs, tasksByDay]);

  const leftScrollRef = useRef<HTMLDivElement>(null);
  const currentWeekRef = useRef<HTMLDivElement>(null);
  const skipScrollRef = useRef(false);

  const scrollToCurrentWeek = useCallback(() => {
    if (leftScrollRef.current && currentWeekRef.current) {
      leftScrollRef.current.scrollTop = Math.max(0, currentWeekRef.current.offsetTop - 8);
    }
  }, []);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    scrollToCurrentWeek();
  }, [currentWeekTs, scrollToCurrentWeek]);

  useEffect(() => {
    scrollToCurrentWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = useCallback(
    (date: Date) => {
      if (getWeekStart(date).getTime() === currentWeekTs) {
        skipScrollRef.current = true;
      }
      onDayClick(date);
    },
    [currentWeekTs, onDayClick],
  );

  const todayStr = today.toDateString();
  const selectedStr = selectedDate.toDateString();

  return (
    <div
      ref={leftScrollRef}
      className="w-[340px] shrink-0 border-r border-border-primary overflow-y-auto bg-bg-secondary"
    >
      {weeks.map(({ weekStart, days }) => {
        const isCurrentWeek = weekStart.getTime() === currentWeekTs;
        const label = getWeekLabel(weekStart, new Date(todayWeekTs), locale);

        return (
          <div
            key={weekStart.getTime()}
            ref={isCurrentWeek ? currentWeekRef : undefined}
          >
            <div
              className={`px-4 py-2 text-[0.68rem] font-semibold sticky top-0 z-10 bg-bg-secondary border-b border-border-secondary ${
                isCurrentWeek ? "text-accent" : "text-text-tertiary"
              }`}
            >
              {label}
            </div>

            {days.map(({ date, tasks: dayTasks }) => {
              const isThisToday = date.toDateString() === todayStr;
              const isSelected = date.toDateString() === selectedStr;
              const weekdayAbbr = date.toLocaleDateString(locale, { weekday: "short" });
              const monthAbbr = date
                .toLocaleDateString(locale, { month: "short" })
                .toUpperCase();

              return (
                <div
                  key={date.getTime()}
                  onClick={() => handleDayClick(date)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") handleDayClick(date);
                  }}
                  className={`w-full flex items-stretch border-b border-border-secondary cursor-pointer transition-colors hover:bg-bg-hover ${
                    isThisToday
                      ? "bg-accent/15"
                      : isSelected
                        ? "bg-bg-selected"
                        : ""
                  }`}
                >
                  {/* Date column */}
                  <div
                    className={`w-14 shrink-0 flex flex-col items-center justify-center py-3 ${
                      isThisToday ? "text-accent" : "text-text-tertiary"
                    }`}
                  >
                    <span className="text-[0.6rem] font-medium leading-none mb-1">
                      {weekdayAbbr}
                    </span>
                    <span
                      className={`text-xl font-bold leading-none ${
                        isThisToday ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    <span className="text-[0.6rem] font-medium leading-none mt-1">
                      {monthAbbr}
                    </span>
                  </div>

                  {/* Tasks column */}
                  <div className="flex-1 min-w-0 py-3 pr-3 flex flex-col justify-center gap-0.5">
                    {dayTasks.length === 0 ? (
                      <span className="text-xs text-text-tertiary flex items-center gap-1.5 opacity-40 pl-2">
                        {t("tasks.dayPanel.noTasks")}
                      </span>
                    ) : (
                      dayTasks.map((task) => {
                        const accountColor = task.account_id
                          ? (colorMap[task.account_id] ?? "#3182CE")
                          : "#3182CE";
                        return (
                          <div
                            key={task.id}
                            className="text-xs flex items-center gap-1.5 min-w-0 group/task"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: accountColor }}
                            />
                            <span
                              className={`truncate flex-1 ${
                                task.is_completed
                                  ? "line-through text-text-tertiary"
                                  : "text-text-primary"
                              }`}
                            >
                              {task.title}
                            </span>
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onHighlightTask(task.id);
                              }}
                              title={t("tasks.dayPanel.highlight")}
                              className="shrink-0 opacity-0 group-hover/task:opacity-100 transition-opacity text-text-tertiary hover:text-accent"
                            >
                              <Crosshair size={11} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
