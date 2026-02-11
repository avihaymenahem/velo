import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-text-tertiary px-4">
      <Icon size={48} strokeWidth={1} className="mb-3 opacity-40" />
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs mt-1">{subtitle}</p>}
    </div>
  );
}
