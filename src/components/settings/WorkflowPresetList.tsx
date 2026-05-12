import { Sparkles } from "lucide-react";
import { WORKFLOW_PRESETS, type WorkflowPreset } from "@/constants/workflowPresets";

const TRIGGER_LABELS: Record<string, string> = {
  email_received: "Email Received",
  no_reply_after_days: "No Reply After",
  time_based: "Scheduled",
};

interface WorkflowPresetListProps {
  onApply: (preset: WorkflowPreset) => void;
}

export function WorkflowPresetList({ onApply }: WorkflowPresetListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {WORKFLOW_PRESETS.map((preset) => (
        <div
          key={preset.id}
          className="flex flex-col bg-bg-secondary rounded-md p-3 border border-border-primary"
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={13} className="text-accent shrink-0" />
            <span className="text-sm font-medium text-text-primary truncate">
              {preset.name}
            </span>
          </div>
          <p className="text-[0.6875rem] text-text-tertiary mb-2 line-clamp-2">
            {preset.description}
          </p>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-[0.625rem] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded">
              {TRIGGER_LABELS[preset.trigger_event] ?? preset.trigger_event}
            </span>
            <button
              onClick={() => onApply(preset)}
              className="text-[0.625rem] font-medium text-white bg-accent hover:bg-accent-hover px-2 py-1 rounded transition-colors"
            >
              Apply Preset
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
