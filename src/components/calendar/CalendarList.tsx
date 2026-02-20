import type { DbCalendar } from "@/services/db/calendars";

interface CalendarListProps {
  calendars: DbCalendar[];
  onVisibilityChange: (calendarId: string, visible: boolean) => void;
}

export function CalendarList({ calendars, onVisibilityChange }: CalendarListProps) {
  return (
    <div className="w-52 border-r border-border-primary p-3 overflow-y-auto shrink-0">
      <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-2">
        Calendars
      </h3>
      <div className="space-y-1">
        {calendars.map((cal) => (
          <label
            key={cal.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-hover cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={!!cal.is_visible}
              onChange={(e) => onVisibilityChange(cal.id, e.target.checked)}
              className="sr-only"
            />
            <span
              className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors ${
                cal.is_visible
                  ? "border-transparent"
                  : "border-border-primary bg-transparent"
              }`}
              style={cal.is_visible ? { backgroundColor: cal.color ?? "var(--color-accent)" } : undefined}
            >
              {!!cal.is_visible && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 4L3 5.5L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-sm text-text-primary truncate">
              {cal.display_name ?? "Calendar"}
            </span>
            {!!cal.is_primary && (
              <span className="text-[0.6rem] text-text-tertiary ml-auto shrink-0">Primary</span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
