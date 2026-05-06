import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { InputDialog } from "@/components/ui/InputDialog";
import { Sparkles, Type } from "lucide-react";
import "@/components/composer/tiptapExtensions";

interface EditorToolbarProps {
  editor: Editor | null;
  onToggleAiAssist?: () => void;
  aiAssistOpen?: boolean;
  className?: string;
}

const FONT_SIZES = [
  { label: "10", value: "10px" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
];

const FONT_FAMILIES = [
  { label: "System", value: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Times", value: "Times New Roman, serif" },
  { label: "Courier", value: "Courier New, monospace" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Avenir", value: "Avenir, sans-serif" },
];

// 32 colors: grays → reds/oranges → greens → blues → purples/pinks
const COLORS = [
  "#000000", "#333333", "#555555", "#777777", "#999999", "#BBBBBB", "#DDDDDD", "#FFFFFF",
  "#7F1D1D", "#B91C1C", "#DC2626", "#F97316", "#D97706", "#CA8A04", "#84CC16", "#65A30D",
  "#14532D", "#16A34A", "#059669", "#0D9488", "#0284C7", "#2563EB", "#1D4ED8", "#4F46E5",
  "#4338CA", "#7C3AED", "#9333EA", "#A21CAF", "#BE185D", "#E11D48", "#FB7185", "#FECDD3",
];

export function EditorToolbar({ editor, onToggleAiAssist, aiAssistOpen, className }: EditorToolbarProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColors) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColors(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColors]);

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
    <div className={`flex items-center gap-0.5 px-3 py-1.5 border-b border-border-secondary bg-bg-secondary flex-wrap ${className ?? ""}`}>
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Bold (Ctrl+B)")}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Italic (Ctrl+I)")}
      {btn("U", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run(), "Underline (Ctrl+U)")}
      {btn("S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run(), "Strikethrough")}

      {/* Font size dropdown */}
      <select
        defaultValue=""
        onChange={(e) => {
          const size = e.target.value;
          if (size) editor.chain().focus().setFontSize(size).run();
          e.target.value = "";
        }}
        className="text-xs px-1 py-1 bg-bg-tertiary border border-border-primary rounded text-text-primary cursor-pointer"
        title="Font size"
      >
        <option value="" disabled>Size</option>
        {FONT_SIZES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font family dropdown */}
      <select
        defaultValue=""
        onChange={(e) => {
          const family = e.target.value;
          if (family) editor.chain().focus().setFontFamily(family).run();
          e.target.value = "";
        }}
        className="text-xs px-1 py-1 bg-bg-tertiary border border-border-primary rounded text-text-primary cursor-pointer max-w-[80px]"
        title="Font family"
      >
        <option value="" disabled>Font</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Color picker */}
      <div ref={colorPickerRef} className="relative">
        <button
          type="button"
          title="Text color"
          onClick={() => setShowColors((v) => !v)}
          className={`p-1 rounded hover:bg-bg-hover transition-colors flex flex-col items-center gap-0.5 ${showColors ? "bg-bg-hover" : ""}`}
        >
          <Type size={12} className="text-text-secondary" />
          <span
            className="w-3.5 h-0.5 rounded-full"
            style={{
              backgroundColor: editor.getAttributes("textStyle").color ?? "#000000",
            }}
          />
        </button>

        {showColors && (
          <div className="absolute top-full left-0 mt-1 z-30 p-2.5 bg-bg-primary border border-border-primary rounded-lg shadow-2xl min-w-[172px]">
            <div className="grid grid-cols-8 gap-1 mb-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setShowColors(false);
                  }}
                  className="w-4.5 h-4.5 rounded border border-border-primary hover:scale-125 transition-transform"
                  style={{ backgroundColor: c, width: "18px", height: "18px" }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setShowColors(false);
              }}
              className="w-full text-[11px] text-text-tertiary hover:text-text-primary text-center py-0.5 border-t border-border-secondary pt-1.5"
            >
              Rimuovi colore
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {btn("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {btn("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("• List", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {btn("1. List", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {btn("Quote", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {btn("< > Code", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}

      <div className="w-px h-4 bg-border-primary mx-1" />

      {btn("— Rule", false, () => editor.chain().focus().setHorizontalRule().run())}
      {btn("Link", editor.isActive("link"), () => {
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
      {btn("Image", false, () => imageInputRef.current?.click(), "Insert image")}

      <div className="flex-1" />

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

      {btn("Undo", false, () => editor.chain().focus().undo().run())}
      {btn("Redo", false, () => editor.chain().focus().redo().run())}
      <InputDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onSubmit={(values) => {
          if (values.url) {
            editor.chain().focus().setLink({ href: values.url }).run();
          }
        }}
        title="Insert Link"
        fields={[{ key: "url", label: "URL", placeholder: "https://..." }]}
        submitLabel="Insert"
      />
    </div>
  );
}
