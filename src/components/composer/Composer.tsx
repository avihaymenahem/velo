import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily, FontSize } from "./tiptapExtensions";

import { Clock, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AddressInput, type AddressInputHandle } from "./AddressInput";
import { EditorToolbar } from "./EditorToolbar";
import { AiAssistPanel } from "./AiAssistPanel";
import { AttachmentPicker } from "./AttachmentPicker";
import { ScheduleSendDialog } from "./ScheduleSendDialog";
import { SignatureSelector } from "./SignatureSelector";
import { TemplatePicker } from "./TemplatePicker";
import { FromSelector } from "./FromSelector";
import { ComposerAccountSwitcher } from "./ComposerAccountSwitcher";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { useThreadStore } from "@/stores/threadStore";
import { useUIStore, type ComposerFontFamily } from "@/stores/uiStore";
import {
  sendEmail,
  archiveThread,
  deleteDraft as deleteDraftAction,
  tombstoneImapDraft,
  purgeDraftFromDb,
} from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { useOutgoingStore } from "@/stores/outgoingStore";
import { upsertContact } from "@/services/db/contacts";
import { getSetting } from "@/services/db/settings";
import { insertScheduledEmail } from "@/services/db/scheduledEmails";
import { getDefaultSignature } from "@/services/db/signatures";
import {
  getAliasesForAccount,
  mapDbAlias,
  type SendAsAlias,
} from "@/services/db/sendAsAliases";
import { getMessagesForThread } from "@/services/db/messages";
import { getSenderPastReplies } from "@/services/ai/writingStyleService";
import { resolveFromAddress } from "@/utils/resolveFromAddress";
import {
  startAutoSave,
  stopAutoSave,
  startDiscard,
  waitForSave,
  saveNow,
  getActiveDraftId,
  getServerDraftId,
  getPreTombstonedDraftId,
} from "@/services/composer/draftAutoSave";
import {
  getTemplatesForAccount,
  type DbTemplate,
} from "@/services/db/templates";
import { readFileAsBase64 } from "@/utils/fileUtils";
import { interpolateVariables } from "@/utils/templateVariables";
import { sanitizeHtml } from "@/utils/sanitize";
import { t } from "@/i18n";

const COMPOSER_FONT_MAP: Record<ComposerFontFamily, string> = {
  system: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  arial: "Arial, Helvetica, sans-serif",
  calibri: "Calibri, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  times: "Times New Roman, Times, serif",
  courier: "Courier New, Courier, monospace",
  georgia: "Georgia, Times, serif",
  verdana: "Verdana, Geneva, sans-serif",
  avenir: "Avenir, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  inter: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
};

/**
 * Notify the rest of the app that the set of drafts changed (saved or deleted) so
 * the Drafts badge and folder list refresh. Fires a DOM event for the current window
 * and a Tauri event so the main window (a separate WebviewWindow) refreshes too.
 */
function notifyDraftChanged(): void {
  window.dispatchEvent(new Event("velo-badges-refresh"));
  import("@tauri-apps/api/event")
    .then(({ emit }) => emit("velo-draft-changed"))
    .catch(() => {
      // Non-Tauri context (tests / browser dev) — DOM event above is enough.
    });
}

/**
 * Hand the server-side draft delete (IMAP EXPUNGE / Gmail draft delete) to the main
 * window, whose JS context survives this composer window closing. Falls back to an
 * inline delete when no Tauri context is available (tests / browser dev).
 */
async function deleteDraftOnServer(payload: {
  accountId: string;
  draftId: string | null;
  threadId: string | null;
}): Promise<void> {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("velo-delete-draft", payload);
  } catch {
    const { deleteDraft, deleteDraftThread } = await import("@/services/emailActions");
    if (payload.draftId) {
      await deleteDraft(payload.accountId, payload.draftId, payload.threadId ?? undefined).catch(() => {});
    } else if (payload.threadId) {
      await deleteDraftThread(payload.accountId, payload.threadId).catch(() => {});
    }
  }
}

