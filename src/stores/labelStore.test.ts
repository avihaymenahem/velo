import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLabelStore, isSystemLabel } from "./labelStore";

vi.mock("@/services/db/labels", () => ({
  getLabelsForAccount: vi.fn(),
  deleteLabel: vi.fn(),
  updateLabelSortOrder: vi.fn(),
  upsertLabel: vi.fn(),
}));

vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn(),
}));

import { getLabelsForAccount, deleteLabel as dbDeleteLabel, updateLabelSortOrder, upsertLabel } from "@/services/db/labels";
import { getGmailClient } from "@/services/gmail/tokenManager";

const mockGetLabels = vi.mocked(getLabelsForAccount);
const mockDbDeleteLabel = vi.mocked(dbDeleteLabel);
const mockUpdateSortOrder = vi.mocked(updateLabelSortOrder);
const mockUpsertLabel = vi.mocked(upsertLabel);
const mockGetGmailClient = vi.mocked(getGmailClient);
import { createMockGmailClient } from "@/test/mocks";

describe("labelStore", () => {
  beforeEach(() => {
    useLabelStore.setState({ labels: [], isLoading: false });
    vi.clearAllMocks();
  });

  it("should have correct default state", () => {
    const state = useLabelStore.getState();
    expect(state.labels).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it("should clear labels", () => {
    useLabelStore.setState({
      labels: [
        { id: "Label_1", accountId: "acc1", name: "Work", type: "user", colorBg: null, colorFg: null, sortOrder: 0 },
      ],
      isLoading: true,
    });
    useLabelStore.getState().clearLabels();
    const state = useLabelStore.getState();
    expect(state.labels).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it("should load labels and filter out system labels", async () => {
    mockGetLabels.mockResolvedValue([
      { id: "INBOX", account_id: "acc1", name: "INBOX", type: "system", color_bg: null, color_fg: null, visible: 1, sort_order: 0 },
      { id: "SENT", account_id: "acc1", name: "SENT", type: "system", color_bg: null, color_fg: null, visible: 1, sort_order: 1 },
      { id: "CATEGORY_SOCIAL", account_id: "acc1", name: "Social", type: "system", color_bg: null, color_fg: null, visible: 1, sort_order: 2 },
      { id: "Label_1", account_id: "acc1", name: "Work", type: "user", color_bg: "#4285f4", color_fg: "#ffffff", visible: 1, sort_order: 3 },
      { id: "Label_2", account_id: "acc1", name: "Personal", type: "user", color_bg: null, color_fg: null, visible: 1, sort_order: 4 },
    ]);

    await useLabelStore.getState().loadLabels("acc1");

    const state = useLabelStore.getState();
    expect(state.labels).toHaveLength(2);
    expect(state.labels[0]).toEqual({
      id: "Label_1",
      accountId: "acc1",
      name: "Work",
      type: "user",
      colorBg: "#4285f4",
      colorFg: "#ffffff",
      sortOrder: 3,
    });
    expect(state.labels[1]).toEqual({
      id: "Label_2",
      accountId: "acc1",
      name: "Personal",
      type: "user",
      colorBg: null,
      colorFg: null,
      sortOrder: 4,
    });
    expect(state.isLoading).toBe(false);
  });

  it("should handle load error gracefully", async () => {
    mockGetLabels.mockRejectedValue(new Error("DB error"));
    await useLabelStore.getState().loadLabels("acc1");
    const state = useLabelStore.getState();
    expect(state.labels).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it("should create a label via Gmail API and update DB", async () => {
    const mockClient = createMockGmailClient();
    mockClient.createLabel.mockResolvedValue({
      id: "Label_new",
      name: "New Label",
      type: "user",
      color: { backgroundColor: "#fb4c2f", textColor: "#ffffff" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetGmailClient.mockResolvedValue(mockClient as any);
    mockUpsertLabel.mockResolvedValue(undefined);
    mockGetLabels.mockResolvedValue([]);

    await useLabelStore.getState().createLabel("acc1", "New Label", { textColor: "#ffffff", backgroundColor: "#fb4c2f" });

    expect(mockClient.createLabel).toHaveBeenCalledWith("New Label", { textColor: "#ffffff", backgroundColor: "#fb4c2f" });
    expect(mockUpsertLabel).toHaveBeenCalledWith({
      id: "Label_new",
      accountId: "acc1",
      name: "New Label",
      type: "user",
      colorBg: "#fb4c2f",
      colorFg: "#ffffff",
    });
    expect(mockGetLabels).toHaveBeenCalledWith("acc1");
  });

  it("should update a label via Gmail API and update DB", async () => {
    const mockClient = createMockGmailClient();
    mockClient.updateLabel.mockResolvedValue({
      id: "Label_1",
      name: "Renamed",
      type: "user",
      color: { backgroundColor: "#16a765", textColor: "#ffffff" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetGmailClient.mockResolvedValue(mockClient as any);
    mockUpsertLabel.mockResolvedValue(undefined);
    mockGetLabels.mockResolvedValue([]);

    await useLabelStore.getState().updateLabel("acc1", "Label_1", {
      name: "Renamed",
      color: { textColor: "#ffffff", backgroundColor: "#16a765" },
    });

    expect(mockClient.updateLabel).toHaveBeenCalledWith("Label_1", {
      name: "Renamed",
      color: { textColor: "#ffffff", backgroundColor: "#16a765" },
    });
    expect(mockUpsertLabel).toHaveBeenCalled();
  });

  it("should delete a label via Gmail API and DB", async () => {
    const mockClient = createMockGmailClient();
    mockClient.deleteLabel.mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetGmailClient.mockResolvedValue(mockClient as any);
    mockDbDeleteLabel.mockResolvedValue(undefined);
    mockGetLabels.mockResolvedValue([]);

    await useLabelStore.getState().deleteLabel("acc1", "Label_1");

    expect(mockClient.deleteLabel).toHaveBeenCalledWith("Label_1");
    expect(mockDbDeleteLabel).toHaveBeenCalledWith("acc1", "Label_1");
    expect(mockGetLabels).toHaveBeenCalledWith("acc1");
  });

  it("should reorder labels by updating sort order in DB", async () => {
    mockUpdateSortOrder.mockResolvedValue(undefined);
    mockGetLabels.mockResolvedValue([]);

    await useLabelStore.getState().reorderLabels("acc1", ["Label_2", "Label_1", "Label_3"]);

    expect(mockUpdateSortOrder).toHaveBeenCalledWith("acc1", [
      { id: "Label_2", sortOrder: 0 },
      { id: "Label_1", sortOrder: 1 },
      { id: "Label_3", sortOrder: 2 },
    ]);
    expect(mockGetLabels).toHaveBeenCalledWith("acc1");
  });
});

describe("isSystemLabel", () => {
  it("should identify system labels", () => {
    expect(isSystemLabel("INBOX")).toBe(true);
    expect(isSystemLabel("SENT")).toBe(true);
    expect(isSystemLabel("DRAFT")).toBe(true);
    expect(isSystemLabel("TRASH")).toBe(true);
    expect(isSystemLabel("SPAM")).toBe(true);
    expect(isSystemLabel("STARRED")).toBe(true);
    expect(isSystemLabel("UNREAD")).toBe(true);
    expect(isSystemLabel("IMPORTANT")).toBe(true);
    expect(isSystemLabel("SNOOZED")).toBe(true);
    expect(isSystemLabel("CHAT")).toBe(true);
  });

  it("should identify category labels as system labels", () => {
    expect(isSystemLabel("CATEGORY_SOCIAL")).toBe(true);
    expect(isSystemLabel("CATEGORY_UPDATES")).toBe(true);
    expect(isSystemLabel("CATEGORY_PROMOTIONS")).toBe(true);
  });

  it("should not flag user labels as system labels", () => {
    expect(isSystemLabel("Label_1")).toBe(false);
    expect(isSystemLabel("Label_2")).toBe(false);
    expect(isSystemLabel("Work")).toBe(false);
  });
});
