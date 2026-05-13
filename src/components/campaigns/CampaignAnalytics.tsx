import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { Send, MailOpen, MousePointerClick, AlertTriangle, Trophy, FlaskConical, TrendingUp } from "lucide-react";
import { CampaignStatsCard } from "./CampaignStatsCard";
import { ExportMenu } from "./ExportMenu";
import type { CampaignStat } from "@/stores/campaignStore";
import { getEngagementTimeSeries } from "@/services/db/campaignRecipients";
import { getVariantStats, getABTestConfig } from "@/services/campaigns/abTesting";
import { getCampaignAnalytics } from "@/services/campaigns/analyticsService";
import type { CampaignAnalytics as AnalyticsData } from "@/services/campaigns/analyticsService";

const COLORS = {
  accent: "#4f46e5",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
};

interface CampaignAnalyticsProps {
  stats: CampaignStat;
  campaignId?: string;
  campaignName?: string;
}

export function CampaignAnalytics({ stats, campaignId, campaignName = "campaign" }: CampaignAnalyticsProps) {
  const [timeSeries, setTimeSeries] = useState<{ date: string; opens: number; clicks: number }[]>([]);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false);
  const [abVariantStats, setAbVariantStats] = useState<{
    a: { total: number; opens: number; clicks: number; openRate: number; clickRate: number } | null;
    b: { total: number; opens: number; clicks: number; openRate: number; clickRate: number } | null;
    winner: string | null;
    significant: boolean;
    pValue: number | null;
  } | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    setTimeSeriesLoading(true);
    Promise.all([
      getEngagementTimeSeries(campaignId),
      getCampaignAnalytics(campaignId),
    ]).then(([ts, an]) => {
      if (!cancelled) {
        setTimeSeries(ts);
        setAnalytics(an);
        setTimeSeriesLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setTimeSeriesLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    getABTestConfig(campaignId).then((config) => {
      if (cancelled || !config) return;
      return getVariantStats(campaignId);
    }).then((vs) => {
      if (cancelled || !vs) return;
      getABTestConfig(campaignId).then((config) => {
        if (cancelled) return;
        setAbVariantStats({
          a: vs.a,
          b: vs.b,
          winner: config?.winnerId ?? null,
          significant: config?.significant ?? false,
          pValue: config?.pValue ?? null,
        });
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId]);

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
  ].filter((d) => d.value > 0);

  const timeSeriesData = timeSeries.length > 0 ? timeSeries : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-3 flex-1">
          <CampaignStatsCard label="Sent" value={stats.sent} icon={Send} color={COLORS.accent} />
          <CampaignStatsCard label="Opened" value={stats.opened} icon={MailOpen} color={COLORS.success} />
          <CampaignStatsCard label="Clicked" value={stats.clicked} icon={MousePointerClick} color={COLORS.warning} />
          <CampaignStatsCard label="Bounced" value={stats.bounced} icon={AlertTriangle} color={COLORS.danger} />
        </div>
        <div className="ml-3">
          {campaignId && analytics && (
            <ExportMenu
              campaignId={campaignId}
              campaignName={campaignName}
              analytics={analytics}
            />
          )}
        </div>
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
      {timeSeriesLoading ? (
        <div className="glass-panel rounded-lg p-4 text-center text-sm text-text-tertiary">Loading engagement data...</div>
      ) : timeSeriesData.length > 0 ? (
        <div className="glass-panel rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3">Engagement Over Time</h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Line type="monotone" dataKey="opens" stroke={COLORS.success} strokeWidth={2} dot={{ fill: COLORS.success, r: 3 }} name="Opens" />
              <Line type="monotone" dataKey="clicks" stroke={COLORS.warning} strokeWidth={2} dot={{ fill: COLORS.warning, r: 3 }} name="Clicks" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {abVariantStats && (abVariantStats.a || abVariantStats.b) && (
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical size={16} className="text-accent" />
            <h4 className="text-sm font-medium text-text-primary">A/B Test Results</h4>
            {abVariantStats.significant && abVariantStats.winner && (
              <span className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">
                <Trophy size={12} />
                Winner: {abVariantStats.winner}
              </span>
            )}
            {abVariantStats.pValue !== null && (
              <span className="ml-auto text-xs text-text-tertiary">
                p = {abVariantStats.pValue.toFixed(4)}
                {abVariantStats.significant ? " (significant)" : " (not significant)"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["a", "b"] as const).map((key) => {
              const v = abVariantStats[key];
              if (!v) return null;
              const isWinner = abVariantStats.winner === key.toUpperCase();
              return (
                <div
                  key={key}
                  className={`rounded-lg p-3 border ${
                    isWinner
                      ? "border-success/40 bg-success/5"
                      : "border-border-primary bg-bg-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Variant {key.toUpperCase()}
                    </span>
                    {isWinner && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Trophy size={12} />
                        Winner
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-text-tertiary">Sent:</span>{" "}
                      <span className="text-text-primary font-medium">{v.total}</span>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Opens:</span>{" "}
                      <span className="text-text-primary font-medium">{v.opens}</span>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Open Rate:</span>{" "}
                      <span className="text-text-primary font-medium">{(v.openRate * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-text-tertiary">Click Rate:</span>{" "}
                      <span className="text-text-primary font-medium">{(v.clickRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {analytics && analytics.topLinks.length > 0 && (
        <div className="glass-panel rounded-lg p-4">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
            <TrendingUp size={14} />
            Top Links
          </h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-tertiary text-xs">
                <th className="text-left py-1 pr-2">URL</th>
                <th className="text-right py-1 w-20">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topLinks.slice(0, 5).map((link, i) => (
                <tr key={i} className="border-t border-border-primary">
                  <td className="py-1.5 pr-2 text-text-primary truncate max-w-[400px]">{link.url}</td>
                  <td className="py-1.5 text-right text-text-primary font-medium">{link.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
