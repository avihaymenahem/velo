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

export const useComposerStore = create<ComposerState>((set) => ({
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
  aiSidebarOpen: false,

  openComposer: (opts) => {
    const isComposerWindow = new URLSearchParams(window.location.search).has("compose");

    if (isComposerWindow) {
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
        viewMode: "fullpage",
        fromEmail: null,
        composerAccountId: null,
        attachments: [],
        lastSavedAt: null,
        isSaving: false,
        signatureHtml: "",
        signatureId: null,
        aiSidebarOpen: false,
      });
    } else {
      import("@tauri-apps/api/webviewWindow").then(({ WebviewWindow }) => {
        const windowLabel = `compose-${Date.now()}`;
        
        // Save opts to localStorage to avoid URL length limits with large emails
        if (opts) {
          localStorage.setItem(`composer_opts_${windowLabel}`, JSON.stringify(opts));
        }

        const params = new URLSearchParams();
        params.set("compose", "true");
        params.set("windowLabel", windowLabel);

        WebviewWindow.getByLabel(windowLabel).then(existing => {
          if (existing) {
            existing.setFocus();
          } else {
            new WebviewWindow(windowLabel, {
              url: `index.html?${params.toString()}`,
              title: "", // Hide title since we have it in the UI/Footer
              width: 700,
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
