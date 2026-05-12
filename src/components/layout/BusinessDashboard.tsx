import { useTranslation } from "react-i18next";
import { Shield, HardDrive, Send, Bell, Archive, ArrowRight } from "lucide-react";
import { navigateToLabel } from "@/router/navigate";

type CardProps = {
  icon: React.ReactNode;
  title: string;
  count?: number;
  onClick: () => void;
  emptyMessage: string;
};

function DashboardCard({ icon, title, count, onClick, emptyMessage }: CardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 p-4 rounded-lg bg-bg-secondary border border-border-primary hover:border-accent/30 transition-colors text-left w-full group"
    >
      <div className="shrink-0 mt-0.5 text-accent">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-[0.625rem] bg-accent/15 text-accent px-1.5 rounded-full leading-normal">
              {count}
            </span>
          )}
        </div>
        {count === undefined || count === 0 ? (
          <p className="text-xs text-text-tertiary mt-0.5">{emptyMessage}</p>
        ) : null}
      </div>
      <ArrowRight size={14} className="shrink-0 text-text-tertiary group-hover:text-accent transition-colors mt-1" />
    </button>
  );
}

export function BusinessDashboard() {
  const { t } = useTranslation();

  const pendingCompliance = 0;
  const recentVaultFiles = 0;
  const upcomingCampaigns = 0;
  const followUpCount = 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-6">
        {t("dashboard.title")}
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <DashboardCard
          icon={<Shield size={20} />}
          title={t("dashboard.compliancePending")}
          count={pendingCompliance}
          onClick={() => navigateToLabel("settings")}
          emptyMessage={t("dashboard.noComplianceIssues")}
        />
        <DashboardCard
          icon={<HardDrive size={20} />}
          title={t("dashboard.recentVaultActivity")}
          count={recentVaultFiles}
          onClick={() => navigateToLabel("settings")}
          emptyMessage={t("dashboard.noRecentVaultActivity")}
        />
        <DashboardCard
          icon={<Send size={20} />}
          title={t("dashboard.upcomingCampaigns")}
          count={upcomingCampaigns}
          onClick={() => navigateToLabel("campaigns")}
          emptyMessage={t("dashboard.noUpcomingCampaigns")}
        />
        <DashboardCard
          icon={<Bell size={20} />}
          title={t("dashboard.followUpReminders")}
          count={followUpCount}
          onClick={() => navigateToLabel("inbox")}
          emptyMessage={t("dashboard.noFollowUps")}
        />
        <DashboardCard
          icon={<Archive size={20} />}
          title={t("dashboard.nextBackup")}
          onClick={() => navigateToLabel("settings")}
          emptyMessage={t("dashboard.noBackupScheduled")}
        />
      </div>
    </div>
  );
}
