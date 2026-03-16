import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
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
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), t("boldTitle"))}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), t("italicTitle"))}
      {btn("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), t("underlineTitle"))}
      {btn("S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), t("strikethrough"))}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("• List", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {btn("1. List", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {btn(t("blockquote"), editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {btn("< > Code", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("— Rule", false, () => editor.chain().focus().setHorizontalRule().run())}
      {btn(t("link"), editor.isActive("link"), () => {
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
      {btn(t("image"), false, () => imageInputRef.current?.click(), t("insertImage"))}

      <div className="flex-1" />

      {onToggleAiAssist && (
        <button
          type="button"
          onClick={onToggleAiAssist}
          title={t("aiAssistTitle")}
          className={`px-1.5 py-1 text-xs rounded hover:bg-bg-hover transition-colors flex items-center gap-1 ${
            aiAssistOpen ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary"
          }`}
        >
          <Sparkles size={12} />
          {t("ai")}
        </button>
      )}

      {btn(t("common:undo"), false, () => editor.chain().focus().undo().run())}
      {btn(t("common:redo"), false, () => editor.chain().focus().redo().run())}
      <InputDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={(values) => {
          if (values.url) {
            editor.chain().focus().setLink({ href: values.url }).run();
          }
        }}
        title={t("insertLink")}
        fields={[{ key: "url", label: t("url"), placeholder: t("urlPlaceholder") }]}
        submitLabel={t("common:insert")}
      />
    </div>
  );
}
