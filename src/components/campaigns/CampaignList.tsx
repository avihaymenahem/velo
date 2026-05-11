import { useState } from "react";
import { Send, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useCampaignStore, type Campaign } from "@/stores/campaignStore";
import { CAMPAIGN_STATUS_COLORS } from "@/constants/campaignDefaults";
import { CampaignAnalytics } from "./CampaignAnalytics";
import { CampaignComposer } from "./CampaignComposer";
import { EmptyState } from "@/components/ui/EmptyState";

interface CampaignListProps {
  accountId: string;
}

export function CampaignList({ accountId }: CampaignListProps) {
  const campaigns = useCampaignStore((s) => s.campaigns);
  const isLoading = useCampaignStore((s) => s.isLoading);
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const loadStats = useCampaignStore((s) => s.loadStats);
  const stats = useCampaignStore((s) => s.stats);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  function handleToggle(campaign: Campaign) {
    if (expandedId === campaign.id) {
      setExpandedId(null);
    } else {
      setExpandedId(campaign.id);
      if (!stats[campaign.id]) {
        loadStats(campaign.id);
      }
    }
  }

  if (!isLoading && campaigns.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Campaigns</h2>
          <button
            onClick={() => setShowComposer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
          >
            <Plus size={14} />
            New Campaign
          </button>
        </div>
        <div className="flex-1">
          <EmptyState icon={Send} title="No campaigns yet" subtitle="Create your first email campaign" />
        </div>
        <CampaignComposer isOpen={showComposer} onClose={() => setShowComposer(false)} accountId={accountId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-primary">
        <h2 className="text-lg font-semibold text-text-primary">Campaigns</h2>
        <button
          onClick={() => setShowComposer(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Campaign
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-text-tertiary">Loading campaigns...</div>
        ) : (
          <div className="p-4 space-y-2">
            {campaigns.map((c) => {
              const isExpanded = expandedId === c.id;
              const colorClass = CAMPAIGN_STATUS_COLORS[c.status] ?? "text-text-tertiary";
              return (
                <div key={c.id} className="glass-panel rounded-lg overflow-hidden">
                  <button
                    onClick={() => handleToggle(c)}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-bg-hover transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={14} className="text-text-tertiary shrink-0" /> : <ChevronRight size={14} className="text-text-tertiary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate block">{c.name}</span>
                    </div>
                    <span className={`text-xs font-medium ${colorClass}`}>{c.status}</span>
                    <span className="text-xs text-text-tertiary">{c.sent_count} sent</span>
                    <span className="text-xs text-text-tertiary">{new Date(c.created_at * 1000).toLocaleDateString()}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }}
                      className="p-1 text-text-tertiary hover:text-danger transition-colors"
                      title="Delete campaign"
                    >
                      <Trash2 size={14} />
                    </button>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border-primary">
                      <CampaignAnalytics stats={stats[c.id] ?? { total: 0, sent: 0, opened: 0, clicked: 0, bounced: 0 }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CampaignComposer isOpen={showComposer} onClose={() => setShowComposer(false)} accountId={accountId} />
    </div>
  );
}
