import { Search } from "lucide-react";
import type { ContactSegment } from "@/stores/contactStore";

interface SegmentListProps {
  accountId: string;
  segments: ContactSegment[];
  onSelect: (query: string) => void;
}

export function SegmentList({ segments, onSelect }: SegmentListProps) {
  if (segments.length === 0) {
    return (
      <p className="text-xs text-text-tertiary py-2">No saved segments</p>
    );
  }

  return (
    <div className="space-y-1">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-bg-hover transition-colors cursor-pointer"
          onClick={() => onSelect(segment.query)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search size={12} className="text-text-tertiary shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-primary truncate">
                {segment.name}
              </div>
              <div className="text-[0.625rem] text-text-tertiary truncate">
                {segment.query}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
