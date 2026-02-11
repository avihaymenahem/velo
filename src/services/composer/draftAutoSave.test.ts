import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useComposerStore } from "@/stores/composerStore";
import { startAutoSave, stopAutoSave } from "./draftAutoSave";

// Mock dependencies
vi.mock("@/services/gmail/tokenManager", () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    createDraft: vi.fn().mockResolvedValue({ id: "draft-1", message: {} }),
    updateDraft: vi.fn().mockResolvedValue({ id: "draft-1", message: {} }),
  }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: {
    getState: () => ({
      accounts: [{ id: "account-1", email: "test@example.com" }],
    }),
  },
}));

describe("draftAutoSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useComposerStore.setState({
      isOpen: true,
      mode: "new",
      to: ["recipient@example.com"],
      cc: [],
      bcc: [],
      subject: "Test",
      bodyHtml: "<p>Hello</p>",
      threadId: null,
      inReplyToMessageId: null,
      showCcBcc: false,
      draftId: null,
      undoSendTimer: null,
      undoSendVisible: false,
      attachments: [],
      lastSavedAt: null,
      isSaving: false,
      signatureHtml: "",
      signatureId: null,
    });
  });

  afterEach(() => {
    stopAutoSave();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts and stops without error", () => {
    startAutoSave("account-1");
    stopAutoSave();
  });

  it("triggers save after debounce when body changes", async () => {
    startAutoSave("account-1");

    // Simulate a body change
    useComposerStore.getState().setBodyHtml("<p>Updated</p>");

    // Before debounce, draft should not be saved
    expect(useComposerStore.getState().draftId).toBeNull();

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(3500);

    // Draft should now be saved
    expect(useComposerStore.getState().draftId).toBe("draft-1");
    expect(useComposerStore.getState().lastSavedAt).not.toBeNull();
  });

  it("does not save when composer is closed", async () => {
    startAutoSave("account-1");

    useComposerStore.setState({ isOpen: false });
    useComposerStore.getState().setSubject("Changed");

    await vi.advanceTimersByTimeAsync(3500);

    expect(useComposerStore.getState().draftId).toBeNull();
  });
});
