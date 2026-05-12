import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { InputDialog } from "@/components/ui/InputDialog";
import { Sparkles, FileText, MessageSquarePlus, Type, Table, Smile, Plus, Minus, Trash2, Columns3, Rows3 } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { getQuickReplies, incrementQuickReplyUsage, type QuickReply } from "@/services/db/quickReplies";
import { EmojiPicker } from "./EmojiPicker";

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
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const qrMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!tableMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (tableMenuRef.current && !tableMenuRef.current.contains(e.target as Node)) {
        setTableMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tableMenuOpen]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handler = (e: MouseEvent) => {
      setEmojiPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiPickerOpen]);

  const handleInsertQuickReply = useCallback(async (qr: QuickReply) => {
    if (!editor) return;
    editor.chain().focus().insertContent(qr.body_html).run();
    setQuickReplyOpen(false);
    await incrementQuickReplyUsage(qr.id).catch(() => {});
  }, [editor]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
  }, [editor]);

  const isInTable = editor?.isActive("table");

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

      <div className="w-px h-4 bg-border-primary mx-1" />

      {/* Table */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setTableMenuOpen(!tableMenuOpen)}
          title="Table"
          className={`p-1 rounded hover:bg-bg-hover transition-colors ${
            isInTable ? "bg-bg-hover text-accent" : "text-text-secondary"
          }`}
        >
          <Table size={14} />
        </button>
        {tableMenuOpen && (
          <div
            ref={tableMenuRef}
            className="absolute left-0 top-full mt-1 w-48 bg-bg-secondary border border-border-primary rounded-lg shadow-xl z-50 py-1"
          >
            {!isInTable ? (
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  setTableMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
              >
                <Plus size={12} className="shrink-0" />
                Insert Table (3×3)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addColumnBefore().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Columns3 size={12} className="shrink-0" />
                  Add Column Before
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addColumnAfter().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Columns3 size={12} className="shrink-0" />
                  Add Column After
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteColumn().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Minus size={12} className="shrink-0" />
                  Delete Column
                </button>
                <div className="h-px bg-border-primary my-1" />
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addRowBefore().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Rows3 size={12} className="shrink-0" />
                  Add Row Before
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().addRowAfter().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Rows3 size={12} className="shrink-0 rotate-180" />
                  Add Row After
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteRow().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Minus size={12} className="shrink-0" />
                  Delete Row
                </button>
                <div className="h-px bg-border-primary my-1" />
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().deleteTable().run();
                    setTableMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover text-left transition-colors"
                >
                  <Trash2 size={12} className="shrink-0" />
                  Delete Table
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Emoji */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
          title="Insert Emoji"
          className="p-1 rounded hover:bg-bg-hover transition-colors text-text-secondary"
        >
          <Smile size={14} />
        </button>
        {emojiPickerOpen && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setEmojiPickerOpen(false)}
          />
        )}
      </div>

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
      {/* Format preview bar */}
      <FormatPreviewBar editor={editor} />

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

function FormatPreviewBar({ editor }: { editor: Editor }) {
  const formats: { label: string; active: boolean }[] = [
    { label: "B", active: editor.isActive("bold") },
    { label: "I", active: editor.isActive("italic") },
    { label: "U", active: editor.isActive("underline") },
    { label: "S", active: editor.isActive("strike") },
  ];

  let headingLabel = "";
  if (editor.isActive("heading", { level: 1 })) headingLabel = "H1";
  else if (editor.isActive("heading", { level: 2 })) headingLabel = "H2";
  else if (editor.isActive("heading", { level: 3 })) headingLabel = "H3";

  let listLabel = "";
  if (editor.isActive("bulletList")) listLabel = "UL";
  else if (editor.isActive("orderedList")) listLabel = "OL";

  const anyFormat = formats.some((f) => f.active) || headingLabel || listLabel || editor.isActive("blockquote") || editor.isActive("codeBlock") || editor.isActive("link");

  if (!anyFormat) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b border-border-secondary bg-bg-tertiary/30">
      <Type size={10} className="text-text-tertiary" />
      {formats.map((f) => (
        <span
          key={f.label}
          className={`text-[0.625rem] px-1 rounded ${
            f.active ? "text-accent font-semibold bg-accent/10" : "text-text-tertiary"
          }`}
        >
          {f.label}
        </span>
      ))}
      {headingLabel && (
        <span className="text-[0.625rem] text-accent font-semibold bg-accent/10 px-1 rounded">
          {headingLabel}
        </span>
      )}
      {listLabel && (
        <span className="text-[0.625rem] text-accent font-semibold bg-accent/10 px-1 rounded">
          {listLabel}
        </span>
      )}
      {editor.isActive("blockquote") && (
        <span className="text-[0.625rem] text-accent font-semibold bg-accent/10 px-1 rounded">
          Quote
        </span>
      )}
      {editor.isActive("codeBlock") && (
        <span className="text-[0.625rem] text-accent font-semibold bg-accent/10 px-1 rounded">
          Code
        </span>
      )}
      {editor.isActive("link") && (
        <span className="text-[0.625rem] text-accent font-semibold bg-accent/10 px-1 rounded">
          Link
        </span>
      )}
    </div>
  );
}
