import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  Plus, Trash2, Pencil, ChevronDown, Eye, Edit3, Copy, Check,
  Download, Upload, FileText, BarChart3, Clock, ArrowUpDown,
  BetweenHorizonalEnd, Code,
} from "lucide-react";
import { EditorToolbar } from "@/components/composer/EditorToolbar";
import { useAccountStore } from "@/stores/accountStore";
import {
  getTemplatesForAccount,
  insertTemplate,
  updateTemplate,
  deleteTemplate,
  getCategories,
  upsertCategory,
  deleteCategory,
  type DbTemplate,
  type DbTemplateCategory,
} from "@/services/db/templates";
import { TEMPLATE_VARIABLES } from "@/utils/templateVariables";
import { exportTemplateToJson, parseImportedTemplate, importFromFile, toExportableJson } from "@/services/campaigns/templateShare";

type AnalyticsSort = "usage" | "recent";

export function TemplateManager() {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [categories, setCategories] = useState<DbTemplateCategory[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [conditionalBlocks, setConditionalBlocks] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [showCondBuilder, setShowCondBuilder] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<string | null>(null);
  const [importPreviewName, setImportPreviewName] = useState("");
  const [importPreviewSubject, setImportPreviewSubject] = useState("");
  const [importPreviewBody, setImportPreviewBody] = useState("");
  const [importPreviewCat, setImportPreviewCat] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder: t("composer.writeYourMessage") }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-3 py-2 min-h-[80px] focus:outline-none text-text-primary text-xs",
      },
    },
  });

  const loadData = useCallback(async () => {
    if (!activeAccountId) return;
    const [tmpls, cats] = await Promise.all([
      getTemplatesForAccount(activeAccountId),
      getCategories(activeAccountId),
    ]);
    setTemplates(tmpls);
    setCategories(cats);
  }, [activeAccountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const maxUsageCount = useMemo(() => {
    if (templates.length === 0) return 1;
    return Math.max(...templates.map((t) => t.usage_count), 1);
  }, [templates]);

  const resetForm = useCallback(() => {
    setName("");
    setSubject("");
    setShortcut("");
    setCategoryId(null);
    setConditionalBlocks("");
    setEditingId(null);
    setShowForm(false);
    setPreviewMode(false);
    setCopied(false);
    editor?.commands.setContent("");
  }, [editor]);

  const handleEdit = useCallback((tmpl: DbTemplate) => {
    setEditingId(tmpl.id);
    setName(tmpl.name);
    setSubject(tmpl.subject ?? "");
    setShortcut(tmpl.shortcut ?? "");
    setCategoryId(tmpl.category_id);
    setConditionalBlocks(tmpl.conditional_blocks_json ?? "");
    setShowForm(true);
    setPreviewMode(false);
    setCopied(false);
    setShowCondBuilder(false);
    editor?.commands.setContent(tmpl.body_html);
  }, [editor]);

  const handleSave = useCallback(async () => {
    if (!activeAccountId || !editor || !name.trim()) return;

    const bodyHtml = editor.getHTML();

    if (editingId) {
      await updateTemplate(editingId, {
        name: name.trim(),
        subject: subject.trim() || null,
        bodyHtml,
        shortcut: shortcut.trim() || null,
        categoryId,
        conditionalBlocksJson: conditionalBlocks.trim() || null,
      });
    } else {
      await insertTemplate({
        accountId: activeAccountId,
        name: name.trim(),
        subject: subject.trim() || null,
        bodyHtml,
        shortcut: shortcut.trim() || null,
        categoryId,
        conditionalBlocksJson: conditionalBlocks.trim() || null,
      });
    }

    resetForm();
    await loadData();
  }, [activeAccountId, editor, name, subject, shortcut, categoryId, conditionalBlocks, editingId, resetForm, loadData]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteTemplate(id);
    if (editingId === id) resetForm();
    await loadData();
  }, [editingId, resetForm, loadData]);

  const handleCopyHtml = useCallback(async () => {
    const html = editor?.getHTML() ?? "";
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editor]);

  const handleExport = useCallback((tmpl: DbTemplate) => {
    const cat = categories.find((c) => c.id === tmpl.category_id);
    const json = exportTemplateToJson({
      name: tmpl.name,
      subject: tmpl.subject,
      body_html: tmpl.body_html,
      shortcut: tmpl.shortcut,
      categoryName: cat?.name ?? null,
      conditional_blocks_json: tmpl.conditional_blocks_json,
      usageCount: tmpl.usage_count,
      lastUsedAt: tmpl.last_used_at,
      createdAt: tmpl.created_at,
    });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tmpl.name.replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [categories]);

  const handleImport = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const parsed = await importFromFile(file);
      if (!parsed) return;
      setImportPreviewName(parsed.name);
      setImportPreviewSubject(parsed.subject ?? "");
      setImportPreviewBody(parsed.body_html);
      setImportPreviewCat(parsed.category_name ?? "");
      setImportPreviewData(toExportableJson(parsed));
    };
    input.click();
  }, []);

  const confirmImport = useCallback(async () => {
    if (!activeAccountId || !importPreviewData) return;
    const parsed = parseImportedTemplate(importPreviewData);
    if (!parsed) return;
    const existingNames = new Set(templates.map((t) => t.name.toLowerCase()));
    let finalName = parsed.name;
    if (existingNames.has(finalName.toLowerCase())) {
      finalName = `${finalName} (imported)`;
    }
    let catId: string | null = null;
    if (parsed.category_name) {
      const existing = categories.find((c) => c.name === parsed.category_name);
      if (existing) {
        catId = existing.id;
      } else {
        catId = await upsertCategory({ accountId: activeAccountId, name: parsed.category_name });
      }
    }
    await insertTemplate({
      accountId: activeAccountId,
      name: finalName,
      subject: parsed.subject,
      bodyHtml: parsed.body_html,
      shortcut: parsed.shortcut,
      categoryId: catId,
      conditionalBlocksJson: parsed.conditional_blocks_json,
    });
    setImportPreviewData(null);
    await loadData();
  }, [activeAccountId, importPreviewData, templates, categories, loadData]);

  const handleCategoryRename = useCallback(async (id: string) => {
    if (!editCatName.trim()) return;
    await upsertCategory({ id, accountId: activeAccountId, name: editCatName.trim() });
    setEditingCategoryId(null);
    await loadData();
  }, [activeAccountId, editCatName, loadData]);

  const handleCategoryDelete = useCallback(async (id: string) => {
    await deleteCategory(id);
    await loadData();
  }, [loadData]);

  const handleAddCategory = useCallback(async () => {
    if (!activeAccountId || !newCatName.trim()) return;
    await upsertCategory({ accountId: activeAccountId, name: newCatName.trim() });
    setNewCatName("");
    await loadData();
  }, [activeAccountId, newCatName, loadData]);

  const templatesByCategory = useCallback((catId: string | null) => {
    return templates.filter((t) => t.category_id === catId);
  }, [templates]);

  const uncategorized = templates.filter((t) => !t.category_id);

  const templateHtml = editor?.getHTML() ?? "";

  return (
    <div className="space-y-4">
      {/* Categories */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary mb-2">{t("settings.categories")}</h4>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="border border-border-primary rounded-md">
              <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary rounded-t-md">
                {editingCategoryId === cat.id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      className="flex-1 px-2 py-0.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCategoryRename(cat.id);
                        if (e.key === "Escape") setEditingCategoryId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleCategoryRename(cat.id)} className="text-xs text-accent">OK</button>
                    <button onClick={() => setEditingCategoryId(null)} className="text-xs text-text-tertiary">{t("common.cancel")}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                    className="flex items-center gap-1.5 text-sm text-text-primary font-medium"
                  >
                    <ChevronDown size={12} className={`transition-transform ${expandedCategory === cat.id ? "" : "-rotate-90"}`} />
                    {cat.icon && <span>{cat.icon}</span>}
                    {cat.name}
                    {cat.is_system === 1 && (
                      <span className="text-[0.5rem] px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary">{t("settings.system")}</span>
                    )}
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingCategoryId(cat.id); setEditCatName(cat.name); }}
                    className="p-1 text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} />
                  </button>
                  {cat.is_system !== 1 && (
                    <button
                      onClick={() => handleCategoryDelete(cat.id)}
                      className="p-1 text-text-tertiary hover:text-danger"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
              {expandedCategory === cat.id && (
                <div className="p-2 space-y-1">
                  {templatesByCategory(cat.id).length === 0 ? (
                    <p className="text-xs text-text-tertiary px-2 py-1">{t("settings.noTemplatesInCategory")}</p>
                  ) : (
                    templatesByCategory(cat.id).map((tmpl) => (
                      <TemplateListItem
                        key={tmpl.id}
                        template={tmpl}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onExport={handleExport}
                      />
                    ))
                  )}
                  <button
                    onClick={() => { setCategoryId(cat.id); setShowForm(true); }}
                    className="text-xs text-accent hover:text-accent-hover px-2 py-1"
                  >
                    + Add template
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder={t("settings.newCategoryName")}
            className="flex-1 px-3 py-1.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
            onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCatName.trim()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md disabled:opacity-50"
          >
            <Plus size={12} />
            {t("settings.addCategory")}
          </button>
        </div>
      </div>

      {/* Uncategorized templates */}
      {uncategorized.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary mb-2">{t("settings.uncategorized")}</h4>
          <div className="space-y-1">
            {uncategorized.map((tmpl) => (
              <TemplateListItem
                key={tmpl.id}
                template={tmpl}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            ))}
          </div>
        </div>
      )}

      {/* Global add + import */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setCategoryId(null); setShowForm(true); }}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
        >
          <Plus size={12} />
          {t("settings.addTemplate")}
        </button>
        <button
          onClick={handleImport}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
        >
          <Upload size={12} />
          {t("settings.importTemplate")}
        </button>
      </div>

      {/* Import preview modal */}
      {importPreviewData && (
        <div className="border border-accent/30 rounded-md p-4 space-y-3 bg-accent/5">
          <h4 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
            <Eye size={12} />
            {t("settings.importPreview")}
          </h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary w-20">{t("settings.templateName")}</span>
              <span className="text-xs text-text-primary font-medium">{importPreviewName}</span>
            </div>
            {importPreviewSubject && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary w-20">{t("settings.templateSubject")}</span>
                <span className="text-xs text-text-primary">{importPreviewSubject}</span>
              </div>
            )}
            {importPreviewCat && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary w-20">{t("settings.category")}</span>
                <span className="text-xs text-text-primary">{importPreviewCat}</span>
              </div>
            )}
            <div>
              <span className="text-xs text-text-tertiary block mb-1">{t("settings.templatePreview")}</span>
              <div className="bg-bg-tertiary border border-border-primary rounded-md p-3 max-h-[200px] overflow-y-auto">
                <div
                  className="text-xs text-text-primary prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: importPreviewBody }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={confirmImport}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
            >
              <Upload size={12} className="inline mr-1" />
              {t("settings.confirmImport")}
            </button>
            <button
              onClick={() => setImportPreviewData(null)}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Template editor form */}
      {showForm && (
        <div className="border border-border-primary rounded-md p-3 space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.templateName")}
            className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("settings.templateSubject")}
            className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
          />
          <select
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="">{t("settings.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="border border-border-primary rounded overflow-hidden bg-bg-tertiary">
            <div className="flex items-center justify-between">
              {previewMode ? (
                <span className="px-2 py-1 text-xs text-text-secondary">{t("settings.preview")}</span>
              ) : (
                <EditorToolbar editor={editor} />
              )}
              <button
                type="button"
                onClick={() => setPreviewMode(!previewMode)}
                className={`p-1.5 mr-1 rounded transition-colors ${previewMode ? "text-accent bg-accent/10" : "text-text-tertiary hover:text-text-primary"}`}
                title={previewMode ? t("settings.editTemplate") : t("settings.previewTemplate")}
              >
                {previewMode ? <Edit3 size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {previewMode ? (
              <div className="space-y-2 p-2">
                <iframe
                  srcDoc={templateHtml}
                  sandbox="allow-same-origin"
                  className="w-full border-0 rounded bg-white"
                  style={{ height: 400 }}
                  title={t("settings.templatePreview")}
                />
                <button
                  type="button"
                  onClick={handleCopyHtml}
                  className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? t("settings.copied") : t("settings.copyHtml")}
                </button>
              </div>
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          <InsertVariableDropdown
            onInsert={(variable) => {
              editor?.chain().focus().insertContent(variable).run();
            }}
          />
          <input
            type="text"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder={t("settings.templateShortcut")}
            className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
          />

          {/* Conditional blocks builder */}
          <div className="border border-border-primary rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCondBuilder(!showCondBuilder)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <BetweenHorizonalEnd size={12} />
                {t("settings.conditionalBlocks")}
              </span>
              <ChevronDown size={12} className={`transition-transform ${showCondBuilder ? "" : "-rotate-90"}`} />
            </button>
            {showCondBuilder && (
              <ConditionalBlocksBuilder
                value={conditionalBlocks}
                onChange={setConditionalBlocks}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors disabled:opacity-50"
            >
              {editingId ? t("common.update") : t("common.save")}
            </button>
            <button
              onClick={resetForm}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary rounded-md transition-colors"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Template usage analytics */}
      {templates.length > 0 && (
        <TemplateAnalytics templates={templates} maxUsage={maxUsageCount} />
      )}
    </div>
  );
}

/* ─── Template Usage Analytics ─────────────────────────────── */

function TemplateAnalytics({ templates, maxUsage }: { templates: DbTemplate[]; maxUsage: number }) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<AnalyticsSort>("usage");

  const sorted = useMemo(() => {
    const list = [...templates];
    if (sortBy === "usage") {
      list.sort((a, b) => b.usage_count - a.usage_count || (b.last_used_at ?? 0) - (a.last_used_at ?? 0));
    } else {
      list.sort((a, b) => (b.last_used_at ?? 0) - (a.last_used_at ?? 0));
    }
    return list.slice(0, 10);
  }, [templates, sortBy]);

  function formatTimestamp(ts: number | null): string {
    if (!ts) return "—";
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return t("settings.justNow");
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${t("settings.ago")}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ${t("settings.ago")}`;
    return `${Math.floor(diff / 86400)}d ${t("settings.ago")}`;
  }

  return (
    <div className="border border-border-primary rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
          <BarChart3 size={12} />
          {t("settings.templateAnalytics")}
        </h4>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSortBy("usage")}
            className={`px-2 py-0.5 text-[0.625rem] rounded transition-colors ${
              sortBy === "usage"
                ? "bg-accent/10 text-accent font-medium"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <ArrowUpDown size={10} className="inline mr-1" />
            {t("settings.mostUsed")}
          </button>
          <button
            onClick={() => setSortBy("recent")}
            className={`px-2 py-0.5 text-[0.625rem] rounded transition-colors ${
              sortBy === "recent"
                ? "bg-accent/10 text-accent font-medium"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <Clock size={10} className="inline mr-1" />
            {t("settings.recentlyUsed")}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {sorted.map((tmpl) => (
          <div key={tmpl.id} className="flex items-center gap-3">
            <div className="w-4 text-[0.5rem] text-text-tertiary text-right shrink-0">
              {tmpl.usage_count}
            </div>
            <div className="flex-1 h-5 bg-bg-tertiary rounded-sm overflow-hidden relative">
              <div
                className="h-full bg-accent/20 rounded-sm transition-all duration-300"
                style={{ width: `${Math.round((tmpl.usage_count / maxUsage) * 100)}%` }}
              />
              <span className="absolute inset-0 flex items-center px-1.5 text-[0.5rem] text-text-primary truncate">
                {tmpl.name}
              </span>
            </div>
            <span className="text-[0.5rem] text-text-tertiary shrink-0 w-12 text-right">
              {formatTimestamp(tmpl.last_used_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Conditional Blocks Builder ───────────────────────────── */

interface ConditionalBlockEntry {
  variable: string;
  ifContent: string;
  elseContent: string;
}

function ConditionalBlocksBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<ConditionalBlockEntry[]>(() => {
    if (!value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as ConditionalBlockEntry[];
    } catch {
      /* not JSON — parse as legacy conditional blocks text */
    }
    return [];
  });
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(value);

  const syncToParent = useCallback((newBlocks: ConditionalBlockEntry[]) => {
    setBlocks(newBlocks);
    onChange(newBlocks.length > 0 ? JSON.stringify(newBlocks, null, 2) : "");
  }, [onChange]);

  const addBlock = useCallback(() => {
    const newBlocks = [...blocks, { variable: TEMPLATE_VARIABLES[0]?.key ?? "{{first_name}}", ifContent: "", elseContent: "" }];
    syncToParent(newBlocks);
  }, [blocks, syncToParent]);

  const removeBlock = useCallback((idx: number) => {
    const newBlocks = blocks.filter((_, i) => i !== idx);
    syncToParent(newBlocks);
  }, [blocks, syncToParent]);

  const updateBlock = useCallback((idx: number, field: keyof ConditionalBlockEntry, val: string) => {
    const newBlocks = blocks.map((b, i) => (i === idx ? { ...b, [field]: val } : b));
    syncToParent(newBlocks);
  }, [blocks, syncToParent]);

  const handleRawChange = useCallback(() => {
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        setBlocks(parsed as ConditionalBlockEntry[]);
        setShowRaw(false);
        onChange(rawText);
      }
    } catch {
      /* invalid JSON — keep showing raw */
    }
  }, [rawText, onChange]);

  if (showRaw) {
    return (
      <div className="p-2 space-y-2">
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={4}
          className="w-full px-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-xs text-text-primary outline-none focus:border-accent font-mono"
        />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRawChange}
            className="px-2 py-1 text-[0.625rem] font-medium text-white bg-accent rounded hover:bg-accent-hover"
          >
            {t("settings.apply")}
          </button>
          <button
            type="button"
            onClick={() => { setShowRaw(false); setRawText(value); }}
            className="px-2 py-1 text-[0.625rem] text-text-tertiary hover:text-text-secondary"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.625rem] text-text-tertiary">
          {t("settings.conditionalBlocksDesc")}
        </span>
        <button
          type="button"
          onClick={() => { setShowRaw(true); setRawText(value); }}
          className="flex items-center gap-1 text-[0.625rem] text-text-tertiary hover:text-text-secondary"
        >
          <Code size={10} />
          {t("settings.editRawJson")}
        </button>
      </div>

      {blocks.map((block, idx) => (
        <div key={idx} className="border border-border-primary rounded-md p-2 space-y-1.5 bg-bg-secondary">
          <div className="flex items-center gap-1.5">
            <select
              value={block.variable}
              onChange={(e) => updateBlock(idx, "variable", e.target.value)}
              className="flex-1 px-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
            >
              {TEMPLATE_VARIABLES.map((v) => (
                <option key={v.key} value={v.key}>{v.key} — {v.desc}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeBlock(idx)}
              className="p-1 text-text-tertiary hover:text-danger"
            >
              <Trash2 size={10} />
            </button>
          </div>
          <div>
            <label className="text-[0.5rem] text-text-tertiary uppercase tracking-wider block mb-0.5">
              {t("settings.ifBlock")}
            </label>
            <input
              type="text"
              value={block.ifContent}
              onChange={(e) => updateBlock(idx, "ifContent", e.target.value)}
              placeholder={t("settings.ifBlockPlaceholder")}
              className="w-full px-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-[0.5rem] text-text-tertiary uppercase tracking-wider block mb-0.5">
              {t("settings.elseBlock")}
            </label>
            <input
              type="text"
              value={block.elseContent}
              onChange={(e) => updateBlock(idx, "elseContent", e.target.value)}
              placeholder={t("settings.elseBlockPlaceholder")}
              className="w-full px-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addBlock}
        className="flex items-center gap-1 text-[0.625rem] text-accent hover:text-accent-hover"
      >
        <Plus size={10} />
        {t("settings.addConditionalBlock")}
      </button>
    </div>
  );
}

/* ─── Template List Item ───────────────────────────────────── */

function TemplateListItem({
  template,
  onEdit,
  onDelete,
  onExport,
}: {
  template: DbTemplate;
  onEdit: (tmpl: DbTemplate) => void;
  onDelete: (id: string) => void;
  onExport: (tmpl: DbTemplate) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between py-1.5 px-3 bg-bg-secondary rounded-md">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary flex items-center gap-2">
          {template.name}
          {template.shortcut && (
            <kbd className="text-[0.625rem] bg-bg-tertiary text-text-tertiary px-1.5 py-0.5 rounded">
              {template.shortcut}
            </kbd>
          )}
          {template.is_favorite === 1 && (
            <span className="text-warning">&#9733;</span>
          )}
          {template.usage_count > 0 && (
            <span className="text-[0.5rem] text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded-full">
              {template.usage_count}
            </span>
          )}
        </div>
        {template.subject && (
          <div className="text-xs text-text-tertiary truncate">{template.subject}</div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <button onClick={() => onExport(template)} className="p-1 text-text-tertiary hover:text-text-primary" title={t("settings.exportTemplate")}>
          <Download size={12} />
        </button>
        <button onClick={() => onEdit(template)} className="p-1 text-text-tertiary hover:text-text-primary" title={t("common.edit")}>
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(template.id)} className="p-1 text-text-tertiary hover:text-danger" title={t("common.delete")}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

/* ─── Insert Variable Dropdown ─────────────────────────────── */

function InsertVariableDropdown({ onInsert }: { onInsert: (variable: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
      >
        <FileText size={12} />
        {t("settings.insertVariable")}
        <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 bg-bg-primary border border-border-primary rounded-md shadow-lg py-1 min-w-[220px]">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                onInsert(v.key);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-xs flex items-center justify-between gap-3"
            >
              <code className="text-accent">{v.key}</code>
              <span className="text-text-tertiary">{v.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
