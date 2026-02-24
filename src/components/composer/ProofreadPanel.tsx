import { createPortal } from "react-dom";
import { Info, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import type { ProofreadResult, ProofreadIssue } from "@/services/ai/types";

interface ProofreadPanelProps {
  result: ProofreadResult | null;
  onConfirmSend: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function IssueIcon({ severity }: { severity: ProofreadIssue["severity"] }) {
  if (severity === "error") {
    return <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />;
  }
  if (severity === "warning") {
    return <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />;
  }
  return <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />;
}

const TYPE_LABELS: Record<ProofreadIssue["type"], string> = {
  tone: "Tone",
  clarity: "Clarity",
  missing_attachment: "Missing Attachment",
  other: "Note",
};

export function ProofreadPanel({ result, onConfirmSend, onCancel, isLoading }: ProofreadPanelProps) {
  const isGood = result !== null && result.overallScore === "good" && result.issues.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 glass-backdrop" onClick={onCancel} />
      <div className="relative bg-bg-primary border border-border-primary rounded-xl glass-modal w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border-primary bg-bg-secondary">
          <span className="text-sm font-semibold text-text-primary flex-1">Review before sending</span>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {isLoading && (
            <div className="flex items-center gap-3 justify-center py-6 text-text-tertiary">
              <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <span className="text-sm">Reviewing your email...</span>
            </div>
          )}

          {!isLoading && isGood && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle size={36} className="text-success" />
              <p className="text-sm font-medium text-text-primary">Looks good!</p>
              <p className="text-xs text-text-tertiary">No issues found with your email.</p>
            </div>
          )}

          {!isLoading && result !== null && !isGood && (
            <div className="space-y-3">
              <p className="text-xs text-text-tertiary">
                {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} found. Review before sending.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {result.issues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 px-3 py-2.5 bg-bg-secondary rounded-lg"
                  >
                    <IssueIcon severity={issue.severity} />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-text-primary">
                        {TYPE_LABELS[issue.type]}
                      </span>
                      <p className="text-xs text-text-secondary mt-0.5">{issue.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        {!isLoading && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-primary bg-bg-secondary">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-bg-tertiary hover:bg-bg-hover rounded-md transition-colors border border-border-primary"
            >
              Go back to edit
            </button>
            <button
              onClick={onConfirmSend}
              className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
            >
              Send anyway
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
