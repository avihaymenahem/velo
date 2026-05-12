import { create } from "zustand";
import { queryWithRetry } from "@/services/db/connection";

export interface Campaign {
  id: string;
  name: string;
  template_id: string | null;
  segment_id: string | null;
  status: string;
  sent_count: number;
  sent_at: number | null;
  created_at: number;
}

export interface CampaignStat {
  total: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
}

interface CampaignState {
  campaigns: Campaign[];
  stats: Record<string, CampaignStat>;
  isLoading: boolean;
  loadCampaigns: (accountId: string) => Promise<void>;
  loadStats: (campaignId: string) => Promise<void>;
  createCampaign: (input: { accountId: string; name: string; templateId?: string; segmentId?: string }) => Promise<string>;
  deleteCampaign: (id: string) => Promise<void>;
}

function generateId(): string {
  return `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  stats: {},
  isLoading: false,

  loadCampaigns: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const rows = await queryWithRetry(async (db) =>
        db.select<Campaign[]>(
          "SELECT * FROM campaigns WHERE account_id = $1 ORDER BY created_at DESC",
          [accountId],
        ),
      );
      set({ campaigns: rows, isLoading: false });
    } catch (err) {
      console.error("Failed to load campaigns:", err);
      set({ isLoading: false });
    }
  },

  loadStats: async (campaignId: string) => {
    try {
      const rows = await queryWithRetry(async (db) =>
        db.select<{ status: string; count: number }[]>(
          "SELECT status, COUNT(*) as count FROM campaign_recipients WHERE campaign_id = $1 GROUP BY status",
          [campaignId],
        ),
      );
      const total = rows.reduce((sum, r) => sum + r.count, 0);
      const stat: CampaignStat = {
        total,
        sent: rows.find((r) => r.status === "sent")?.count ?? 0,
        opened: rows.find((r) => r.status === "opened")?.count ?? 0,
        clicked: rows.find((r) => r.status === "clicked")?.count ?? 0,
        bounced: rows.find((r) => r.status === "bounced")?.count ?? 0,
      };
      set((s) => ({ stats: { ...s.stats, [campaignId]: stat } }));
    } catch (err) {
      console.error("Failed to load campaign stats:", err);
    }
  },

  createCampaign: async (input) => {
    const id = generateId();
    try {
      await queryWithRetry(async (db) =>
        db.execute(
          "INSERT INTO campaigns (id, account_id, name, template_id, segment_id, status, sent_count, created_at) VALUES ($1, $2, $3, $4, $5, 'draft', 0, unixepoch())",
          [id, input.accountId, input.name, input.templateId ?? null, input.segmentId ?? null],
        ),
      );
      const row = await queryWithRetry(async (db) => db.select<Campaign[]>("SELECT * FROM campaigns WHERE id = $1", [id]));
      const created = row[0];
      if (created) {
        set((s) => ({ campaigns: [created, ...s.campaigns] }));
      }
    } catch (err) {
      console.error("Failed to create campaign:", err);
    }
    return id;
  },

  deleteCampaign: async (id: string) => {
    try {
      await queryWithRetry(async (db) => db.execute("DELETE FROM campaigns WHERE id = $1", [id]));
      set((s) => ({
        campaigns: s.campaigns.filter((c) => c.id !== id),
        stats: Object.fromEntries(Object.entries(s.stats).filter(([k]) => k !== id)),
      }));
    } catch (err) {
      console.error("Failed to delete campaign:", err);
    }
  },
}));
