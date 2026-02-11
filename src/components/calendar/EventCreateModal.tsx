import { useState, useCallback } from "react";
import { X } from "lucide-react";

interface EventCreateModalProps {
  onClose: () => void;
  onCreate: (event: {
    summary: string;
    description: string;
    location: string;
    startTime: string;
    endTime: string;
  }) => void;
}

export function EventCreateModal({ onClose, onCreate }: EventCreateModalProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState(getDefaultStart());
  const [endTime, setEndTime] = useState(getDefaultEnd());

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) return;
    onCreate({ summary: summary.trim(), description, location, startTime, endTime });
  }, [summary, description, location, startTime, endTime, onCreate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          <h3 className="text-sm font-semibold text-text-primary">Create Event</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Title</label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Start</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">End</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs text-text-secondary block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={3}
              className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md hover:bg-bg-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!summary.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getDefaultStart(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return toLocalISOString(now);
}

function getDefaultEnd(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 2);
  return toLocalISOString(now);
}

function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
