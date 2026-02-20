import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/services/db/smartFolders", () => ({
  getSmartFolders: vi.fn(() => Promise.resolve([])),
  insertSmartFolder: vi.fn(() => Promise.resolve("new-id")),
  updateSmartFolder: vi.fn(() => Promise.resolve()),
  deleteSmartFolder: vi.fn(() => Promise.resolve()),
  updateSmartFolderSortOrder: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/services/search/smartFolderQuery", () => ({
  getSmartFolderUnreadCount: vi.fn(() => ({
    sql: "SELECT COUNT(DISTINCT m.id) as count FROM messages m WHERE m.is_read = 0",
    params: [],
  })),
}));

vi.mock("@/services/db/connection", () => ({
  getDb: vi.fn(() =>
    Promise.resolve({
      select: vi.fn(() => Promise.resolve([{ count: 5 }])),
    }),
  ),
}));

import {
  getSmartFolders,
  insertSmartFolder,
  deleteSmartFolder,
} from "@/services/db/smartFolders";
import { useSmartFolderStore } from "./smartFolderStore";

describe("smartFolderStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSmartFolderStore.setState({
      folders: [],
      unreadCounts: {},
      isLoading: false,
    });
  });

  describe("loadFolders", () => {
    it("populates state with folders from DB", async () => {
      vi.mocked(getSmartFolders).mockResolvedValueOnce([
        {
          id: "sf-1",
          account_id: null,
          name: "Unread",
          query: "is:unread",
          icon: "MailOpen",
          color: null,
          sort_order: 0,
          is_default: 1,
          created_at: 1000,
        },
        {
          id: "sf-2",
          account_id: "acc-1",
          name: "Custom",
          query: "from:boss",
          icon: "Star",
          color: "#ff0000",
          sort_order: 1,
          is_default: 0,
          created_at: 2000,
        },
      ]);

      await useSmartFolderStore.getState().loadFolders("acc-1");

      const { folders, isLoading } = useSmartFolderStore.getState();
      expect(isLoading).toBe(false);
      expect(folders).toHaveLength(2);
      expect(folders[0]).toEqual({
        id: "sf-1",
        accountId: null,
        name: "Unread",
        query: "is:unread",
        icon: "MailOpen",
        color: null,
        isDefault: true,
        sortOrder: 0,
      });
      expect(folders[1]).toEqual({
        id: "sf-2",
        accountId: "acc-1",
        name: "Custom",
        query: "from:boss",
        icon: "Star",
        color: "#ff0000",
        isDefault: false,
        sortOrder: 1,
      });
    });

    it("sets isLoading during load", async () => {
      let resolveFn: () => void;
      vi.mocked(getSmartFolders).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFn = () => resolve([]);
        }),
      );

      const loadPromise = useSmartFolderStore.getState().loadFolders();
      expect(useSmartFolderStore.getState().isLoading).toBe(true);

      resolveFn!();
      await loadPromise;
      expect(useSmartFolderStore.getState().isLoading).toBe(false);
    });
  });

  describe("createFolder", () => {
    it("adds folder to list", async () => {
      vi.mocked(insertSmartFolder).mockResolvedValueOnce("new-id-123");

      const id = await useSmartFolderStore
        .getState()
        .createFolder("Test", "is:unread", "acc-1", "Search", "#000");

      expect(id).toBe("new-id-123");
      const { folders } = useSmartFolderStore.getState();
      expect(folders).toHaveLength(1);
      expect(folders[0]?.name).toBe("Test");
      expect(folders[0]?.query).toBe("is:unread");
      expect(folders[0]?.accountId).toBe("acc-1");
    });

    it("uses defaults for optional params", async () => {
      vi.mocked(insertSmartFolder).mockResolvedValueOnce("new-id");

      await useSmartFolderStore
        .getState()
        .createFolder("Minimal", "from:test");

      const { folders } = useSmartFolderStore.getState();
      expect(folders[0]?.icon).toBe("Search");
      expect(folders[0]?.color).toBeNull();
      expect(folders[0]?.accountId).toBeNull();
    });
  });

  describe("deleteFolder", () => {
    it("removes folder from list", async () => {
      useSmartFolderStore.setState({
        folders: [
          {
            id: "sf-1",
            accountId: null,
            name: "Unread",
            query: "is:unread",
            icon: "MailOpen",
            color: null,
            isDefault: true,
            sortOrder: 0,
          },
          {
            id: "sf-2",
            accountId: null,
            name: "Custom",
            query: "from:boss",
            icon: "Star",
            color: null,
            isDefault: false,
            sortOrder: 1,
          },
        ],
        unreadCounts: { "sf-1": 5, "sf-2": 3 },
      });

      await useSmartFolderStore.getState().deleteFolder("sf-1");

      const { folders, unreadCounts } = useSmartFolderStore.getState();
      expect(folders).toHaveLength(1);
      expect(folders[0]?.id).toBe("sf-2");
      expect(unreadCounts["sf-1"]).toBeUndefined();
      expect(unreadCounts["sf-2"]).toBe(3);
      expect(deleteSmartFolder).toHaveBeenCalledWith("sf-1");
    });
  });

  describe("refreshUnreadCounts", () => {
    it("populates unread counts for all folders", async () => {
      useSmartFolderStore.setState({
        folders: [
          {
            id: "sf-1",
            accountId: null,
            name: "Unread",
            query: "is:unread",
            icon: "MailOpen",
            color: null,
            isDefault: true,
            sortOrder: 0,
          },
        ],
      });

      await useSmartFolderStore.getState().refreshUnreadCounts("acc-1");

      const { unreadCounts } = useSmartFolderStore.getState();
      expect(unreadCounts["sf-1"]).toBe(5);
    });
  });
});