export function Composer() {
  const isOpen = useComposerStore((s) => s.isOpen);
  const mode = useComposerStore((s) => s.mode);
  const to = useComposerStore((s) => s.to);
  const cc = useComposerStore((s) => s.cc);
  const bcc = useComposerStore((s) => s.bcc);
  const subject = useComposerStore((s) => s.subject);
  const showCcBcc = useComposerStore((s) => s.showCcBcc);
  const fromEmail = useComposerStore((s) => s.fromEmail);
  const viewMode = useComposerStore((s) => s.viewMode);
  const signatureHtml = useComposerStore((s) => s.signatureHtml);
  const quotedHtml = useComposerStore((s) => s.quotedHtml);
  const isSaving = useComposerStore((s) => s.isSaving);
  const isSending = useComposerStore((s) => s.isSending);
  const lastSavedAt = useComposerStore((s) => s.lastSavedAt);
  const closeComposer = useComposerStore((s) => s.closeComposer);
  const setTo = useComposerStore((s) => s.setTo);
  const setCc = useComposerStore((s) => s.setCc);
  const setBcc = useComposerStore((s) => s.setBcc);
  const setSubject = useComposerStore((s) => s.setSubject);
  const setShowCcBcc = useComposerStore((s) => s.setShowCcBcc);
  const setFromEmail = useComposerStore((s) => s.setFromEmail);
  const addAttachment = useComposerStore((s) => s.addAttachment);
  const aiSidebarOpen = useComposerStore((s) => s.aiSidebarOpen);
  const toggleAiSidebar = useComposerStore((s) => s.toggleAiSidebar);
  const threadId = useComposerStore((s) => s.threadId);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const composerAccountId = useComposerStore((s) => s.composerAccountId);
  const setComposerAccountId = useComposerStore((s) => s.setComposerAccountId);
  // In unified/global view both composerAccountId and activeAccountId may be null for a
  // new compose. Fall back to the currently selected thread's account so the message is
  // sent from the right account.
  const selectedThreadAccountId = useThreadStore((s) => {
    if (composerAccountId || activeAccountId) return null;
    const id = s.selectedThreadId;
    return id ? (s.threadMap.get(id)?.accountId ?? null) : null;
  });

  const effectiveAccountId = composerAccountId ?? activeAccountId ?? selectedThreadAccountId;
  const activeAccount = accounts.find((a) => a.id === effectiveAccountId);
  const sendingRef = useRef(false);
  const isDiscardingRef = useRef(false);
  const toInputRef = useRef<AddressInputHandle>(null);
  const ccInputRef = useRef<AddressInputHandle>(null);
  const bccInputRef = useRef<AddressInputHandle>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [pendingScheduledAt, setPendingScheduledAt] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);
  const [aiThreadMessages, setAiThreadMessages] = useState<string[]>([]);
  const [aiSenderPastReplies, setAiSenderPastReplies] = useState<string[]>([]);
  const templateShortcutsRef = useRef<DbTemplate[]>([]);
  const dragCounterRef = useRef(0);

  const composerFontFamily = useUIStore((s) => s.composerFontFamily);
  const composerFontSize = useUIStore((s) => s.composerFontSize);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false },
      }),
      Placeholder.configure({
        placeholder: t("composer.placeholder"),
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
    ],
    content: useComposerStore.getState().bodyHtml,
    onUpdate: ({ editor: ed }) => {
      useComposerStore.getState().setBodyHtml(ed.getHTML());
      const templates = templateShortcutsRef.current;
      if (templates.length === 0) return;
      const text = ed.state.doc.textContent;
      for (const tmpl of templates) {
        if (!tmpl.shortcut) continue;
        if (text.endsWith(tmpl.shortcut)) {
          const { from } = ed.state.selection;
          const deleteFrom = from - tmpl.shortcut.length;
          if (deleteFrom >= 0) {
            const state = useComposerStore.getState();
            const account = useAccountStore
              .getState()
              .accounts.find(
                (a) => a.id === useAccountStore.getState().activeAccountId,
              );
            interpolateVariables(tmpl.body_html, {
              recipientEmail: state.to[0],
              senderEmail: account?.email,
              senderName: account?.displayName ?? undefined,
              subject: state.subject || undefined,
            }).then((resolved) => {
              ed.chain()
                .deleteRange({ from: deleteFrom, to: from })
                .insertContent(resolved)
                .run();
            });
            if (tmpl.subject && !state.subject) {
              setSubject(tmpl.subject);
            }
          }
          break;
        }
      }
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none px-4 py-3 min-h-[200px] focus:outline-none text-text-primary",
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files?.length) return true;
        return false;
      },
    },
  });


  // Fetch thread messages and sender past replies for AI panel when composing a reply
  useEffect(() => {
    const isReply = mode === "reply" || mode === "replyAll";
    if (!isReply || !threadId || !effectiveAccountId) {
      setAiThreadMessages([]);
      setAiSenderPastReplies([]);
      return;
    }
    let cancelled = false;
    const activeAccount = accounts.find((a) => a.id === effectiveAccountId);
    const accountEmail = activeAccount?.email ?? null;

    getMessagesForThread(effectiveAccountId, threadId)
      .then(async (messages) => {
        if (cancelled) return;
        const formatted = messages.map((msg) => {
          const from = msg.from_name
            ? `${msg.from_name} <${msg.from_address}>`
            : (msg.from_address ?? "Unknown");
          const date = new Date(msg.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const body = (msg.body_text ?? msg.snippet ?? "").trim();
          return `From: ${from}\nDate: ${date}\n\n${body}`;
        });
        if (!cancelled) setAiThreadMessages(formatted);

        // Fetch past replies to the sender for ghostwriter context
        const senderEmail = messages[messages.length - 1]?.from_address ?? null;
        if (senderEmail && accountEmail && senderEmail.toLowerCase() !== accountEmail.toLowerCase()) {
          const pastReplies = await getSenderPastReplies(effectiveAccountId, accountEmail, senderEmail);
          if (!cancelled) setAiSenderPastReplies(pastReplies);
        }
      })
      .catch(() => {
        if (!cancelled) { setAiThreadMessages([]); setAiSenderPastReplies([]); }
      });
    return () => { cancelled = true; };
  }, [mode, threadId, effectiveAccountId, accounts]);

  useEffect(() => {
    if (!isOpen || !effectiveAccountId) return;
    let cancelled = false;
    Promise.all([
      getDefaultSignature(effectiveAccountId),
      getAliasesForAccount(effectiveAccountId),
      getTemplatesForAccount(effectiveAccountId),
    ]).then(([sig, dbAliases, templates]) => {
      if (cancelled) return;
      const store = useComposerStore.getState();
      if (sig) {
        store.setSignatureHtml(sig.body_html);
        store.setSignatureId(sig.id);
      } else {
        store.setSignatureHtml("");
        store.setSignatureId(null);
      }
      const mapped = dbAliases.map(mapDbAlias);
      setAliases(mapped);
      if (!store.fromEmail || store.composerAccountId !== composerAccountId) {
        if (mapped.length > 0) {
          if (
            store.mode === "reply" ||
            store.mode === "replyAll" ||
            store.mode === "forward"
          ) {
            const resolved = resolveFromAddress(
              mapped,
              store.to.join(", "),
              store.cc.join(", "),
            );
            if (resolved) store.setFromEmail(resolved.email);
          } else {
            const defaultAlias =
              mapped.find((a) => a.isDefault) ??
              mapped.find((a) => a.isPrimary) ??
              mapped[0];
            if (defaultAlias) store.setFromEmail(defaultAlias.email);
          }
        } else {
          store.setFromEmail(null);
        }
      }
      if (store.fromEmail && !mapped.some((a) => a.email === store.fromEmail)) {
        store.setFromEmail(null);
      }
      templateShortcutsRef.current = templates.filter((t) => t.shortcut);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, effectiveAccountId, composerAccountId]);

  useEffect(() => {
    if (!isOpen || !effectiveAccountId) return;
    startAutoSave(effectiveAccountId);
    return () => {
      stopAutoSave();
    };
  }, [isOpen, effectiveAccountId]);

  // Listen for window close event to save draft
  useEffect(() => {
    const handleSaveOnClose = async () => {
      // Only save if the composer is actually open
      if (useComposerStore.getState().isOpen) {
        await saveNow();
      }
    };

    // Import tauri-apps/api/event dynamically to avoid build errors if not in Tauri context
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        const unlisten = listen("velo-save-draft-on-close", handleSaveOnClose);
        return () => {
          unlisten.then((f) => f());
        };
      })
      .catch((err) => {
        console.warn(
          "Tauri event API not available, skipping event listener:",
          err,
        );
      });
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    // Handle drag and drop for attachments
    if (!isOpen || !editor) return;
    const state = useComposerStore.getState();
    const editorContent = editor.getHTML();
    if (state.bodyHtml !== editorContent && state.bodyHtml !== "") {
      editor.commands.setContent(state.bodyHtml);
    } else if (state.bodyHtml === "" && editorContent !== "") {
      editor.commands.setContent("");
    }
  }, [isOpen, editor]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => e.preventDefault(),
    [],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      const files = e.dataTransfer.files;
      // Only intercept if we have actual local files to attach
      if (files && files.length > 0) {
        e.preventDefault();
        e.stopPropagation(); // prevent document-level handler from also opening LocalFilePreview
        dragCounterRef.current = 0;
        setIsDragging(false);
        for (const file of Array.from(files)) {
          const content = await readFileAsBase64(file);
          addAttachment({
            id: crypto.randomUUID(),
            file,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            content,
          });
        }
      } else {
        // For remote images/links, let the editor (Tiptap) handle it
        dragCounterRef.current = 0;
        setIsDragging(false);
      }
    },
    [addAttachment],
  );

