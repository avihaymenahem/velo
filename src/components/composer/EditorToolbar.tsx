import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { InputDialog } from "@/components/ui/InputDialog";
import { Sparkles, FileText, MessageSquarePlus } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getQuickReplies, incrementQuickReplyUsage, type QuickReply } from "@/services/db/quickReplies";

interface EditorToolbarProps {
  editor: Editor | null;
  onToggleAiAssist?: () => void;
  aiAssistOpen?: boolean;
  onToggleTemplatePicker?: () => void;
}

export function EditorToolbar({ editor, onToggleAiAssist, aiAssistOpen, onToggleTemplatePicker }: EditorToolbarProps) {
  const { t } = useTranslation();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const qrMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!quickReplyOpen || !activeAccountId) return;
    getQuickReplies(activeAccountId).then(setQuickReplies).catch(() => {});
  }, [quickReplyOpen, activeAccountId]);

  useEffect(() => {
    if (!quickReplyOpen) return;
    const handler = (e: MouseEvent) => {
      if (qrMenuRef.current && !qrMenuRef.current.contains(e.target as Node)) {
        setQuickReplyOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickReplyOpen]);

  const handleInsertQuickReply = useCallback(async (qr: QuickReply) => {
    if (!editor) return;
    editor.chain().focus().insertContent(qr.body_html).run();
    setQuickReplyOpen(false);
    await incrementQuickReplyUsage(qr.id).catch(() => {});
  }, [editor]);

  if (!editor) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      editor.chain().focus().setImage({ src: dataUrl }).run();
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const btn = (
    label: string,
    isActive: boolean,
    onClick: () => void,
    title?: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors ${
        isActive ? "bg-bg-hover text-accent font-semibold" : "text-text-secondary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-secondary bg-bg-secondary flex-wrap">
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold (Ctrl+B)")}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic (Ctrl+I)")}
      {btn("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "Underline (Ctrl+U)")}
      {btn("S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "Strikethrough")}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("composer.bulletList"), editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {btn(t("composer.orderedList"), editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {btn(t("composer.quote"), editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {btn(t("composer.code"), editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("composer.rule"), false, () => editor.chain().focus().setHorizontalRule().run())}
      {btn(t("composer.link"), editor.isActive("link"), () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          setShowLinkDialog(true);
        }
      })}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      {btn(t("composer.image"), false, () => imageInputRef.current?.click(), t("composer.insertImage"))}

      <div className="flex-1" />

      {onToggleTemplatePicker && (
        <button
          type="button"
          onClick={onToggleTemplatePicker}
          title="Templates (Ctrl+Shift+T)"
          className="px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 text-text-secondary"
        >
          <FileText size={12} />
          {t("composer.templates")}
        </button>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setQuickReplyOpen(!quickReplyOpen)}
          title="Quick Replies"
          className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
            quickReplyOpen ? "bg-accent/10 text-accent" : "text-text-secondary"
          }`}
        >
          <MessageSquarePlus size={12} />
          {t("quickReply.title")}
        </button>

        {quickReplyOpen && (
          <div
            ref={qrMenuRef}
            className="absolute right-0 top-full mt-1 w-56 bg-bg-secondary border border-border-primary rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto"
          >
            {quickReplies.length === 0 ? (
              <p className="px-3 py-2 text-xs text-text-tertiary">{t("quickReply.noReplies")}</p>
            ) : (
              quickReplies.map((qr) => (
                <button
                  key={qr.id}
                  onClick={() => handleInsertQuickReply(qr)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <MessageSquarePlus size={12} className="text-accent shrink-0" />
                  <span className="flex-1 truncate">{qr.title}</span>
                  {qr.shortcut && (
                    <kbd className="text-[0.625rem] bg-bg-tertiary px-1 py-0.5 rounded border border-border-primary font-mono text-text-tertiary shrink-0">
                      {qr.shortcut}
                    </kbd>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {onToggleAiAssist && (
        <button
          type="button"
          onClick={onToggleAiAssist}
          title="AI Assist"
          className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
            aiAssistOpen ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary"
          }`}
        >
          <Sparkles size={12} />
          AI
        </button>
      )}

      {btn(t("composer.undo"), false, () => editor.chain().focus().undo().run())}
      {btn(t("composer.redo"), false, () => editor.chain().focus().redo().run())}
      <InputDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={(values) => {
          if (values.url) {
            editor.chain().focus().setLink({ href: values.url }).run();
          }
        }}
        title={t("composer.insertLink")}
        fields={[{ key: "url", label: t("composer.url"), placeholder: "https://..." }]}
        submitLabel={t("common.insert")}
      />
    </div>
  );
}
