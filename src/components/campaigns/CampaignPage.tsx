import { useEffect } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useCampaignStore } from "@/stores/campaignStore";
import { CampaignList } from "./CampaignList";

export function CampaignPage() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const loadCampaigns = useCampaignStore((s) => s.loadCampaigns);

  useEffect(() => {
    if (activeAccountId) {
      loadCampaigns(activeAccountId);
    }
  }, [activeAccountId, loadCampaigns]);

  if (!activeAccountId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
        Select an account to view campaigns
      </div>
    );
  }

  return <CampaignList accountId={activeAccountId} />;
}
