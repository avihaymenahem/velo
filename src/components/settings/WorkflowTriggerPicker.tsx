interface WorkflowTriggerPickerProps {
  event: string;
  conditions: string;
  onChange: (event: string, conditions: string) => void;
}

const TRIGGER_EVENTS = [
  { value: "email_received", label: "Email Received" },
  { value: "no_reply_after_days", label: "No Reply After Days" },
  { value: "time_based", label: "Time Based" },
];

interface TriggerConditions {
  from_domain?: string;
  subject_contains?: string;
  days?: number;
  cron?: string;
}

export function WorkflowTriggerPicker({ event, conditions, onChange }: WorkflowTriggerPickerProps) {
  let parsed: TriggerConditions = {};
  try {
    if (conditions) parsed = JSON.parse(conditions) as TriggerConditions;
  } catch {
    parsed = {};
  }

  const updateConditions = (update: Partial<TriggerConditions>) => {
    onChange(event, JSON.stringify({ ...parsed, ...update }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary w-24">Trigger event</span>
        <select
          value={event}
          onChange={(e) => {
            const newEvent = e.target.value;
            let defaultConditions = "";
            if (newEvent === "time_based") {
              defaultConditions = JSON.stringify({ cron: "0 9 * * 1" });
            } else if (newEvent === "no_reply_after_days") {
              defaultConditions = JSON.stringify({ days: 3 });
            } else {
              defaultConditions = JSON.stringify({ from_domain: "", subject_contains: "" });
            }
            onChange(newEvent, defaultConditions);
          }}
          className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary"
        >
          {TRIGGER_EVENTS.map((ev) => (
            <option key={ev.value} value={ev.value}>{ev.label}</option>
          ))}
        </select>
      </div>

      {event === "email_received" && (
        <div className="space-y-1.5 pl-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24">From domain</span>
            <input
              type="text"
              value={parsed.from_domain ?? ""}
              onChange={(e) => updateConditions({ from_domain: e.target.value })}
              placeholder="example.com"
              className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24">Subject contains</span>
            <input
              type="text"
              value={parsed.subject_contains ?? ""}
              onChange={(e) => updateConditions({ subject_contains: e.target.value })}
              placeholder="keyword"
              className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {event === "no_reply_after_days" && (
        <div className="flex items-center gap-2 pl-2">
          <span className="text-xs text-text-secondary w-24">Days without reply</span>
          <input
            type="number"
            min={1}
            max={365}
            value={parsed.days ?? 3}
            onChange={(e) => updateConditions({ days: Math.max(1, Number(e.target.value)) })}
            className="w-20 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
          />
        </div>
      )}

      {event === "time_based" && (
        <div className="space-y-1.5 pl-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24">Cron expression</span>
            <input
              type="text"
              value={parsed.cron ?? ""}
              onChange={(e) => updateConditions({ cron: e.target.value })}
              placeholder="0 9 * * 1"
              className="flex-1 bg-bg-tertiary text-text-primary text-xs px-2 py-1 rounded border border-border-primary outline-none focus:border-accent"
            />
          </div>
          <p className="text-[0.625rem] text-text-tertiary pl-24">
            Format: minute hour day-of-month month day-of-week (* = any)
          </p>
        </div>
      )}
    </div>
  );
}
