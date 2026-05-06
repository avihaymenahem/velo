import { create } from "zustand";

export type ComposerMode = "new" | "reply" | "replyAll" | "forward";
export type ComposerViewMode = "modal" | "fullpage";

export interface ComposerAttachment {
  id: string;
  file: File;
  filename: string;
  mimeType: string;
  size: number;
  content: string; // base64
}

export interface ComposerState {
  isOpen: boolean;
  mode: ComposerMode;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  quotedHtml?: string; // Citazioni per reply/forward (vuoto per nuovi messaggi)
  threadId: string | null;
  inReplyToMessageId: string | null;
  showCcBcc: boolean;
  draftId: string | null;
  undoSendTimer: ReturnType<typeof setTimeout> | null;
  undoSendVisible: boolean;
  attachments: ComposerAttachment[];
  lastSavedAt: number | null;
  isSaving: boolean;
  fromEmail: string | null;
  composerAccountId: string | null; // Account selezionato nel compositor (null = usa activeAccountId)
  viewMode: ComposerViewMode;
  signatureHtml: string;
  signatureId: string | null;
  aiSidebarOpen: boolean;

  openComposer: (opts?: {
    mode?: ComposerMode;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyHtml?: string;
    quotedHtml?: string; // Citazioni per reply/forward
    threadId?: string | null;
    inReplyToMessageId?: string | null;
    draftId?: string | null;
  }) => void;
  closeComposer: () => void;
  setTo: (to: string[]) => void;
  setCc: (cc: string[]) => void;
  setBcc: (bcc: string[]) => void;
  setSubject: (subject: string) => void;
  setBodyHtml: (bodyHtml: string) => void;
  setShowCcBcc: (show: boolean) => void;
  setDraftId: (id: string | null) => void;
  setUndoSendTimer: (timer: ReturnType<typeof setTimeout> | null) => void;
  setUndoSendVisible: (visible: boolean) => void;
  addAttachment: (attachment: ComposerAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setLastSavedAt: (ts: number | null) => void;
  setIsSaving: (saving: boolean) => void;
  setFromEmail: (email: string | null) => void;
  setComposerAccountId: (accountId: string | null) => void;
  setViewMode: (mode: ComposerViewMode) => void;
  setSignatureHtml: (html: string) => void;
  setSignatureId: (id: string | null) => void;
  setQuotedHtml: (html: string) => void;
  setAiSidebarOpen: (open: boolean) => void;
  toggleAiSidebar: () => void;
}

export const useComposerStore = create<ComposerState>()((set) => ({
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
  viewMode: "modal",
  fromEmail: null,
  composerAccountId: null,
  lastSavedAt: null,
  isSaving: false,
  signatureHtml: "",
  signatureId: null,
  quotedHtml: "",
  aiSidebarOpen: false,

  openComposer: (opts) => {
    const isTest = import.meta.env.MODE === 'test';
    const urlParams = new URLSearchParams(window.location.search);
    const isFullComposerWindow = urlParams.has("compose");
    const isThreadWindow = urlParams.has("thread");
    // Thread pop-out windows embed <Composer /> inline — treat them as in-window contexts
    const isInlineContext = isFullComposerWindow || isThreadWindow || isTest;

    if (isInlineContext) {
      set({
        isOpen: true,
        mode: opts?.mode ?? "new",
        to: opts?.to ?? [],
        cc: opts?.cc ?? [],
        bcc: opts?.bcc ?? [],
        subject: opts?.subject ?? "",
        bodyHtml: opts?.bodyHtml ?? "",
        quotedHtml: opts?.quotedHtml ?? "",
        threadId: opts?.threadId ?? null,
        inReplyToMessageId: opts?.inReplyToMessageId ?? null,
        showCcBcc: (opts?.cc?.length ?? 0) > 0 || (opts?.bcc?.length ?? 0) > 0,
        draftId: opts?.draftId ?? null,
        undoSendTimer: null,
        undoSendVisible: false,
        // Thread window uses modal (no drag region / pt-7), compose window uses fullpage
        viewMode: isFullComposerWindow && !isTest ? "fullpage" : "modal",
        fromEmail: null,
        composerAccountId: null,
        attachments: [],
        lastSavedAt: null,
        isSaving: false,
        signatureHtml: "",
        signatureId: null,
        aiSidebarOpen: false,
      });
    } else { // main window — open a dedicated composer window
      import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
        const windowLabel = `compose-${Date.now()}`;

        // quotedHtml can be very large — keep it in localStorage only
        if (opts?.quotedHtml) {
          localStorage.setItem(`composer_quoted_${windowLabel}`, opts.quotedHtml);
        }

        // Pass all small fields in the URL so they survive even if localStorage
        // is not shared between webview windows (happens on some Tauri/OS configs)
        const params = new URLSearchParams();
        params.set("compose", "true");
        params.set("windowLabel", windowLabel);
        if (opts?.mode) params.set("mode", opts.mode);
        if (opts?.subject) params.set("subject", opts.subject);
        if (opts?.to?.length) params.set("to", opts.to.join(","));
        if (opts?.cc?.length) params.set("cc", opts.cc.join(","));
        if (opts?.bcc?.length) params.set("bcc", opts.bcc.join(","));
        if (opts?.threadId) params.set("threadId", opts.threadId);
        if (opts?.inReplyToMessageId) params.set("inReplyToMessageId", opts.inReplyToMessageId);
        if (opts?.draftId) params.set("draftId", opts.draftId);

        WebviewWindow.getByLabel(windowLabel).then(existing => {
          if (existing) {
            existing.setFocus();
          } else {
            new WebviewWindow(windowLabel, {
              url: `index.html?${params.toString()}`,
              title: "", // Hide title since we have it in the UI/Footer
              width: 980,
              height: 650,
              center: true,
              // @ts-ignore - titleBarStyle is valid for macOS in Tauri 2
              titleBarStyle: "Overlay",
            });
          }
        }).catch(err => {
          console.error("Failed to pop out composer:", err);
        });
      }).catch(err => {
        console.error("Failed to load WebviewWindow", err);
      });
    }
  },
  closeComposer: () =>
    set({
      isOpen: false,
      mode: "new",
      to: [],
      cc: [],
      bcc: [],
      subject: "",
      bodyHtml: "",
      quotedHtml: "",
      threadId: null,
      inReplyToMessageId: null,
      showCcBcc: false,
      draftId: null,
      undoSendTimer: null,
      undoSendVisible: false,
      viewMode: "modal",
      fromEmail: null,
      composerAccountId: null,
      attachments: [],
      lastSavedAt: null,
      isSaving: false,
      signatureHtml: "",
      signatureId: null,
      aiSidebarOpen: false,
    }),
  setTo: (to) => set({ to }),
  setCc: (cc) => set({ cc }),
  setBcc: (bcc) => set({ bcc }),
  setSubject: (subject) => set({ subject }),
  setBodyHtml: (bodyHtml) => set({ bodyHtml }),
  setShowCcBcc: (showCcBcc) => set({ showCcBcc }),
  setDraftId: (draftId) => set({ draftId }),
  setUndoSendTimer: (undoSendTimer) => set({ undoSendTimer }),
  setUndoSendVisible: (undoSendVisible) => set({ undoSendVisible }),
  addAttachment: (attachment) =>
    set((state) => ({ attachments: [...state.attachments, attachment] })),
  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),
  clearAttachments: () => set({ attachments: [] }),
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  setIsSaving: (isSaving) => set({ isSaving }),
  setFromEmail: (fromEmail) => set({ fromEmail }),
  setComposerAccountId: (composerAccountId) => set({ composerAccountId }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSignatureHtml: (signatureHtml) => set({ signatureHtml }),
  setSignatureId: (signatureId) => set({ signatureId }),
  setQuotedHtml: (quotedHtml) => set({ quotedHtml }),
  setAiSidebarOpen: (aiSidebarOpen) => set({ aiSidebarOpen }),
  toggleAiSidebar: () => set((state) => ({ aiSidebarOpen: !state.aiSidebarOpen })),
}));
