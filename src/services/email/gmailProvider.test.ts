import { GmailApiProvider } from "./gmailProvider";
import type { GmailClient } from "../gmail/client";

function createMockClient(): GmailClient {
  return {
    listLabels: vi.fn(),
    createLabel: vi.fn(),
    deleteLabel: vi.fn(),
    updateLabel: vi.fn(),
    modifyThread: vi.fn(),
    deleteThread: vi.fn(),
    getMessage: vi.fn(),
    getAttachment: vi.fn(),
    sendMessage: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
    getProfile: vi.fn(),
    getHistory: vi.fn(),
    getThread: vi.fn(),
    listThreads: vi.fn(),
    listDrafts: vi.fn(),
    request: vi.fn(),
  } as unknown as GmailClient;
}

describe("GmailApiProvider", () => {
  let provider: GmailApiProvider;
  let mockClient: GmailClient;

  beforeEach(() => {
    mockClient = createMockClient();
    provider = new GmailApiProvider("account-1", mockClient);
  });

  it("has correct accountId and type", () => {
    expect(provider.accountId).toBe("account-1");
    expect(provider.type).toBe("gmail_api");
  });

  describe("listFolders", () => {
    it("maps Gmail labels to EmailFolder format", async () => {
      vi.mocked(mockClient.listLabels).mockResolvedValue({
        labels: [
          {
            id: "INBOX",
            name: "INBOX",
            type: "system",
            messagesTotal: 100,
            messagesUnread: 5,
          },
          {
            id: "SENT",
            name: "SENT",
            type: "system",
            messagesTotal: 50,
            messagesUnread: 0,
          },
          {
            id: "Label_1",
            name: "My Label",
            type: "user",
            messagesTotal: 10,
            messagesUnread: 2,
          },
        ],
      });

      const folders = await provider.listFolders();

      expect(folders).toHaveLength(3);
      expect(folders[0]).toEqual({
        id: "INBOX",
        name: "INBOX",
        path: "INBOX",
        type: "system",
        specialUse: null,
        delimiter: "/",
        messageCount: 100,
        unreadCount: 5,
      });
      expect(folders[1]).toEqual({
        id: "SENT",
        name: "SENT",
        path: "SENT",
        type: "system",
        specialUse: "\\Sent",
        delimiter: "/",
        messageCount: 50,
        unreadCount: 0,
      });
      expect(folders[2]).toEqual({
        id: "Label_1",
        name: "My Label",
        path: "My Label",
        type: "user",
        specialUse: null,
        delimiter: "/",
        messageCount: 10,
        unreadCount: 2,
      });
    });

    it("maps special-use flags for system labels", async () => {
      vi.mocked(mockClient.listLabels).mockResolvedValue({
        labels: [
          { id: "TRASH", name: "TRASH", type: "system" },
          { id: "DRAFT", name: "DRAFT", type: "system" },
          { id: "SPAM", name: "SPAM", type: "system" },
        ],
      });

      const folders = await provider.listFolders();

      expect(folders[0]!.specialUse).toBe("\\Trash");
      expect(folders[1]!.specialUse).toBe("\\Drafts");
      expect(folders[2]!.specialUse).toBe("\\Junk");
    });
  });

  describe("createFolder", () => {
    it("creates a label and returns EmailFolder", async () => {
      vi.mocked(mockClient.createLabel).mockResolvedValue({
        id: "Label_new",
        name: "New Folder",
        type: "user",
      });

      const folder = await provider.createFolder("New Folder");

      expect(mockClient.createLabel).toHaveBeenCalledWith("New Folder");
      expect(folder.id).toBe("Label_new");
      expect(folder.name).toBe("New Folder");
      expect(folder.type).toBe("user");
    });

    it("prepends parent path when provided", async () => {
      vi.mocked(mockClient.createLabel).mockResolvedValue({
        id: "Label_nested",
        name: "Parent/Child",
        type: "user",
      });

      await provider.createFolder("Child", "Parent");

      expect(mockClient.createLabel).toHaveBeenCalledWith("Parent/Child");
    });
  });

  describe("archive", () => {
    it("calls modifyThread removing INBOX label", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.archive("thread-1", ["msg-1"]);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        undefined,
        ["INBOX"],
      );
    });
  });

  describe("trash", () => {
    it("calls modifyThread adding TRASH and removing INBOX", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.trash("thread-1", ["msg-1"]);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["TRASH"],
        ["INBOX"],
      );
    });
  });

  describe("permanentDelete", () => {
    it("calls deleteThread", async () => {
      vi.mocked(mockClient.deleteThread).mockResolvedValue(undefined);

      await provider.permanentDelete("thread-1", ["msg-1"]);

      expect(mockClient.deleteThread).toHaveBeenCalledWith("thread-1");
    });
  });

  describe("markRead", () => {
    it("removes UNREAD label when marking as read", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.markRead("thread-1", ["msg-1"], true);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        undefined,
        ["UNREAD"],
      );
    });

    it("adds UNREAD label when marking as unread", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.markRead("thread-1", ["msg-1"], false);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["UNREAD"],
        undefined,
      );
    });
  });

  describe("star", () => {
    it("adds STARRED label when starring", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.star("thread-1", ["msg-1"], true);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["STARRED"],
        undefined,
      );
    });

    it("removes STARRED label when unstarring", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.star("thread-1", ["msg-1"], false);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        undefined,
        ["STARRED"],
      );
    });
  });

  describe("spam", () => {
    it("adds SPAM and removes INBOX when marking as spam", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.spam("thread-1", ["msg-1"], true);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["SPAM"],
        ["INBOX"],
      );
    });

    it("adds INBOX and removes SPAM when marking as not spam", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.spam("thread-1", ["msg-1"], false);

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["INBOX"],
        ["SPAM"],
      );
    });
  });

  describe("sendMessage", () => {
    it("delegates to client.sendMessage and returns id", async () => {
      vi.mocked(mockClient.sendMessage).mockResolvedValue({
        id: "sent-msg-1",
        threadId: "thread-1",
        labelIds: ["SENT"],
        snippet: "",
        historyId: "456",
        internalDate: "1700000000000",
        payload: {
          partId: "",
          mimeType: "text/plain",
          filename: "",
          headers: [],
          body: { size: 0 },
        },
        sizeEstimate: 100,
      });

      const result = await provider.sendMessage("base64data", "thread-1");

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        "base64data",
        "thread-1",
      );
      expect(result).toEqual({ id: "sent-msg-1" });
    });
  });

  describe("createDraft", () => {
    it("delegates to client.createDraft and returns draftId", async () => {
      vi.mocked(mockClient.createDraft).mockResolvedValue({
        id: "draft-1",
        message: {
          id: "msg-1",
          threadId: "thread-1",
          labelIds: ["DRAFT"],
          snippet: "",
          historyId: "789",
          internalDate: "1700000000000",
          payload: {
            partId: "",
            mimeType: "text/plain",
            filename: "",
            headers: [],
            body: { size: 0 },
          },
          sizeEstimate: 100,
        },
      });

      const result = await provider.createDraft("base64data", "thread-1");

      expect(mockClient.createDraft).toHaveBeenCalledWith(
        "base64data",
        "thread-1",
      );
      expect(result).toEqual({ draftId: "draft-1" });
    });
  });

  describe("updateDraft", () => {
    it("delegates to client.updateDraft and returns draftId", async () => {
      vi.mocked(mockClient.updateDraft).mockResolvedValue({
        id: "draft-1",
        message: {
          id: "msg-1",
          threadId: "thread-1",
          labelIds: ["DRAFT"],
          snippet: "",
          historyId: "789",
          internalDate: "1700000000000",
          payload: {
            partId: "",
            mimeType: "text/plain",
            filename: "",
            headers: [],
            body: { size: 0 },
          },
          sizeEstimate: 100,
        },
      });

      const result = await provider.updateDraft(
        "draft-1",
        "base64data",
        "thread-1",
      );

      expect(mockClient.updateDraft).toHaveBeenCalledWith(
        "draft-1",
        "base64data",
        "thread-1",
      );
      expect(result).toEqual({ draftId: "draft-1" });
    });
  });

  describe("deleteDraft", () => {
    it("delegates to client.deleteDraft", async () => {
      vi.mocked(mockClient.deleteDraft).mockResolvedValue(undefined);

      await provider.deleteDraft("draft-1");

      expect(mockClient.deleteDraft).toHaveBeenCalledWith("draft-1");
    });
  });

  describe("testConnection", () => {
    it("returns success when getProfile succeeds", async () => {
      vi.mocked(mockClient.getProfile).mockResolvedValue({
        emailAddress: "user@gmail.com",
        messagesTotal: 1000,
        threadsTotal: 500,
        historyId: "12345",
      });

      const result = await provider.testConnection();

      expect(result).toEqual({
        success: true,
        message: "Connected as user@gmail.com",
      });
    });

    it("returns failure when getProfile throws", async () => {
      vi.mocked(mockClient.getProfile).mockRejectedValue(
        new Error("Token expired"),
      );

      const result = await provider.testConnection();

      expect(result).toEqual({
        success: false,
        message: "Token expired",
      });
    });
  });

  describe("getProfile", () => {
    it("returns email from Gmail profile", async () => {
      vi.mocked(mockClient.getProfile).mockResolvedValue({
        emailAddress: "user@gmail.com",
        messagesTotal: 1000,
        threadsTotal: 500,
        historyId: "12345",
      });

      const result = await provider.getProfile();

      expect(result).toEqual({ email: "user@gmail.com" });
    });
  });

  describe("fetchAttachment", () => {
    it("delegates to client.getAttachment", async () => {
      vi.mocked(mockClient.getAttachment).mockResolvedValue({
        attachmentId: "att-1",
        size: 1024,
        data: "base64data",
      });

      const result = await provider.fetchAttachment("msg-1", "att-1");

      expect(mockClient.getAttachment).toHaveBeenCalledWith("msg-1", "att-1");
      expect(result).toEqual({ data: "base64data", size: 1024 });
    });
  });

  describe("addLabel / removeLabel", () => {
    it("addLabel calls modifyThread with add", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.addLabel("thread-1", "Label_1");

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        ["Label_1"],
        undefined,
      );
    });

    it("removeLabel calls modifyThread with remove", async () => {
      vi.mocked(mockClient.modifyThread).mockResolvedValue({
        id: "thread-1",
        historyId: "123",
        messages: [],
      });

      await provider.removeLabel("thread-1", "Label_1");

      expect(mockClient.modifyThread).toHaveBeenCalledWith(
        "thread-1",
        undefined,
        ["Label_1"],
      );
    });
  });
});
