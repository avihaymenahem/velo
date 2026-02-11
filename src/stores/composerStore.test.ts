import { describe, it, expect, beforeEach } from "vitest";
import { useComposerStore } from "./composerStore";

describe("composerStore", () => {
  beforeEach(() => {
    useComposerStore.setState({
      isOpen: false,
      mode: "new",
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      bodyHtml: "",
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

  it("starts closed", () => {
    const state = useComposerStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.mode).toBe("new");
    expect(state.to).toEqual([]);
  });

  it("opens with default values", () => {
    useComposerStore.getState().openComposer();
    const state = useComposerStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("new");
    expect(state.to).toEqual([]);
    expect(state.subject).toBe("");
  });

  it("opens with custom values for reply", () => {
    useComposerStore.getState().openComposer({
      mode: "reply",
      to: ["user@example.com"],
      subject: "Re: Test",
      bodyHtml: "<p>quoted</p>",
      threadId: "thread-1",
      inReplyToMessageId: "msg-1",
    });
    const state = useComposerStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.mode).toBe("reply");
    expect(state.to).toEqual(["user@example.com"]);
    expect(state.subject).toBe("Re: Test");
    expect(state.threadId).toBe("thread-1");
    expect(state.inReplyToMessageId).toBe("msg-1");
  });

  it("opens with cc shows cc/bcc fields", () => {
    useComposerStore.getState().openComposer({
      mode: "replyAll",
      to: ["a@b.com"],
      cc: ["c@d.com"],
    });
    const state = useComposerStore.getState();
    expect(state.showCcBcc).toBe(true);
    expect(state.cc).toEqual(["c@d.com"]);
  });

  it("closes and resets all fields", () => {
    useComposerStore.getState().openComposer({
      mode: "reply",
      to: ["user@example.com"],
      subject: "Re: Test",
    });
    useComposerStore.getState().closeComposer();
    const state = useComposerStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.to).toEqual([]);
    expect(state.subject).toBe("");
    expect(state.threadId).toBeNull();
  });

  it("updates individual fields", () => {
    useComposerStore.getState().openComposer();
    useComposerStore.getState().setTo(["a@b.com"]);
    useComposerStore.getState().setCc(["c@d.com"]);
    useComposerStore.getState().setBcc(["e@f.com"]);
    useComposerStore.getState().setSubject("Test Subject");
    useComposerStore.getState().setBodyHtml("<p>Hello</p>");

    const state = useComposerStore.getState();
    expect(state.to).toEqual(["a@b.com"]);
    expect(state.cc).toEqual(["c@d.com"]);
    expect(state.bcc).toEqual(["e@f.com"]);
    expect(state.subject).toBe("Test Subject");
    expect(state.bodyHtml).toBe("<p>Hello</p>");
  });

  it("manages undo send visibility", () => {
    useComposerStore.getState().setUndoSendVisible(true);
    expect(useComposerStore.getState().undoSendVisible).toBe(true);
    useComposerStore.getState().setUndoSendVisible(false);
    expect(useComposerStore.getState().undoSendVisible).toBe(false);
  });

  it("adds and removes attachments", () => {
    const attachment = {
      id: "att-1",
      file: new File(["content"], "test.txt"),
      filename: "test.txt",
      mimeType: "text/plain",
      size: 7,
      content: "Y29udGVudA==",
    };

    useComposerStore.getState().addAttachment(attachment);
    expect(useComposerStore.getState().attachments).toHaveLength(1);
    expect(useComposerStore.getState().attachments[0]?.filename).toBe("test.txt");

    useComposerStore.getState().removeAttachment("att-1");
    expect(useComposerStore.getState().attachments).toHaveLength(0);
  });

  it("clears attachments", () => {
    useComposerStore.getState().addAttachment({
      id: "att-1",
      file: new File(["a"], "a.txt"),
      filename: "a.txt",
      mimeType: "text/plain",
      size: 1,
      content: "YQ==",
    });
    useComposerStore.getState().addAttachment({
      id: "att-2",
      file: new File(["b"], "b.txt"),
      filename: "b.txt",
      mimeType: "text/plain",
      size: 1,
      content: "Yg==",
    });
    expect(useComposerStore.getState().attachments).toHaveLength(2);

    useComposerStore.getState().clearAttachments();
    expect(useComposerStore.getState().attachments).toHaveLength(0);
  });

  it("resets attachments when composer opens and closes", () => {
    useComposerStore.getState().addAttachment({
      id: "att-1",
      file: new File(["x"], "x.txt"),
      filename: "x.txt",
      mimeType: "text/plain",
      size: 1,
      content: "eA==",
    });

    useComposerStore.getState().openComposer();
    expect(useComposerStore.getState().attachments).toHaveLength(0);

    useComposerStore.getState().addAttachment({
      id: "att-2",
      file: new File(["y"], "y.txt"),
      filename: "y.txt",
      mimeType: "text/plain",
      size: 1,
      content: "eQ==",
    });

    useComposerStore.getState().closeComposer();
    expect(useComposerStore.getState().attachments).toHaveLength(0);
  });

  it("manages draft auto-save state", () => {
    useComposerStore.getState().setIsSaving(true);
    expect(useComposerStore.getState().isSaving).toBe(true);

    const ts = Date.now();
    useComposerStore.getState().setLastSavedAt(ts);
    expect(useComposerStore.getState().lastSavedAt).toBe(ts);

    useComposerStore.getState().setIsSaving(false);
    expect(useComposerStore.getState().isSaving).toBe(false);
  });

  it("resets draft state on open/close", () => {
    useComposerStore.getState().setIsSaving(true);
    useComposerStore.getState().setLastSavedAt(12345);
    useComposerStore.getState().setSignatureHtml("<p>Sig</p>");
    useComposerStore.getState().setSignatureId("sig-1");

    useComposerStore.getState().openComposer();
    expect(useComposerStore.getState().isSaving).toBe(false);
    expect(useComposerStore.getState().lastSavedAt).toBeNull();
    expect(useComposerStore.getState().signatureHtml).toBe("");
    expect(useComposerStore.getState().signatureId).toBeNull();

    useComposerStore.getState().setSignatureHtml("<p>Sig2</p>");
    useComposerStore.getState().setSignatureId("sig-2");

    useComposerStore.getState().closeComposer();
    expect(useComposerStore.getState().signatureHtml).toBe("");
    expect(useComposerStore.getState().signatureId).toBeNull();
  });

  it("manages signature state", () => {
    useComposerStore.getState().setSignatureHtml("<p>My Signature</p>");
    expect(useComposerStore.getState().signatureHtml).toBe("<p>My Signature</p>");

    useComposerStore.getState().setSignatureId("sig-1");
    expect(useComposerStore.getState().signatureId).toBe("sig-1");
  });
});
