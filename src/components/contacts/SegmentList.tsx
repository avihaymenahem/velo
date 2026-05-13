import { Search, RefreshCw, Users } from "lucide-react";

interface SegmentListProps {
  accountId: string;
  segments: Array<{
    id: string;
    name: string;
    query: string;
    isDynamic?: boolean;
    memberCount?: number;
    refreshedAt?: number | null;
  }>;
  onSelect: (query: string) => void;
  onRefresh?: (segmentId: string) => void;
  onDelete?: (segmentId: string) => void;
}

export function SegmentList({ segments, onSelect, onRefresh }: SegmentListProps) {
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
              <div className="text-[0.625rem] text-text-tertiary truncate flex items-center gap-1">
                {segment.query}
                {segment.isDynamic && segment.memberCount != null && (
                  <span className="inline-flex items-center gap-0.5 ml-1 px-1 py-0.5 bg-bg-tertiary rounded-full">
                    <Users size={8} />
                    {segment.memberCount}
                  </span>
                )}
              </div>
            </div>
          </div>
          {segment.isDynamic && onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh(segment.id);
              }}
              title="Refresh segment"
              className="p-1 text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <RefreshCw size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
