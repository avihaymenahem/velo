import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Send, MailOpen, MousePointerClick, AlertTriangle } from "lucide-react";
import { CampaignStatsCard } from "./CampaignStatsCard";
import type { CampaignStat } from "@/stores/campaignStore";

const COLORS = {
  accent: "#4f46e5",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
};

interface CampaignAnalyticsProps {
  stats: CampaignStat;
}

export function CampaignAnalytics({ stats }: CampaignAnalyticsProps) {
  const barData = [
    { name: "Sent", value: stats.sent, fill: COLORS.accent },
    { name: "Opened", value: stats.opened, fill: COLORS.success },
    { name: "Clicked", value: stats.clicked, fill: COLORS.warning },
    { name: "Bounced", value: stats.bounced, fill: COLORS.danger },
  ];

  const pieData = [
    { name: "Opened", value: stats.opened, color: COLORS.success },
    { name: "Clicked", value: stats.clicked, color: COLORS.warning },
    { name: "Bounced", value: stats.bounced, color: COLORS.danger },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <CampaignStatsCard label="Sent" value={stats.sent} icon={Send} color={COLORS.accent} />
        <CampaignStatsCard label="Opened" value={stats.opened} icon={MailOpen} color={COLORS.success} />
        <CampaignStatsCard label="Clicked" value={stats.clicked} icon={MousePointerClick} color={COLORS.warning} />
        <CampaignStatsCard label="Bounced" value={stats.bounced} icon={AlertTriangle} color={COLORS.danger} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">Delivery Status</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">Engagement Breakdown</h4>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={40}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
