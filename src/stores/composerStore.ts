import { create } from "zustand";

export type ComposerMode = "new" | "reply" | "replyAll" | "forward";

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
  threadId: string | null;
  inReplyToMessageId: string | null;
  showCcBcc: boolean;
  draftId: string | null;
  undoSendTimer: ReturnType<typeof setTimeout> | null;
  undoSendVisible: boolean;
  attachments: ComposerAttachment[];
  lastSavedAt: number | null;
  isSaving: boolean;
  signatureHtml: string;
  signatureId: string | null;

  openComposer: (opts?: {
    mode?: ComposerMode;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    bodyHtml?: string;
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
  setSignatureHtml: (html: string) => void;
  setSignatureId: (id: string | null) => void;
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
  lastSavedAt: null,
  isSaving: false,
  signatureHtml: "",
  signatureId: null,

  openComposer: (opts) =>
    set({
      isOpen: true,
      mode: opts?.mode ?? "new",
      to: opts?.to ?? [],
      cc: opts?.cc ?? [],
      bcc: opts?.bcc ?? [],
      subject: opts?.subject ?? "",
      bodyHtml: opts?.bodyHtml ?? "",
      threadId: opts?.threadId ?? null,
      inReplyToMessageId: opts?.inReplyToMessageId ?? null,
      showCcBcc: (opts?.cc?.length ?? 0) > 0 || (opts?.bcc?.length ?? 0) > 0,
      draftId: opts?.draftId ?? null,
      attachments: [],
      lastSavedAt: null,
      isSaving: false,
      signatureHtml: "",
      signatureId: null,
    }),
  closeComposer: () =>
    set({
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
      attachments: [],
      lastSavedAt: null,
      isSaving: false,
      signatureHtml: "",
      signatureId: null,
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
  setSignatureHtml: (signatureHtml) => set({ signatureHtml }),
  setSignatureId: (signatureId) => set({ signatureId }),
}));
