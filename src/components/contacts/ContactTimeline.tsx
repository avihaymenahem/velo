import { Mail, CheckSquare, Calendar } from "lucide-react";
import { formatRelativeDate } from "@/utils/date";

export interface ActivityEvent {
  type: "email" | "task" | "calendar";
  date: number;
  summary: string;
  id: string;
}

interface ContactTimelineProps {
  events: ActivityEvent[];
  isLoading?: boolean;
}

const iconMap = {
  email: Mail,
  task: CheckSquare,
  calendar: Calendar,
} as const;

const colorMap = {
  email: "text-accent",
  task: "text-success",
  calendar: "text-warning",
} as const;

export function ContactTimeline({ events, isLoading }: ContactTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-3 bg-bg-tertiary rounded w-20 animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2 animate-pulse">
              <div className="w-4 h-4 rounded-full bg-bg-tertiary mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 bg-bg-tertiary rounded w-32" />
                <div className="h-2 bg-bg-tertiary rounded w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-text-tertiary">No recent activity</p>
    );
  }

  const sorted = [...events].sort((a, b) => b.date - a.date);

  return (
    <div className="space-y-0">
      {sorted.map((event, i) => {
        const Icon = iconMap[event.type];
        const colorClass = colorMap[event.type];

        return (
          <div key={event.id} className="flex items-start gap-2 pb-3 relative">
            <div className="flex flex-col items-center">
              <div className={`p-0.5 rounded-full ${colorClass}`}>
                <Icon size={12} />
              </div>
              {i < sorted.length - 1 && (
                <div className="w-px flex-1 bg-border-primary mt-1" />
              )}
            </div>
            <div className="min-w-0 flex-1 -mt-0.5">
              <div className="text-xs text-text-primary truncate">
                {event.summary}
              </div>
              <div className="text-[0.625rem] text-text-tertiary">
                {formatRelativeDate(event.date)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