const getFullHtml = useCallback(() => {
    const editorHtml = editor?.getHTML() ?? "";
    const quotedHtml = useComposerStore.getState().quotedHtml;
    // Tiptap always appends a trailing <p></p>; strip it before joining with
    // the signature or quoted block so no spurious blank line appears in the sent email.
    let html = editorHtml.replace(/(<p[^>]*>\s*<\/p>\s*)+$/, "");
    if (signatureHtml) {
      const signatureDiv = `<div style="margin-top:16px">${sanitizeHtml(signatureHtml)}</div>`;
      html = `${html}${signatureDiv}`;
    }
    if (quotedHtml) html = `${html}${quotedHtml}`;
    return html;
  }, [editor, signatureHtml]);

  const handleSend = useCallback(async () => {
    if (!effectiveAccountId || !activeAccount || sendingRef.current) return;
    const state = useComposerStore.getState();
    if (state.to.length === 0) return;
    sendingRef.current = true;
    state.setIsSending(true);
    // Use startDiscard+waitForSave (not stopAutoSave) so any in-flight IMAP autosave
    // completes before we capture currentDraftId — stopAutoSave nullifies savePromise,
    // causing waitForSave to return early and leaving the new UID uncleaned.
    // Cap at 2s: if the IMAP save is still running, startDiscard() already set
    // isDiscarding=true so the save will tombstone itself on completion.
    startDiscard();
    await Promise.race([waitForSave(), new Promise<void>((r) => setTimeout(r, 2000))]);
    const html = getFullHtml();
    const senderEmail = state.fromEmail ?? activeAccount.email;
    const raw = buildRawEmail({
      from: senderEmail,
      to: state.to,
      cc: state.cc.length > 0 ? state.cc : undefined,
      bcc: state.bcc.length > 0 ? state.bcc : undefined,
      subject: state.subject,
      htmlBody: html,
      inReplyTo: state.inReplyToMessageId ?? undefined,
      references: state.references ?? undefined,
      threadId: state.threadId ?? undefined,
      attachments:
        state.attachments.length > 0
          ? state.attachments.map((a) => ({
              filename: a.filename,
              mimeType: a.mimeType,
              content: a.content,
            }))
          : undefined,
    });
    const delaySetting = await getSetting("undo_send_delay_seconds");
    const delay = parseInt(delaySetting ?? "5", 10) * 1000;
    // For IMAP: server UID-based ID (tracked in draftAutoSave module vars).
    // For Gmail: composerStore.draftId (the Gmail draft API ID).
    // Must be captured BEFORE closeComposer() resets the store.
    const currentDraftId = getActiveDraftId();

    const outgoingId = crypto.randomUUID();
    useOutgoingStore.getState().addEmail({
      id: outgoingId,
      accountId: effectiveAccountId,
      to: [...state.to],
      cc: [...state.cc],
      bcc: [...state.bcc],
      subject: state.subject,
      bodyHtml: html,
      threadId: state.threadId,
      inReplyToMessageId: state.inReplyToMessageId,
      raw,
      status: "undo",
      createdAt: Date.now(),
      timerId: null,
    });

    state.setUndoSendVisible(true);
    const timer = setTimeout(() => {
      void (async () => {
        useOutgoingStore.getState().updateStatus(outgoingId, "sending");
        useComposerStore.getState().setUndoSendVisible(false);

        // Hand off the actual SMTP send to the main window via Tauri event.
        // The main window's JS context is persistent — it handles SMTP, draft
        // cleanup, archive, and contact upsert while this composer window closes.
        let handedOff = false;
        try {
          const { emit } = await import("@tauri-apps/api/event");
          await emit("velo-execute-send", {
            outgoingId,
            accountId: effectiveAccountId,
            raw,
            threadId: state.threadId ?? null,
            currentDraftId: currentDraftId ?? null,
            // localDraftId: stable UUID row to clean up from SQLite after send.
            // For IMAP: the applyLocalDbUpdate deleteDraft path uses is_draft=1 query
            // on the thread to find and remove this row.
            // For Gmail: null (no local row was created).
            localDraftId: state.localDraftId ?? null,
            sendAndArchive: useUIStore.getState().sendAndArchive,
            contacts: [...state.to, ...state.cc, ...state.bcc],
            to: [...state.to],
            cc: [...state.cc],
            bcc: [...state.bcc],
            subject: state.subject,
            bodyHtml: html,
            inReplyToMessageId: state.inReplyToMessageId ?? null,
          });
          handedOff = true;
        } catch {
          // Tauri not available (tests / browser preview) — fall back to inline send
        }

        if (handedOff) {
          // Tombstone the IMAP server draft — fast SQLite write (< 50ms) before window dies.
          // currentDraftId is the server UID-based ID for IMAP (or null/Gmail draft ID for Gmail).
          // tombstoneImapDraft is a no-op for non-IMAP IDs.
          const serverDraftId = getServerDraftId();
          if (serverDraftId) {
            await tombstoneImapDraft(effectiveAccountId, serverDraftId);
          } else if (currentDraftId && currentDraftId.startsWith("imap-")) {
            await tombstoneImapDraft(effectiveAccountId, currentDraftId);
          }
          // Main window owns the send from here — close the composer immediately.
          useOutgoingStore.getState().removeEmail(outgoingId);
          sendingRef.current = false;
          useComposerStore.getState().setIsSending(false);
          closeComposer();
        } else {
          // Fallback inline send (non-Tauri contexts only)
          void (async () => {
            try {
              await sendEmail(effectiveAccountId, raw, state.threadId ?? undefined);
              if (currentDraftId) {
                await deleteDraftAction(
                  effectiveAccountId,
                  currentDraftId,
                  state.threadId ?? undefined,
                ).catch(() => {});
              }
              if (useUIStore.getState().sendAndArchive && state.threadId) {
                await archiveThread(effectiveAccountId, state.threadId, []).catch(() => {});
              }
              for (const addr of [...state.to, ...state.cc, ...state.bcc])
                await upsertContact(addr, null);
            } catch (err) {
              console.error("Failed to send email:", err);
            } finally {
              useOutgoingStore.getState().removeEmail(outgoingId);
              sendingRef.current = false;
              useComposerStore.getState().setIsSending(false);
              closeComposer();
            }
          })();
        }
      })();
    }, delay);

    useOutgoingStore.getState().updateTimerId(outgoingId, timer);
    state.setUndoSendTimer(timer);
  }, [effectiveAccountId, activeAccount, closeComposer, getFullHtml]);

  const handleSelectScheduleTime = useCallback((scheduledAt: number) => {
    setPendingScheduledAt(scheduledAt);
    setShowSchedule(false);
  }, []);

  const handleConfirmSchedule = useCallback(async () => {
    if (!effectiveAccountId || !activeAccount || !pendingScheduledAt) return;
    const state = useComposerStore.getState();
    if (state.to.length === 0) return;
    try {
      const html = getFullHtml();
      const scheduledId = await insertScheduledEmail({
        accountId: effectiveAccountId,
        toAddresses: state.to.join(", "),
        ccAddresses: state.cc.length > 0 ? state.cc.join(", ") : null,
        bccAddresses: state.bcc.length > 0 ? state.bcc.join(", ") : null,
        subject: state.subject,
        bodyHtml: html,
        replyToMessageId: state.inReplyToMessageId,
        threadId: state.threadId,
        scheduledAt: pendingScheduledAt,
        signatureId: null,
      });
      if (state.attachments.length > 0) {
        const attachmentData = JSON.stringify(
          state.attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            content: a.content,
          })),
        );
        const { getDb } = await import("@/services/db/connection");
        const db = await getDb();
        await db.execute(
          "UPDATE scheduled_emails SET attachment_paths = $1 WHERE id = $2",
          [attachmentData, scheduledId],
        );
      }
      // Use startDiscard+waitForSave (not stopAutoSave) so any in-flight IMAP
      // saveServer() sees isDiscarding=true and pre-tombstones the new UID before
      // returning. stopAutoSave nullifies currentAccountId immediately, causing
      // getActiveDraftId() to miss the server UID and leaving the draft on IMAP.
      startDiscard();
      await Promise.race([waitForSave(), new Promise<void>((r) => setTimeout(r, 2000))]);
      const serverDraftId = getServerDraftId();
      const activeDraftId = getActiveDraftId();
      // If saveServer() was in-flight during startDiscard(), it pre-tombstoned the
      // newly APPENDed UID (local DB already cleaned) but never EXPUNGEd the server.
      // deleteDraftAction below will issue the EXPUNGE so the draft doesn't linger.
      const preTombstonedId = getPreTombstonedDraftId();
      const localDraftId = useComposerStore.getState().localDraftId;
      const account = useAccountStore.getState().accounts.find((a) => a.id === effectiveAccountId);
      const isImapAccount = !!account && account.provider !== "gmail_api";
      const draftToDelete = activeDraftId ?? preTombstonedId;
      if (draftToDelete) {
        try {
          await deleteDraftAction(
            effectiveAccountId,
            draftToDelete,
            state.threadId ?? undefined,
          );
        } catch {
          /* ignore */
        }
      } else if (isImapAccount && !serverDraftId && localDraftId) {
        // No server draft at all (APPEND debounce never fired): purge local UUID row only.
        await purgeDraftFromDb(effectiveAccountId, null, state.threadId ?? null, localDraftId).catch(() => {});
      }
      stopAutoSave();
    } catch (err) {
      console.error("Failed to schedule email:", err);
      return;
    }
    setPendingScheduledAt(null);
    closeComposer();
    // Emit a Tauri event so the main window (separate WebviewWindow) can react.
    // The DOM velo-sync-done only fires within the same window context.
    import("@tauri-apps/api/event")
      .then(({ emit }) => emit("velo-scheduled-saved"))
      .catch(() => {
        // Fallback for non-Tauri contexts (tests, browser dev)
        window.dispatchEvent(new Event("velo-sync-done"));
      });
  }, [effectiveAccountId, activeAccount, pendingScheduledAt, closeComposer, getFullHtml]);

  // Delete the draft everywhere and leave no trace on the server or in SQLite.
  // The local DB is purged synchronously BEFORE the window closes (fast SQLite that
  // always finishes), which is what fixes the leftover "zombie" drafts and the stale
  // Drafts badge. The server-side EXPUNGE is handed off to the persistent main window
  // (a network round trip the closing composer window can't be trusted to complete).
  const performDelete = useCallback(async () => {
    if (isDiscardingRef.current) return;
    isDiscardingRef.current = true;

    // 1. Signal discard — cancels both debounce timers and marks isDiscarding=true.
    //    Any in-flight IMAP server save will see this flag and pre-tombstone its new UID.
    startDiscard();
    useComposerStore.getState().setIsSaving(false);

    // 2. Snapshot before closeComposer() resets the store.
    const accountId = effectiveAccountId;
    const preLocalId = useComposerStore.getState().localDraftId; // stable UUID
    const preGmailDraftId = useComposerStore.getState().draftId; // Gmail API draft ID
    const preThreadId = useComposerStore.getState().threadId;
    const account = useAccountStore.getState().accounts.find((a) => a.id === accountId);
    const isImapAccount = !!account && account.provider !== "gmail_api";

    if (!accountId) {
      closeComposer();
      stopAutoSave();
      isDiscardingRef.current = false;
      return;
    }

    try {
      // 3. Let any in-flight server APPEND finish so it self-tombstones its new UID and
      //    getServerDraftId() returns the final coordinates. Usually resolves instantly.
      await Promise.race([waitForSave(), new Promise<void>((r) => setTimeout(r, 2000))]);
      const serverDraftId = getServerDraftId(); // IMAP UID-based (or null)
      // If saveServer() was in-flight and pre-tombstoned its UID (local DB already
      // cleaned) but never EXPUNGEd the server, capture it here so we still EXPUNGE.
      const preTombstonedId = getPreTombstonedDraftId();

      // 4. Tombstone the IMAP server UID so no sync can ever re-import it.
      if (serverDraftId) {
        await tombstoneImapDraft(accountId, serverDraftId).catch(() => {});
      }

      // 5. Purge the local DB synchronously — message row(s), DRAFT label, and the
      //    thread itself if it becomes empty. This clears the Drafts list + badge.
      await purgeDraftFromDb(
        accountId,
        serverDraftId,
        preThreadId,
        preLocalId,
      ).catch(() => {});

      // 6. Hand off the server-side delete to the main window (it owns the IMAP/Gmail
      //    connection and its JS context survives this window closing). For a pure-local
      //    draft (no server copy yet) there is nothing to expunge.
      const serverTarget = serverDraftId ?? preTombstonedId ?? (!isImapAccount ? preGmailDraftId : null);
      if (serverTarget || (!isImapAccount && preThreadId)) {
        void deleteDraftOnServer({
          accountId,
          draftId: serverTarget,
          threadId: preThreadId,
        });
      }
    } finally {
      // 7. Refresh badges/list, then close.
      notifyDraftChanged();
      closeComposer();
      stopAutoSave();
      isDiscardingRef.current = false;
    }
  }, [effectiveAccountId, closeComposer]);

  // True when nothing worth keeping has been entered (no recipients, subject,
  // body text, or attachments). Used to skip the save/delete prompt on close.
  const isComposerEmpty = useCallback(() => {
    const s = useComposerStore.getState();
    const hasRecipients = s.to.length > 0 || s.cc.length > 0 || s.bcc.length > 0;
    const hasSubject = s.subject.trim().length > 0;
    const hasAttachments = s.attachments.length > 0;
    const bodyText = (editor?.getText() ?? "").trim();
    return !hasRecipients && !hasSubject && !hasAttachments && bodyText.length === 0;
  }, [editor]);

  // Save the draft (local + server) and close. Must NOT call startDiscard — that
  // would abort the in-flight save. saveNow() flushes both autosave tiers.
  const performSaveAndClose = useCallback(async () => {
    if (isDiscardingRef.current) return;
    try {
      await saveNow();
    } catch (err) {
      console.error("[Composer] Save on close failed:", err);
    }
    notifyDraftChanged();
    closeComposer();
    stopAutoSave();
  }, [closeComposer]);

  // Entry point for both the footer button and the window ✕ / Cmd+W. Empty drafts
  // close immediately (deleting any auto-saved trace); otherwise prompt save/delete.
  const requestClose = useCallback(() => {
    if (isDiscardingRef.current) return;
    if (isComposerEmpty()) {
      void performDelete();
      return;
    }
    setShowCloseDialog(true);
  }, [isComposerEmpty, performDelete]);

  // The popped-out composer window intercepts its OS close (✕ / Cmd+W) and asks us
  // to run the same save/delete prompt instead of silently saving.
  useEffect(() => {
    const handler = () => requestClose();
    window.addEventListener("velo-composer-close-requested", handler);
    return () => window.removeEventListener("velo-composer-close-requested", handler);
  }, [requestClose]);

  const isFullpage = viewMode === "fullpage";
  const modeLabel =
    mode === "reply"
      ? t("composer.reply")
      : mode === "replyAll"
        ? t("composer.replyAll")
        : mode === "forward"
          ? t("composer.forward")
          : t("composer.newMessage");
  const savedLabel = isSaving
    ? t("composer.saving")
    : lastSavedAt
      ? t("composer.draftSaved")
      : null;

  // Sync native window title with subject
  useEffect(() => {
    if (!isFullpage) return;
    const title = subject.trim() || modeLabel;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => {
        getCurrentWindow().setTitle(title);
      })
      .catch((err) => console.error("Failed to set window title", err));
  }, [subject, modeLabel, isFullpage]);

  return (
    <div
      className={`relative flex-1 bg-bg-primary flex flex-col min-h-0 ${isDragging ? "border-accent border-2" : "border-transparent"} ${isFullpage ? "pt-7" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/10 rounded-lg pointer-events-none">
          <span className="text-sm font-medium text-accent">
            {t("composer.dropFiles")}
          </span>
        </div>
      )}

      {/* Top Header Title (Centered next to macOS traffic lights) */}
      {isFullpage && (
        <div
          data-tauri-drag-region
          className="absolute top-0 left-0 right-0 h-10 flex items-center justify-center z-10 cursor-default"
        >
          <span className="text-[12px] font-semibold text-accent truncate max-w-[50%] pointer-events-none">
            {subject.trim() || modeLabel}
          </span>
        </div>
      )}

      {/* Address fields */}
      <div className="px-3 py-2 space-y-1.5 border-b border-border-secondary shrink-0">
        <AddressInput
          ref={toInputRef}
          label={t("composer.to")}
          addresses={to}
          onChange={setTo}
          onTabNext={() => showCcBcc ? ccInputRef.current?.focus() : subjectInputRef.current?.focus()}
        />
        {showCcBcc ? (
          <>
            <AddressInput
              ref={ccInputRef}
              label={t("composer.cc")}
              addresses={cc}
              onChange={setCc}
              onTabNext={() => bccInputRef.current?.focus()}
            />
            <AddressInput
              ref={bccInputRef}
              label={t("composer.bcc")}
              addresses={bcc}
              onChange={setBcc}
              onTabNext={() => subjectInputRef.current?.focus()}
            />
          </>
        ) : (
          <div className="flex items-center gap-2 ml-14">
            <button
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-accent hover:text-accent-hover"
            >
              {t("composer.ccBcc")}
            </button>
          </div>
        )}

        {/* From line with selector */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-text-tertiary w-12 shrink-0">{t("composer.from")}</span>
          <div className="flex items-center gap-2">
            <FromSelector
              aliases={aliases}
              selectedEmail={fromEmail ?? activeAccount?.email ?? ""}
              onChange={(alias) => setFromEmail(alias.email)}
            />
            {accounts.length > 1 && (
              <ComposerAccountSwitcher
                accounts={accounts}
                currentAccountId={effectiveAccountId}
                onSwitch={setComposerAccountId}
              />
            )}
          </div>
        </div>
      </div>

      {/* Subject */}
      <div className="px-3 py-1.5 border-b border-border-secondary shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary w-12 shrink-0">Sub</span>
          <input
            ref={subjectInputRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); editor?.commands.focus(); } }}
            placeholder={t("composer.subject")}
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      </div>

<EditorToolbar
         editor={editor}
         onToggleAiAssist={toggleAiSidebar}
         aiAssistOpen={aiSidebarOpen}
         className="shrink-0"
       />

{/* Scrollable area — editor, signature, and quote */}
        <div className="flex-1 flex flex-row overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto min-w-0 flex flex-col">
            <div
              style={{
                "--composer-font": COMPOSER_FONT_MAP[composerFontFamily],
                "--composer-size": composerFontSize,
              } as React.CSSProperties}
            >
              <EditorContent editor={editor} />
            </div>
            {signatureHtml && (
              <div className="px-4 py-2 border-t border-border-secondary text-xs text-text-tertiary">
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(signatureHtml) }} />
              </div>
            )}
            {quotedHtml && (
              <div className="px-4 py-2 border-t border-border-secondary text-xs text-text-tertiary">
                <div dangerouslySetInnerHTML={{ __html: quotedHtml }} />
              </div>
            )}
          </div>
         {aiSidebarOpen && (
           <div className="w-96 shrink-0 border-l border-border-secondary bg-bg-secondary overflow-hidden">
             <AiAssistPanel
               editor={editor}
               isReplyMode={mode === "reply" || mode === "replyAll"}
               threadMessages={aiThreadMessages.length > 0 ? aiThreadMessages : undefined}
               senderPastReplies={aiSenderPastReplies.length > 0 ? aiSenderPastReplies : undefined}
             />
           </div>
         )}
       </div>

      <div className="border-t border-border-secondary shrink-0">
        <AttachmentPicker
          endSlot={pendingScheduledAt ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-accent">
              <Clock size={12} className="shrink-0" />
              {t("composer.scheduledForAt", {
                date: new Date(pendingScheduledAt * 1000).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }),
                time: new Date(pendingScheduledAt * 1000).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
            </span>
          ) : undefined}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-bg-secondary shrink-0">
        <div className="flex items-center gap-3">
          {savedLabel && (
            <span
              className={`text-xs text-text-tertiary italic transition-opacity duration-200 ${isSaving ? "animate-pulse" : ""} shrink-0`}
            >
              {savedLabel}
            </span>
          )}
          <SignatureSelector />
          <TemplatePicker editor={editor} />
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="secondary"
            onClick={requestClose}
            disabled={isSending}
          >
            {t("composer.discard")}
          </Button>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center">
              <button
                onClick={pendingScheduledAt ? handleConfirmSchedule : handleSend}
                disabled={to.length === 0 || isSending}
                className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-l-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? t("composer.sending") : pendingScheduledAt ? t("composer.scheduleSend.submitLabel") : t("composer.send")}
              </button>
              <button
                onClick={pendingScheduledAt ? () => setPendingScheduledAt(null) : () => setShowSchedule(true)}
                disabled={to.length === 0 || isSending}
                className="px-2 py-1.5 text-white bg-accent hover:bg-accent-hover border-l border-white/20 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={pendingScheduledAt ? t("composer.cancelScheduledSend") : t("composer.scheduleSend.title")}
              >
                {pendingScheduledAt ? <X size={12} /> : <Clock size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSchedule && (
        <ScheduleSendDialog
          onSchedule={handleSelectScheduleTime}
          onClose={() => setShowSchedule(false)}
        />
      )}

      <Modal
        isOpen={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title={t("composer.closeDialog.title")}
        width="w-96"
      >
        <div className="p-4">
          <p className="text-sm text-text-secondary mb-4">
            {t("composer.closeDialog.message")}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCloseDialog(false)}>
              {t("composer.closeDialog.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setShowCloseDialog(false);
                void performDelete();
              }}
            >
              {t("composer.closeDialog.delete")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowCloseDialog(false);
                void performSaveAndClose();
              }}
            >
              {t("composer.closeDialog.save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
