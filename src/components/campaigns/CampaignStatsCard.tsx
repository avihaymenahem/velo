import type { LucideIcon } from "lucide-react";

interface CampaignStatsCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
}

export function CampaignStatsCard({ label, value, icon: Icon, color }: CampaignStatsCardProps) {
  return (
    <div className="glass-panel rounded-lg p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color ? `${color}15` : undefined }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-text-tertiary">{label}</span>
        <span className="text-xl font-semibold text-text-primary">{value}</span>
      </div>
    </div>
  );
}
