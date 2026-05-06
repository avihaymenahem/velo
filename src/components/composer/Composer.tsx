import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import { FontFamily, FontSize } from "./tiptapExtensions";

import { Clock } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { AddressInput } from "./AddressInput";
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
import { useUIStore, type ComposerFontFamily } from "@/stores/uiStore";
import {
  sendEmail,
  archiveThread,
  deleteDraft as deleteDraftAction,
  deleteDraftThread,
} from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { upsertContact } from "@/services/db/contacts";
import { getSetting } from "@/services/db/settings";
import { insertScheduledEmail } from "@/services/db/scheduledEmails";
import { getDefaultSignature } from "@/services/db/signatures";
import {
  getAliasesForAccount,
  mapDbAlias,
  type SendAsAlias,
} from "@/services/db/sendAsAliases";
import { resolveFromAddress } from "@/utils/resolveFromAddress";
import {
  startAutoSave,
  stopAutoSave,
  startDiscard,
  waitForSave,
  saveNow,
} from "@/services/composer/draftAutoSave";
import {
  getTemplatesForAccount,
  type DbTemplate,
} from "@/services/db/templates";
import { readFileAsBase64 } from "@/utils/fileUtils";
import { interpolateVariables } from "@/utils/templateVariables";
import { sanitizeHtml } from "@/utils/sanitize";

