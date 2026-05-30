import { create } from "zustand";

export interface OutgoingEmail {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
  threadId: string | null;
  inReplyToMessageId: string | null;
  raw: string;
  status: "undo" | "sending";
  createdAt: number;
  timerId: ReturnType<typeof setTimeout> | null;
}

interface OutgoingState {
  emails: OutgoingEmail[];
  addEmail: (email: OutgoingEmail) => void;
  removeEmail: (id: string) => void;
  updateStatus: (id: string, status: OutgoingEmail["status"]) => void;
  updateTimerId: (id: string, timerId: ReturnType<typeof setTimeout>) => void;
  clearUndoEmails: () => void;
}

export const useOutgoingStore = create<OutgoingState>((set) => ({
  emails: [],
  addEmail: (email) => set((s) => ({ emails: [...s.emails, email] })),
  removeEmail: (id) => set((s) => ({ emails: s.emails.filter((e) => e.id !== id) })),
  updateStatus: (id, status) =>
    set((s) => ({
      emails: s.emails.map((e) => (e.id === id ? { ...e, status } : e)),
    })),
  updateTimerId: (id, timerId) =>
    set((s) => ({
      emails: s.emails.map((e) => (e.id === id ? { ...e, timerId } : e)),
    })),
  clearUndoEmails: () =>
    set((s) => {
      for (const e of s.emails) {
        if (e.status === "undo" && e.timerId != null) clearTimeout(e.timerId);
      }
      return { emails: s.emails.filter((e) => e.status !== "undo") };
    }),
}));
