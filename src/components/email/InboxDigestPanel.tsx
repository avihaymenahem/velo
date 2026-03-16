import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";

interface InboxDigestPanelProps {
  content: string | null;
  isLoading: boolean;
  onClose: () => void;
}

export function InboxDigestPanel({ content, isLoading, onClose }: InboxDigestPanelProps) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh]">
      <div className="absolute inset-0 bg-black/30 glass-backdrop" onClick={onClose} />
      <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary bg-bg-secondary">
          <Sparkles size={16} className="text-accent shrink-0" />
          <span className="text-sm font-medium text-text-primary flex-1">Inbox Digest</span>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close inbox digest"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center gap-3 justify-center py-8 text-text-tertiary">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-sm">Summarizing your inbox...</span>
            </div>
          )}

          {!isLoading && content && (
            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          )}

          {!isLoading && !content && (
            <div className="text-center text-sm text-text-tertiary py-8">
              No digest available. Try again with more emails in your inbox.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
