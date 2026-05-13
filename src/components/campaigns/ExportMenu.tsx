import { useState, useRef, useEffect } from "react";
import { FileDown, Download, FileText } from "lucide-react";
import { exportCampaignToCSV, downloadCSV } from "@/services/export/csvExport";
import { invoke } from "@tauri-apps/api/core";
import type { CampaignAnalytics } from "@/services/campaigns/analyticsService";

interface ExportMenuProps {
  campaignId: string;
  campaignName: string;
  analytics: CampaignAnalytics;
}

export function ExportMenu({ campaignId, campaignName, analytics }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const csv = await exportCampaignToCSV(campaignId);
      const filename = `${campaignName.replace(/\s+/g, "_")}_recipients.csv`;
      downloadCSV(csv, filename);
    } catch (err) {
      console.error("CSV export failed:", err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  }

  async function handleExportPDF() {
    setExporting(true);
    try {
      const data = JSON.stringify({
        name: campaignName,
        total_sent: analytics.totalSent,
        unique_opens: analytics.uniqueOpens,
        total_clicks: analytics.totalClicks,
        bounced_count: analytics.bouncedCount,
        open_rate: analytics.openRate,
        click_rate: analytics.clickRate,
        bounce_rate: analytics.bounceRate,
        daily_stats: analytics.dailyStats,
        top_links: analytics.topLinks,
      });
      const path = await invoke<string>("export_analytics_report", { campaignData: data });
      console.log("PDF report saved to:", path);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary border border-border-primary rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
      >
        <Download size={14} />
        {exporting ? "Exporting..." : "Export"}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 glass-modal rounded-lg py-1 z-50 shadow-xl border border-border-primary">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors text-left"
          >
            <FileDown size={14} className="text-text-tertiary" />
            <span>CSV (raw data)</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary hover:bg-bg-hover transition-colors text-left"
          >
            <FileText size={14} className="text-text-tertiary" />
            <span>PDF (report)</span>
          </button>
        </div>
      )}
    </div>
  );
}