const COMPOSER_FONT_MAP: Record<ComposerFontFamily, string> = {
  system: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
  arial: "Arial, sans-serif",
  calibri: "Calibri, sans-serif",
  times: "Times New Roman, serif",
  courier: "Courier New, monospace",
  georgia: "Georgia, serif",
  verdana: "Verdana, sans-serif",
  avenir: "Avenir, sans-serif",
};

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

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const composerAccountId = useComposerStore((s) => s.composerAccountId);
  const setComposerAccountId = useComposerStore((s) => s.setComposerAccountId);

  const effectiveAccountId = composerAccountId ?? activeAccountId;
  const activeAccount = accounts.find((a) => a.id === effectiveAccountId);
  const sendingRef = useRef(false);
  const [isDiscardingDraft, setIsDiscardingDraft] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);
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
        placeholder: "Write your message...",
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      TextStyle,
      Color,
      Underline,
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
        style: `font-family: ${COMPOSER_FONT_MAP[composerFontFamily]}; font-size: ${composerFontSize}`,
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files?.length) return true;
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor || !isOpen) return;
    const el = editor.view.dom as HTMLElement;
    el.style.fontFamily = COMPOSER_FONT_MAP[composerFontFamily];
    el.style.fontSize = composerFontSize;
  }, [editor, isOpen, composerFontFamily, composerFontSize]);

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
    let html = editorHtml;
    if (signatureHtml) {
      const signatureDiv = `<div style="margin-top:16px;border-top:1px solid #e5e5e5;padding-top:12px">${sanitizeHtml(signatureHtml)}</div>`;
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
    stopAutoSave();
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
    const currentDraftId = state.draftId;
    state.setUndoSendVisible(true);
    const timer = setTimeout(async () => {
      try {
        await sendEmail(effectiveAccountId, raw, state.threadId ?? undefined);
        if (currentDraftId) {
          try {
            await deleteDraftAction(
              effectiveAccountId,
              currentDraftId,
              state.threadId ?? undefined,
            );
          } catch {
            /* ignore */
          }
        }
        if (useUIStore.getState().sendAndArchive && state.threadId) {
          try {
            await archiveThread(effectiveAccountId, state.threadId, []);
          } catch {
            /* ignore */
          }
        }
        for (const addr of [...state.to, ...state.cc, ...state.bcc])
          await upsertContact(addr, null);
      } catch (err) {
        console.error("Failed to send email:", err);
      } finally {
        useComposerStore.getState().setUndoSendVisible(false);
        sendingRef.current = false;
      }
    }, delay);
    state.setUndoSendTimer(timer);
    closeComposer();
  }, [effectiveAccountId, activeAccount, closeComposer, getFullHtml]);

  const handleSchedule = useCallback(
    async (scheduledAt: number) => {
      if (!effectiveAccountId || !activeAccount) return;
      const state = useComposerStore.getState();
      if (state.to.length === 0) return;
      const html = getFullHtml();
      const attachmentData =
        state.attachments.length > 0
          ? JSON.stringify(
              state.attachments.map((a) => ({
                filename: a.filename,
                mimeType: a.mimeType,
                content: a.content,
              })),
            )
          : null;
      await insertScheduledEmail({
        accountId: effectiveAccountId,
        toAddresses: state.to.join(", "),
        ccAddresses: state.cc.length > 0 ? state.cc.join(", ") : null,
        bccAddresses: state.bcc.length > 0 ? state.bcc.join(", ") : null,
        subject: state.subject,
        bodyHtml: html,
        replyToMessageId: state.inReplyToMessageId,
        threadId: state.threadId,
        scheduledAt,
        signatureId: null,
      });
      if (attachmentData) {
        const { getDb } = await import("@/services/db/connection");
        const db = await getDb();
        const rows = await db.select<{ id: string }[]>(
          "SELECT id FROM scheduled_emails WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1",
          [effectiveAccountId],
        );
        if (rows[0])
          await db.execute(
            "UPDATE scheduled_emails SET attachment_paths = $1 WHERE id = $2",
            [attachmentData, rows[0].id],
          );
      }
      stopAutoSave();
      if (state.draftId) {
        try {
          await deleteDraftAction(
            effectiveAccountId,
            state.draftId,
            state.threadId ?? undefined,
          );
        } catch {
          /* ignore */
        }
      }
      setShowSchedule(false);
      closeComposer();
    },
    [effectiveAccountId, activeAccount, closeComposer, getFullHtml],
  );

  const handleDiscard = useCallback(async () => {
    setIsDiscardingDraft(true); // Start loading state

    // Signal discard immediately so any in-flight saveDraft() bails before touching IMAP
    startDiscard();
    // Wait for the in-flight save to finish (it will abort due to isDiscarding flag)
    await waitForSave();
    // Read draftId now — an in-flight create may have set it after we called startDiscard
    const currentDraftId = useComposerStore.getState().draftId;
    const currentThreadId = useComposerStore.getState().threadId;
    if (effectiveAccountId) {
      if (currentThreadId) {
        // Se c'è un threadId, usa deleteDraftThread per rimuovere tutti i draft associati a quel thread
        try {
          await deleteDraftThread(effectiveAccountId, currentThreadId);
        } catch {
          /* ignore */
        }
      } else if (currentDraftId) {
        // Se è un nuovo draft (senza threadId), elimina il draft specifico tramite il suo ID
        try {
          await deleteDraftAction(
            effectiveAccountId,
            currentDraftId,
            currentThreadId ?? undefined,
          );
        } catch {
          /* ignore */
        }
      }
    }
    closeComposer();
    // Call stopAutoSave AFTER closeComposer so isOpen=false → localStorage key is cleared
    stopAutoSave();
    setIsDiscardingDraft(false); // End loading state
  }, [effectiveAccountId, closeComposer]);

  const isFullpage = viewMode === "fullpage";
  const modeLabel =
    mode === "reply"
      ? "Reply"
      : mode === "replyAll"
        ? "Reply All"
        : mode === "forward"
          ? "Forward"
          : "New Message";
  const savedLabel = isSaving
    ? "Saving..."
    : lastSavedAt
      ? "Draft saved"
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
            Drop files to attach
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
        <AddressInput label="To" addresses={to} onChange={setTo} />
        {showCcBcc ? (
          <>
            <AddressInput label="Cc" addresses={cc} onChange={setCc} />
            <AddressInput label="Bcc" addresses={bcc} onChange={setBcc} />
          </>
        ) : (
          <div className="flex items-center gap-2 ml-14">
            <button
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-accent hover:text-accent-hover"
            >
              Cc / Bcc
            </button>
          </div>
        )}

        {/* From line with selector */}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-text-tertiary w-12 shrink-0">From</span>
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
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
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
            <EditorContent editor={editor} />
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
             />
           </div>
         )}
       </div>

      <div className="border-t border-border-secondary shrink-0">
        <AttachmentPicker />
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
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleDiscard}
            disabled={isDiscardingDraft}
          >
            {isDiscardingDraft ? "Discarding..." : "Discard"}
          </Button>
          <div className="flex items-center">
            <button
              onClick={handleSend}
              disabled={to.length === 0 || isDiscardingDraft}
              className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-l-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              disabled={to.length === 0 || isDiscardingDraft}
              className="px-2 py-1.5 text-white bg-accent hover:bg-accent-hover border-l border-white/20 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Schedule send"
            >
              <Clock size={12} />
            </button>
          </div>
        </div>
      </div>

      {showSchedule && (
        <ScheduleSendDialog
          onSchedule={handleSchedule}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}
