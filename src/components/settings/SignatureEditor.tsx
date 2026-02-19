import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Trash2, Pencil, Code } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { EditorToolbar } from "@/components/composer/EditorToolbar";
import { useAccountStore } from "@/stores/accountStore";
import {
  getSignaturesForAccount,
  insertSignature,
  updateSignature,
  deleteSignature,
  type DbSignature,
} from "@/services/db/signatures";

export function SignatureEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [signatures, setSignatures] = useState<DbSignature[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: "Write your signature..." }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 min-h-[80px] focus:outline-none text-text-primary text-xs",
      },
    },
  });

  const loadSignatures = useCallback(async () => {
    if (!activeAccountId) return;
    const sigs = await getSignaturesForAccount(activeAccountId);
    setSignatures(sigs);
  }, [activeAccountId]);

  useEffect(() => {
    loadSignatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSignatures is stable, only re-run on activeAccountId change
  }, [activeAccountId]);

  const resetForm = useCallback(() => {
    setName("");
    setIsDefault(false);
    setEditingId(null);
    setShowForm(false);
    setIsHtmlMode(false);
    setRawHtml("");
    editor?.commands.setContent("");
  }, [editor]);

  const toggleHtmlMode = useCallback(() => {
    if (!editor) return;
    if (isHtmlMode) {
      // HTML → WYSIWYG: push rawHtml into editor
      editor.commands.setContent(rawHtml);
    } else {
      // WYSIWYG → HTML: capture editor content
      setRawHtml(editor.getHTML());
    }
    setIsHtmlMode(!isHtmlMode);
  }, [editor, isHtmlMode, rawHtml]);

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !editor || !name.trim()) return;

    const bodyHtml = isHtmlMode ? rawHtml : editor.getHTML();

    if (editingId) {
      await updateSignature(editingId, { name: name.trim(), bodyHtml, isDefault });
    } else {
      await insertSignature({
        accountId: activeAccountId,
        name: name.trim(),
        bodyHtml,
        isDefault,
      });
    }

    resetForm();
    await loadSignatures();
  }, [activeAccountId, editor, name, isDefault, editingId, isHtmlMode, rawHtml, resetForm, loadSignatures]);

  const handleEdit = useCallback((sig: DbSignature) => {
    setEditingId(sig.id);
    setName(sig.name);
    setIsDefault(sig.is_default === 1);
    setShowForm(true);
    editor?.commands.setContent(sig.body_html);
  }, [editor]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSignature(id);
    if (editingId === id) resetForm();
    await loadSignatures();
  }, [editingId, resetForm, loadSignatures]);

  return (
    <div className="space-y-3">
      {signatures.map((sig) => (
        <div
          key={sig.id}
          className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-md"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-text-primary flex items-center gap-2">
              {sig.name}
              {sig.is_default === 1 && (
                <span className="text-[0.625rem] bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                  Default
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleEdit(sig)}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => handleDelete(sig.id)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-border-primary rounded-md p-3 space-y-2">
          <TextField
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Signature name"
          />
          <div className="border border-border-primary rounded overflow-hidden bg-bg-tertiary">
            <div className="flex items-center justify-between">
              {isHtmlMode ? (
                <span className="px-2 py-1 text-xs text-text-secondary">HTML source</span>
              ) : (
                <EditorToolbar editor={editor} />
              )}
              <button
                type="button"
                onClick={toggleHtmlMode}
                className={`p-1.5 mr-1 rounded transition-colors ${isHtmlMode ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-primary"}`}
                title={isHtmlMode ? "Switch to visual editor" : "Edit HTML source"}
              >
                <Code size={14} />
              </button>
            </div>
            {isHtmlMode ? (
              <textarea
                value={rawHtml}
                onChange={(e) => setRawHtml(e.target.value)}
                className="w-full px-3 py-2 min-h-[80px] bg-bg-tertiary text-text-primary text-xs font-mono focus:outline-none resize-y"
                spellCheck={false}
              />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded"
              />
              Set as default
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? "Update" : "Save"}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="text-xs text-accent hover:text-accent-hover"
        >
          + Add signature
        </button>
      )}
    </div>
  );
}
