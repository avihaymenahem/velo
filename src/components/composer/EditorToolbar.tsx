import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { InputDialog } from "@/components/ui/InputDialog";
import { Sparkles } from "lucide-react";

interface EditorToolbarProps {
  editor: Editor | null;
  onToggleAiAssist?: () => void;
  aiAssistOpen?: boolean;
}

export function EditorToolbar({ editor, onToggleAiAssist, aiAssistOpen }: EditorToolbarProps) {
  const { t } = useTranslation("composer");
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

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
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), t("toolbar.bold"))}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), t("toolbar.italic"))}
      {btn("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), t("toolbar.underline"))}
      {btn("S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), t("toolbar.strikethrough"))}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), t("toolbar.heading1"))}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), t("toolbar.heading2"))}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), t("toolbar.heading3"))}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("toolbar.bulletListLabel"), editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), t("toolbar.bulletList"))}
      {btn(t("toolbar.orderedListLabel"), editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), t("toolbar.orderedList"))}
      {btn(t("toolbar.quoteLabel"), editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), t("toolbar.quote"))}
      {btn(t("toolbar.codeBlockLabel"), editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run(), t("toolbar.codeBlock"))}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn(t("toolbar.ruleLabel"), false, () => editor.chain().focus().setHorizontalRule().run(), t("toolbar.rule"))}
      {btn(t("toolbar.linkLabel"), editor.isActive("link"), () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          setShowLinkDialog(true);
        }
      }, t("toolbar.insertLink"))}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      {btn(t("toolbar.imageLabel"), false, () => imageInputRef.current?.click(), t("toolbar.insertImage"))}

      <div className="flex-1" />

      {onToggleAiAssist && (
        <button
          type="button"
          onClick={onToggleAiAssist}
          title={t("ai.title")}
          className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
            aiAssistOpen ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary"
          }`}
        >
          <Sparkles size={12} />
          AI
        </button>
      )}

      {btn(t("toolbar.undoLabel"), false, () => editor.chain().focus().undo().run(), t("toolbar.undo"))}
      {btn(t("toolbar.redoLabel"), false, () => editor.chain().focus().redo().run(), t("toolbar.redo"))}
      <InputDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={(values) => {
          if (values.url) {
            editor.chain().focus().setLink({ href: values.url }).run();
          }
        }}
        title={t("toolbar.insertLink")}
        fields={[{ key: "url", label: "URL", placeholder: "https://..." }]}
        submitLabel={t("toolbar.insert")}
      />
    </div>
  );
}
