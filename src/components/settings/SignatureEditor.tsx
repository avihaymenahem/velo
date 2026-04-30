import { useState, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Trash2, Pencil, Code, ChevronDown, AlertCircle, Download } from "lucide-react";
import { TextField } from "@/components/ui/TextField";
import { EditorToolbar } from "@/components/composer/EditorToolbar";
import { FontFamily, FontSize } from "@/components/composer/tiptapExtensions";
import { useAccountStore } from "@/stores/accountStore";
import {
  getSignaturesForAccount,
  getAvailableSignaturesForAccount,
  insertSignature,
  updateSignature,
  deleteSignature,
  importSignature,
  type DbSignature,
} from "@/services/db/signatures";

export function SignatureEditor() {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const accounts = useAccountStore((s) => s.accounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<DbSignature[]>([]);
  const [availableSignatures, setAvailableSignatures] = useState<DbSignature[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [rawHtml, setRawHtml] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Initialize selected account
  useEffect(() => {
    if (!selectedAccountId) {
      if (activeAccountId) {
        setSelectedAccountId(activeAccountId);
      } else if (accounts.length > 0) {
        const firstAccount = accounts[0];
        if (firstAccount) {
          setSelectedAccountId(firstAccount.id);
        }
      }
    }
  }, [accounts, activeAccountId, selectedAccountId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TextStyle,
      Color,
      Underline,
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: "Write your signature..." }),
      FontFamily,
      FontSize,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 min-h-[80px] focus:outline-none text-text-primary text-xs",
      },
    },
  });

  const loadSignatures = useCallback(async () => {
    if (!selectedAccountId) return;
    const [active, available] = await Promise.all([
      getSignaturesForAccount(selectedAccountId),
      getAvailableSignaturesForAccount(selectedAccountId),
    ]);
    setSignatures(active);
    setAvailableSignatures(available);
  }, [selectedAccountId]);

  useEffect(() => {
    loadSignatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on selectedAccountId change
  }, [selectedAccountId]);

  const resetForm = useCallback(() => {
    setName("");
    setIsDefault(false);
    setEditingId(null);
    setShowForm(false);
    setIsHtmlMode(false);
    setRawHtml("");
    setSaveError(null);
    setImportError(null);
    editor?.commands.setContent("");
  }, [editor]);

  const toggleHtmlMode = useCallback(() => {
    if (!editor) return;
    if (isHtmlMode) {
      editor.commands.setContent(rawHtml);
    } else {
      setRawHtml(editor.getHTML());
    }
    setIsHtmlMode(!isHtmlMode);
  }, [editor, isHtmlMode, rawHtml]);

  const handleSave = useCallback(async () => {
    if (!selectedAccountId || !editor || !name.trim()) return;
    setSaveError(null);

    try {
      const bodyHtml = isHtmlMode ? rawHtml : editor.getHTML();

      if (editingId) {
        await updateSignature(editingId, { name: name.trim(), bodyHtml, isDefault });
      } else {
        await insertSignature({
          accountId: selectedAccountId,
          name: name.trim(),
          bodyHtml,
          isDefault,
        });
      }

      resetForm();
      await loadSignatures();
    } catch (err) {
      console.error("SignatureEditor: Failed to save signature:", err);
      setSaveError("Failed to save signature. Please restart the app and try again.");
    }
  }, [selectedAccountId, editor, name, isDefault, editingId, isHtmlMode, rawHtml, resetForm, loadSignatures]);

  const handleEdit = useCallback((sig: DbSignature) => {
    setEditingId(sig.id);
    setName(sig.name);
    setIsDefault(sig.is_default === 1);
    setShowForm(true);
    setIsHtmlMode(false);
    setRawHtml(sig.body_html);
    setSaveError(null);
    editor?.commands.setContent(sig.body_html);
  }, [editor]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteSignature(id);
    if (editingId === id) resetForm();
    await loadSignatures();
  }, [editingId, resetForm, loadSignatures]);

  const handleImport = useCallback(async (sourceId: string) => {
    if (!selectedAccountId) return;
    setImportError(null);
    try {
      await importSignature(sourceId, selectedAccountId);
      await loadSignatures();
    } catch (err) {
      console.error("SignatureEditor: Failed to import signature:", err);
      setImportError("Failed to activate signature. Please restart the app and try again.");
    }
  }, [selectedAccountId, loadSignatures]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const accountInitial = (selectedAccount?.displayName ?? selectedAccount?.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <div className="space-y-3">
      {/* Account selector */}
      {accounts.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[0.7rem] font-medium text-text-tertiary uppercase tracking-wide px-0.5">
            Account
          </p>
          <div className="relative flex items-center gap-2.5 py-2 px-3 bg-bg-secondary hover:bg-bg-hover border border-border-primary rounded-lg transition-colors">
            <div className="w-6 h-6 rounded-full bg-accent/15 text-accent text-[0.625rem] font-bold flex items-center justify-center shrink-0 select-none">
              {accountInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate leading-none">
                {selectedAccount?.displayName ?? selectedAccount?.email ?? "—"}
              </p>
              {selectedAccount?.displayName && (
                <p className="text-[0.65rem] text-text-tertiary truncate mt-0.5">
                  {selectedAccount.email}
                </p>
              )}
            </div>
            <ChevronDown size={13} className="text-text-tertiary shrink-0" />
            <select
              value={selectedAccountId ?? ""}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                resetForm();
              }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.displayName ? `${acc.displayName} (${acc.email})` : acc.email}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active signatures for this account */}
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
              title="Remove from this account"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      {/* Signatures from other accounts — available to import */}
      {availableSignatures.length > 0 && (
        <>
          {(signatures.length > 0 || showForm) && (
            <div className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-border-primary" />
              <span className="text-[0.65rem] text-text-tertiary whitespace-nowrap">
                Available from other accounts
              </span>
              <div className="flex-1 h-px bg-border-primary" />
            </div>
          )}
          {availableSignatures.map((sig) => (
            <div
              key={sig.id}
              className="flex items-center justify-between py-2 px-3 bg-bg-secondary/40 border border-border-primary/40 rounded-md opacity-60"
            >
              <p className="flex-1 min-w-0 text-sm font-medium text-text-secondary truncate">
                {sig.name}
              </p>
              <button
                onClick={() => handleImport(sig.id)}
                className="p-1.5 ml-2 text-text-tertiary hover:text-accent transition-colors shrink-0"
                title="Activate for this account"
              >
                <Download size={13} />
              </button>
            </div>
          ))}
          {importError && (
            <div className="flex items-start gap-1.5 text-xs text-danger">
              <AlertCircle size={13} className="shrink-0 mt-px" />
              <span>{importError}</span>
            </div>
          )}
        </>
      )}

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
          {saveError && (
            <div className="flex items-start gap-1.5 text-xs text-danger">
              <AlertCircle size={13} className="shrink-0 mt-px" />
              <span>{saveError}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || !selectedAccountId}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? "Update" : "Save"}
            </button>
            <button
              type="button"
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
