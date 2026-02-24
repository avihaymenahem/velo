import { useCallback, useEffect, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Clock, Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { ProofreadPanel } from "./ProofreadPanel";
import type { ProofreadResult } from "@/services/ai/types";

import { Button } from "@/components/ui/Button";
import { AddressInput } from "./AddressInput";
import { EditorToolbar } from "./EditorToolbar";
import { AiAssistPanel } from "./AiAssistPanel";
import { AttachmentPicker } from "./AttachmentPicker";
import { ScheduleSendDialog } from "./ScheduleSendDialog";
import { SignatureSelector } from "./SignatureSelector";
import { TemplatePicker } from "./TemplatePicker";
import { FromSelector } from "./FromSelector";
import { useComposerStore } from "@/stores/composerStore";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { sendEmail, archiveThread, deleteDraft as deleteDraftAction } from "@/services/emailActions";
import { buildRawEmail } from "@/utils/emailBuilder";
import { upsertContact } from "@/services/db/contacts";
import { getSetting } from "@/services/db/settings";
import { insertScheduledEmail } from "@/services/db/scheduledEmails";
import { getDefaultSignature } from "@/services/db/signatures";
import { getAliasesForAccount, mapDbAlias, type SendAsAlias } from "@/services/db/sendAsAliases";
import { resolveFromAddress } from "@/utils/resolveFromAddress";
import { startAutoSave, stopAutoSave } from "@/services/composer/draftAutoSave";
import { getTemplatesForAccount, type DbTemplate } from "@/services/db/templates";
import { readFileAsBase64 } from "@/utils/fileUtils";
import { interpolateVariables } from "@/utils/templateVariables";
import { sanitizeHtml } from "@/utils/sanitize";

export function Composer() {
  // Individual selectors — only re-render when each specific value changes
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
  const isSaving = useComposerStore((s) => s.isSaving);
  const lastSavedAt = useComposerStore((s) => s.lastSavedAt);
  // Note: bodyHtml intentionally NOT subscribed — TipTap manages its own editor state.
  // Subscribing would cause full re-renders on every keystroke.
  const closeComposer = useComposerStore((s) => s.closeComposer);
  const setTo = useComposerStore((s) => s.setTo);
  const setCc = useComposerStore((s) => s.setCc);
  const setBcc = useComposerStore((s) => s.setBcc);
  const setSubject = useComposerStore((s) => s.setSubject);
  const setShowCcBcc = useComposerStore((s) => s.setShowCcBcc);
  const setFromEmail = useComposerStore((s) => s.setFromEmail);
  const setViewMode = useComposerStore((s) => s.setViewMode);
  const addAttachment = useComposerStore((s) => s.addAttachment);

  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const sendingRef = useRef(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);
  const templateShortcutsRef = useRef<DbTemplate[]>([]);
  const dragCounterRef = useRef(0);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [proofreadState, setProofreadState] = useState<{
    isOpen: boolean;
    isLoading: boolean;
    result: ProofreadResult | null;
  }>({ isOpen: false, isLoading: false, result: null });

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
    ],
    content: useComposerStore.getState().bodyHtml,
    onUpdate: ({ editor: ed }) => {
      useComposerStore.getState().setBodyHtml(ed.getHTML());

      // Check for template shortcut triggers
      const templates = templateShortcutsRef.current;
      if (templates.length === 0) return;

      const text = ed.state.doc.textContent;
      for (const tmpl of templates) {
        if (!tmpl.shortcut) continue;
        if (text.endsWith(tmpl.shortcut)) {
          // Delete the shortcut text and insert template body with variables resolved
          const { from } = ed.state.selection;
          const deleteFrom = from - tmpl.shortcut.length;
          if (deleteFrom >= 0) {
            const state = useComposerStore.getState();
            const account = useAccountStore.getState().accounts.find(
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
        // Prevent TipTap from handling file drops as inline content.
        // Returning true stops TipTap's Image extension from intercepting the drop,
        // allowing the event to bubble up to the composer's onDrop for attachment handling.
        if (event.dataTransfer?.files?.length) {
          return true;
        }
        return false;
      },
    },
  });

  // Load signature, aliases, and templates in parallel when composer opens
  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    let cancelled = false;

    Promise.all([
      getDefaultSignature(activeAccountId),
      getAliasesForAccount(activeAccountId),
      getTemplatesForAccount(activeAccountId),
    ]).then(([sig, dbAliases, templates]) => {
      if (cancelled) return;
      const store = useComposerStore.getState();

      // Signature
      if (sig) {
        store.setSignatureHtml(sig.body_html);
        store.setSignatureId(sig.id);
      }

      // Aliases + fromEmail resolution
      const mapped = dbAliases.map(mapDbAlias);
      setAliases(mapped);
      if (!store.fromEmail && mapped.length > 0) {
        if (store.mode === "reply" || store.mode === "replyAll" || store.mode === "forward") {
          const resolved = resolveFromAddress(mapped, store.to.join(", "), store.cc.join(", "));
          if (resolved) store.setFromEmail(resolved.email);
        } else {
          const defaultAlias = mapped.find((a) => a.isDefault) ?? mapped.find((a) => a.isPrimary) ?? mapped[0];
          if (defaultAlias) store.setFromEmail(defaultAlias.email);
        }
      }

      // Templates
      templateShortcutsRef.current = templates.filter((t) => t.shortcut);
    });

    return () => { cancelled = true; };
  }, [isOpen, activeAccountId]);

  // Start/stop draft auto-save
  useEffect(() => {
    if (!isOpen || !activeAccountId) return;
    startAutoSave(activeAccountId);
    return () => { stopAutoSave(); };
  }, [isOpen, activeAccountId]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

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
  }, [addAttachment]);

  const getFullHtml = useCallback(() => {
    const editorHtml = editor?.getHTML() ?? "";
    if (!signatureHtml) return editorHtml;
    return `${editorHtml}<div style="margin-top:16px;border-top:1px solid #e5e5e5;padding-top:12px">${sanitizeHtml(signatureHtml)}</div>`;
  }, [editor, signatureHtml]);

  const handleConfirmSend = useCallback(async () => {
    if (!activeAccountId || !activeAccount || sendingRef.current) return;
    const state = useComposerStore.getState();
    if (state.to.length === 0) return;

    setProofreadState({ isOpen: false, isLoading: false, result: null });
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
      attachments: state.attachments.length > 0
        ? state.attachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            content: a.content,
          }))
        : undefined,
    });

    // Get undo send delay
    const delaySetting = await getSetting("undo_send_delay_seconds");
    const delay = parseInt(delaySetting ?? "5", 10) * 1000;
    const currentDraftId = state.draftId;

    // Show undo send UI
    state.setUndoSendVisible(true);

    const timer = setTimeout(async () => {
      try {
        await sendEmail(activeAccountId, raw, state.threadId ?? undefined);

        // Delete draft if it was saved
        if (currentDraftId) {
          try { await deleteDraftAction(activeAccountId, currentDraftId); } catch { /* ignore */ }
        }

        // Send & archive: remove from inbox if replying to a thread
        if (useUIStore.getState().sendAndArchive && state.threadId) {
          try { await archiveThread(activeAccountId, state.threadId, []); } catch { /* ignore */ }
        }

        // Update contacts frequency
        for (const addr of [...state.to, ...state.cc, ...state.bcc]) {
          await upsertContact(addr, null);
        }
      } catch (err) {
        console.error("Failed to send email:", err);
      } finally {
        useComposerStore.getState().setUndoSendVisible(false);
        sendingRef.current = false;
      }
    }, delay);

    state.setUndoSendTimer(timer);
    closeComposer();
  }, [activeAccountId, activeAccount, closeComposer, getFullHtml]);

  const handleSend = useCallback(async () => {
    if (!activeAccountId || !activeAccount || sendingRef.current) return;
    const state = useComposerStore.getState();
    if (state.to.length === 0) return;

    // Check if proofreading is enabled
    const proofreadEnabled = await getSetting("ai_proofread_enabled");
    if (proofreadEnabled !== "false") {
      // Start proofreading — show panel in loading state
      setProofreadState({ isOpen: true, isLoading: true, result: null });
      try {
        const { proofreadEmail } = await import("@/services/ai/aiService");
        const html = getFullHtml();
        const recipientEmails = [...state.to, ...state.cc, ...state.bcc];
        const result = await proofreadEmail(state.subject, html, recipientEmails);
        setProofreadState({ isOpen: true, isLoading: false, result });
      } catch (err) {
        console.error("Proofreading failed:", err);
        // On error, proceed directly to send
        setProofreadState({ isOpen: false, isLoading: false, result: null });
        await handleConfirmSend();
      }
      return;
    }

    // Proofreading disabled — send directly
    await handleConfirmSend();
  }, [activeAccountId, activeAccount, getFullHtml, handleConfirmSend]);

  const handleSchedule = useCallback(async (scheduledAt: number) => {
    if (!activeAccountId || !activeAccount) return;
    const state = useComposerStore.getState();
    if (state.to.length === 0) return;

    const html = getFullHtml();

    const attachmentData = state.attachments.length > 0
      ? JSON.stringify(state.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          content: a.content,
        })))
      : null;

    await insertScheduledEmail({
      accountId: activeAccountId,
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

    // Store attachment data if present
    if (attachmentData) {
      // The insertScheduledEmail doesn't have an attachmentPaths param,
      // so we update it separately via the existing column
      const { getDb } = await import("@/services/db/connection");
      const db = await getDb();
      // Get the most recently inserted scheduled email for this account
      const rows = await db.select<{ id: string }[]>(
        "SELECT id FROM scheduled_emails WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1",
        [activeAccountId],
      );
      if (rows[0]) {
        await db.execute(
          "UPDATE scheduled_emails SET attachment_paths = $1 WHERE id = $2",
          [attachmentData, rows[0].id],
        );
      }
    }

    stopAutoSave();
    // Delete the draft if exists
    if (state.draftId) {
      try {
        await deleteDraftAction(activeAccountId, state.draftId);
      } catch { /* ignore */ }
    }

    setShowSchedule(false);
    closeComposer();
  }, [activeAccountId, activeAccount, closeComposer, getFullHtml]);

  const handleDiscard = useCallback(async () => {
    stopAutoSave();
    // Delete the draft if it was saved
    const currentDraftId = useComposerStore.getState().draftId;
    if (currentDraftId && activeAccountId) {
      try {
        await deleteDraftAction(activeAccountId, currentDraftId);
      } catch { /* ignore */ }
    }
    closeComposer();
  }, [activeAccountId, closeComposer]);

  const handlePopOutComposer = useCallback(async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const state = useComposerStore.getState();
      const params = new URLSearchParams();
      params.set("compose", "true");
      params.set("mode", state.mode);
      if (state.to.length > 0) params.set("to", state.to.join(","));
      if (state.cc.length > 0) params.set("cc", state.cc.join(","));
      if (state.bcc.length > 0) params.set("bcc", state.bcc.join(","));
      if (state.subject) params.set("subject", state.subject);
      if (state.threadId) params.set("threadId", state.threadId);
      if (state.inReplyToMessageId) params.set("inReplyToMessageId", state.inReplyToMessageId);
      if (state.draftId) params.set("draftId", state.draftId);
      if (state.fromEmail) params.set("fromEmail", state.fromEmail);
      // Encode body as base64 to safely pass HTML
      const bodyHtml = editor?.getHTML() ?? "";
      if (bodyHtml) params.set("body", btoa(unescape(encodeURIComponent(bodyHtml))));

      const windowLabel = `compose-${Date.now()}`;
      const existing = await WebviewWindow.getByLabel(windowLabel);
      if (existing) {
        await existing.setFocus();
        return;
      }

      new WebviewWindow(windowLabel, {
        url: `index.html?${params.toString()}`,
        title: state.subject || "New Message",
        width: 700,
        height: 650,
        center: true,
      });

      stopAutoSave();
      closeComposer();
    } catch (err) {
      console.error("Failed to pop out composer:", err);
    }
  }, [editor, closeComposer]);

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

  return (
    <>
    <CSSTransition nodeRef={overlayRef} in={isOpen} timeout={200} classNames="slide-up" unmountOnExit>
    <div ref={overlayRef} className={`fixed inset-0 z-50 flex ${isFullpage ? "items-stretch justify-center p-4" : "items-end justify-center pb-4"} pointer-events-none`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 pointer-events-auto backdrop-animate"
        onClick={closeComposer}
      />

      {/* Composer window */}
      <div
        className={`relative bg-bg-primary border rounded-lg glass-modal pointer-events-auto flex flex-col slide-up-panel ${
          isFullpage ? "w-full h-full max-w-5xl" : "w-full max-w-2xl max-h-[80vh]"
        } ${isDragging ? "border-accent border-2" : "border-border-primary"}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/10 rounded-lg pointer-events-none">
            <span className="text-sm font-medium text-accent">Drop files to attach</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-primary bg-bg-secondary rounded-t-lg">
          <span className="text-sm font-medium text-text-primary">
            {modeLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode(isFullpage ? "modal" : "fullpage")}
              className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors"
              title={isFullpage ? "Collapse" : "Expand"}
            >
              {isFullpage ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button
              onClick={handlePopOutComposer}
              className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors"
              title="Open in new window"
            >
              <ExternalLink size={14} />
            </button>
            <button
              onClick={closeComposer}
              className="text-text-tertiary hover:text-text-primary text-lg leading-none p-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Address fields */}
        <div className="px-3 py-2 space-y-1.5 border-b border-border-secondary">
          <FromSelector
            aliases={aliases}
            selectedEmail={fromEmail ?? activeAccount?.email ?? ""}
            onChange={(alias) => setFromEmail(alias.email)}
          />
          <AddressInput label="To" addresses={to} onChange={setTo} />
          {showCcBcc ? (
            <>
              <AddressInput label="Cc" addresses={cc} onChange={setCc} />
              <AddressInput label="Bcc" addresses={bcc} onChange={setBcc} />
            </>
          ) : (
            <button
              onClick={() => setShowCcBcc(true)}
              className="text-xs text-accent hover:text-accent-hover ml-10"
            >
              Cc / Bcc
            </button>
          )}
        </div>

        {/* Subject */}
        <div className="px-3 py-1.5 border-b border-border-secondary">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-8 shrink-0">
              Sub
            </span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
        </div>

        {/* Editor toolbar */}
        <EditorToolbar
          editor={editor}
          onToggleAiAssist={() => setShowAiAssist(!showAiAssist)}
          aiAssistOpen={showAiAssist}
        />

        {/* AI Assist Panel */}
        {showAiAssist && (
          <AiAssistPanel
            editor={editor}
            isReplyMode={mode === "reply" || mode === "replyAll"}
          />
        )}

        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
          {signatureHtml && (
            <div
              className="px-4 py-2 border-t border-border-secondary text-xs text-text-tertiary"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signatureHtml) }}
            />
          )}
        </div>

        {/* Attachments */}
        <div className="border-t border-border-secondary">
          <AttachmentPicker />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border-primary bg-bg-secondary rounded-b-lg">
          <div className="flex items-center gap-3">
            <div className="text-xs text-text-tertiary">
              {fromEmail ?? activeAccount?.email ?? "No account"}
            </div>
            {savedLabel && (
              <span className={`text-xs text-text-tertiary italic transition-opacity duration-200 ${isSaving ? "animate-pulse" : ""}`}>
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
            >
              Discard
            </Button>
            <div className="flex items-center">
              <button
                onClick={handleSend}
                disabled={to.length === 0}
                className="px-4 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-l-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
              <button
                onClick={() => setShowSchedule(true)}
                disabled={to.length === 0}
                className="px-2 py-1.5 text-white bg-accent hover:bg-accent-hover border-l border-white/20 rounded-r-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Schedule send"
              >
                <Clock size={12} />
              </button>
            </div>
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
    </CSSTransition>

    {proofreadState.isOpen && (
      <ProofreadPanel
        result={proofreadState.result}
        isLoading={proofreadState.isLoading}
        onConfirmSend={handleConfirmSend}
        onCancel={() => setProofreadState({ isOpen: false, isLoading: false, result: null })}
      />
    )}
    </>
  );
}
