import { create } from "zustand";
import { getLabelsForAccount, deleteLabel as dbDeleteLabel, updateLabelSortOrder } from "@/services/db/labels";
import { upsertLabel } from "@/services/db/labels";
import { getGmailClient } from "@/services/gmail/tokenManager";

export interface Label {
  id: string;
  accountId: string;
  name: string;
  type: string;
  colorBg: string | null;
  colorFg: string | null;
  sortOrder: number;
}

// System labels that are already shown as nav items in the sidebar
const SYSTEM_LABEL_IDS = new Set([
  "INBOX",
  "SENT",
  "DRAFT",
  "TRASH",
  "SPAM",
  "STARRED",
  "UNREAD",
  "IMPORTANT",
  "SNOOZED",
  "CHAT",
]);

const CATEGORY_PREFIX = "CATEGORY_";

export function isSystemLabel(id: string): boolean {
  return SYSTEM_LABEL_IDS.has(id) || id.startsWith(CATEGORY_PREFIX);
}

interface LabelState {
  labels: Label[];
  /** All labels keyed by accountId — loaded for every account in multi-account mode */
  allAccountLabels: Record<string, Label[]>;
  unreadCounts: Record<string, number>;
  categoryUnreadCounts: Record<string, number>;
  /** Cross-account unread counts: accountId → labelId → count */
  globalUnreadCounts: Record<string, Record<string, number>>;
  isLoading: boolean;
  loadLabels: (accountId: string) => Promise<void>;
  loadAllAccountLabels: (accountIds: string[]) => Promise<void>;
  refreshUnreadCounts: (accountId: string) => Promise<void>;
  refreshGlobalUnreadCounts: (accountIds: string[]) => Promise<void>;
  clearLabels: () => void;
  createLabel: (accountId: string, name: string, color?: { textColor: string; backgroundColor: string }) => Promise<void>;
  updateLabel: (accountId: string, labelId: string, updates: { name?: string; color?: { textColor: string; backgroundColor: string } | null }) => Promise<void>;
  deleteLabel: (accountId: string, labelId: string) => Promise<void>;
  reorderLabels: (accountId: string, labelIds: string[]) => Promise<void>;
  /** Internal: refresh allAccountLabels for a single account after mutations */
  _reloadAccountLabels: (accountId: string) => Promise<void>;
}

function mapDbLabels(dbLabels: Awaited<ReturnType<typeof getLabelsForAccount>>): Label[] {
  return dbLabels
    .filter((l) => !isSystemLabel(l.id))
    .map((l) => ({
      id: l.id,
      accountId: l.account_id,
      name: l.name,
      type: l.type,
      colorBg: l.color_bg,
      colorFg: l.color_fg,
      sortOrder: l.sort_order,
    }));
}

export const useLabelStore = create<LabelState>((set, get) => ({
  labels: [],
  allAccountLabels: {},
  unreadCounts: {},
  categoryUnreadCounts: {},
  globalUnreadCounts: {},
  isLoading: false,

  loadLabels: async (accountId: string) => {
    set({ isLoading: true });
    try {
      const dbLabels = await getLabelsForAccount(accountId);
      const labels = mapDbLabels(dbLabels);
      set({ labels, isLoading: false });
    } catch (err) {
      console.error("Failed to load labels:", err);
      set({ isLoading: false });
    }
  },

  loadAllAccountLabels: async (accountIds: string[]) => {
    try {
      const results = await Promise.all(accountIds.map((id) => getLabelsForAccount(id)));
      const allAccountLabels: Record<string, Label[]> = {};
      accountIds.forEach((id, i) => {
        allAccountLabels[id] = mapDbLabels(results[i] ?? []);
      });
      set({ allAccountLabels });
    } catch (err) {
      console.error("Failed to load all account labels:", err);
    }
  },

  refreshUnreadCounts: async (accountId: string) => {
    try {
      const { getUnreadCountsByLabel, getUnreadCountsByCategory } = await import("@/services/db/threads");
      const [unreadCounts, categoryUnreadCounts] = await Promise.all([
        getUnreadCountsByLabel(accountId),
        getUnreadCountsByCategory(accountId),
      ]);
      set({ unreadCounts, categoryUnreadCounts });
    } catch (err) {
      console.error("Failed to refresh label unread counts:", err);
    }
  },

  refreshGlobalUnreadCounts: async (accountIds: string[]) => {
    try {
      const { getGlobalUnreadCounts } = await import("@/services/db/threads");
      const countsMap = await getGlobalUnreadCounts(accountIds);
      const globalUnreadCounts: Record<string, Record<string, number>> = {};
      for (const [accountId, labelMap] of countsMap) {
        globalUnreadCounts[accountId] = Object.fromEntries(labelMap);
      }
      set({ globalUnreadCounts });
    } catch (err) {
      console.error("Failed to refresh global unread counts:", err);
    }
  },

  clearLabels: () => set({ labels: [], allAccountLabels: {}, unreadCounts: {}, categoryUnreadCounts: {}, globalUnreadCounts: {}, isLoading: false }),

  createLabel: async (accountId: string, name: string, color?: { textColor: string; backgroundColor: string }) => {
    const client = await getGmailClient(accountId);
    const gmailLabel = await client.createLabel(name, color);
    await upsertLabel({
      id: gmailLabel.id,
      accountId,
      name: gmailLabel.name,
      type: gmailLabel.type,
      colorBg: gmailLabel.color?.backgroundColor ?? null,
      colorFg: gmailLabel.color?.textColor ?? null,
    });
    await get().loadLabels(accountId);
    await get()._reloadAccountLabels(accountId);
  },

  updateLabel: async (accountId: string, labelId: string, updates: { name?: string; color?: { textColor: string; backgroundColor: string } | null }) => {
    const client = await getGmailClient(accountId);
    const gmailLabel = await client.updateLabel(labelId, updates);
    await upsertLabel({
      id: gmailLabel.id,
      accountId,
      name: gmailLabel.name,
      type: gmailLabel.type,
      colorBg: gmailLabel.color?.backgroundColor ?? null,
      colorFg: gmailLabel.color?.textColor ?? null,
    });
    await get().loadLabels(accountId);
    await get()._reloadAccountLabels(accountId);
  },

  deleteLabel: async (accountId: string, labelId: string) => {
    const client = await getGmailClient(accountId);
    await client.deleteLabel(labelId);
    await dbDeleteLabel(accountId, labelId);
    await get().loadLabels(accountId);
    await get()._reloadAccountLabels(accountId);
  },

  reorderLabels: async (accountId: string, labelIds: string[]) => {
    const labelOrders = labelIds.map((id, index) => ({ id, sortOrder: index }));
    await updateLabelSortOrder(accountId, labelOrders);
    await get().loadLabels(accountId);
    await get()._reloadAccountLabels(accountId);
  },

  _reloadAccountLabels: async (accountId: string) => {
    try {
      const dbLabels = await getLabelsForAccount(accountId);
      const labels = mapDbLabels(dbLabels);
      set((s) => ({ allAccountLabels: { ...s.allAccountLabels, [accountId]: labels } }));
    } catch { /* silent */ }
  },
}));
