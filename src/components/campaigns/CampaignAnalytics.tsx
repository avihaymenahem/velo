import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { Send, MailOpen, MousePointerClick, AlertTriangle, Download, FileDown } from "lucide-react";
import { CampaignStatsCard } from "./CampaignStatsCard";
import type { CampaignStat } from "@/stores/campaignStore";
import { getEngagementTimeSeries } from "@/services/db/campaignRecipients";
import { generateCsvData, downloadCsv } from "@/services/campaigns/trackingService";

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

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    setTimeSeriesLoading(true);
    getEngagementTimeSeries(campaignId).then((data) => {
      if (!cancelled) {
        setTimeSeries(data);
        setTimeSeriesLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setTimeSeriesLoading(false);
    });
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

  async function handleExportCsv() {
    const csv = generateCsvData(
      { sent: stats.sent, opened: stats.opened, clicked: stats.clicked, bounced: stats.bounced, openRate: stats.total > 0 ? stats.opened / stats.total : 0, clickRate: stats.total > 0 ? stats.clicked / stats.total : 0 },
      timeSeries,
    );
    downloadCsv(csv, `${campaignName.replace(/\s+/g, "_")}_analytics.csv`);
  }

  function handleExportPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
      <head><title>Campaign Analytics - ${campaignName}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a1a1a; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        .meta { color: #666; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        th { background: #f5f5f5; font-weight: 600; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; }
        .stat-label { font-size: 12px; color: #666; }
        .stat-value { font-size: 24px; font-weight: 700; margin-top: 4px; }
        @media print { body { padding: 20px; } }
      </style>
      </head>
      <body>
        <h1>Campaign Analytics</h1>
        <p class="meta">${campaignName}</p>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">Sent</div><div class="stat-value">${stats.sent}</div></div>
          <div class="stat-card"><div class="stat-label">Opened</div><div class="stat-value">${stats.opened}</div></div>
          <div class="stat-card"><div class="stat-label">Clicked</div><div class="stat-value">${stats.clicked}</div></div>
          <div class="stat-card"><div class="stat-label">Bounced</div><div class="stat-value">${stats.bounced}</div></div>
        </div>
        <table>
          <tr><th>Metric</th><th>Value</th></tr>
          <tr><td>Sent</td><td>${stats.sent}</td></tr>
          <tr><td>Opened</td><td>${stats.opened}</td></tr>
          <tr><td>Clicked</td><td>${stats.clicked}</td></tr>
          <tr><td>Bounced</td><td>${stats.bounced}</td></tr>
          <tr><td>Open Rate</td><td>${stats.total > 0 ? (stats.opened / stats.total * 100).toFixed(1) : 0}%</td></tr>
          <tr><td>Click Rate</td><td>${stats.total > 0 ? (stats.clicked / stats.total * 100).toFixed(1) : 0}%</td></tr>
        </table>
        ${timeSeries.length > 0 ? `
          <h2>Engagement Over Time</h2>
          <table>
            <tr><th>Date</th><th>Opens</th><th>Clicks</th></tr>
            ${timeSeries.map((d) => `<tr><td>${d.date}</td><td>${d.opens}</td><td>${d.clicks}</td></tr>`).join("")}
          </table>
        ` : ""}
        <p style="margin-top: 32px; color: #999; font-size: 11px;">Generated by Velo Mail</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-3 flex-1">
          <CampaignStatsCard label="Sent" value={stats.sent} icon={Send} color={COLORS.accent} />
          <CampaignStatsCard label="Opened" value={stats.opened} icon={MailOpen} color={COLORS.success} />
          <CampaignStatsCard label="Clicked" value={stats.clicked} icon={MousePointerClick} color={COLORS.warning} />
          <CampaignStatsCard label="Bounced" value={stats.bounced} icon={AlertTriangle} color={COLORS.danger} />
        </div>
        <div className="flex gap-1.5 ml-3">
          <button
            onClick={handleExportCsv}
            className="p-2 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            title="Export CSV"
          >
            <FileDown size={16} />
          </button>
          <button
            onClick={handleExportPdf}
            className="p-2 text-text-tertiary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            title="Export PDF"
          >
            <Download size={16} />
          </button>
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
    </div>
  );
}
