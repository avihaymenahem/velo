import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Star, Search, Plus, X, Eye, ArrowRight } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useComposerStore } from "@/stores/composerStore";
import { Modal } from "@/components/ui/Modal";
import {
  getTemplatesForAccount,
  getFavorites,
  getMostUsed,
  getCategories,
  upsertCategory,
  incrementTemplateUsage,
  type DbTemplate,
  type DbTemplateCategory,
} from "@/services/db/templates";
import { interpolateVariablesSync } from "@/utils/templateVariables";
import type { Editor } from "@tiptap/react";

interface TemplatePickerProps {
  editor: Editor | null;
  isOpen?: boolean;
  onClose?: () => void;
  onSelect?: (template: DbTemplate) => void;
}

const SYSTEM_CATEGORIES = ["All", "Sales", "Support", "Legal", "Marketing", "Internal"];

const CATEGORY_ICONS: Record<string, string> = {
  Sales: "💰",
  Support: "🎧",
  Legal: "⚖️",
  Marketing: "📣",
  Internal: "🏢",
};

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function TemplatePicker({ editor, isOpen: controlledOpen, onClose: controlledOnClose, onSelect: controlledOnSelect }: TemplatePickerProps) {
  const { t } = useTranslation();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const { mode, subject, setSubject } = useComposerStore();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const handleClose = useCallback(() => {
    if (isControlled) {
      controlledOnClose?.();
    } else {
      setInternalOpen(false);
    }
  }, [isControlled, controlledOnClose]);
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [categories, setCategories] = useState<DbTemplateCategory[]>([]);
  const [favorites, setFavorites] = useState<DbTemplate[]>([]);
  const [mostUsed, setMostUsed] = useState<DbTemplate[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<DbTemplate | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const loadData = useCallback(async () => {
    if (!activeAccountId) return;
    const [tmpls, cats, favs, used] = await Promise.all([
      getTemplatesForAccount(activeAccountId),
      getCategories(activeAccountId),
      getFavorites(activeAccountId),
      getMostUsed(activeAccountId, 5),
    ]);
    setTemplates(tmpls);
    setCategories(cats);
    setFavorites(favs);
    setMostUsed(used);
  }, [activeAccountId]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) {
      map[c.id] = c.name;
    }
    return map;
  }, [categories]);

  const allCategoryNames = useMemo(() => {
    const names = [...SYSTEM_CATEGORIES];
    for (const c of categories) {
      if (!names.includes(c.name)) names.push(c.name);
    }
    return names;
  }, [categories]);

  const filteredTemplates = useMemo(() => {
    let list = templates;

    if (activeCategory !== "All") {
      const cat = categories.find((c) => c.name === activeCategory);
      if (cat) {
        list = list.filter((t) => t.category_id === cat.id);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      list = list.filter(
        (t) => fuzzyMatch(t.name, q) || fuzzyMatch(t.body_html, q) || (t.subject ? fuzzyMatch(t.subject, q) : false),
      );
    }

    return list;
  }, [templates, activeCategory, searchQuery, categories]);

  const handleInsert = useCallback(async (tmpl: DbTemplate) => {
    if (controlledOnSelect) {
      controlledOnSelect(tmpl);
      return;
    }

    if (!editor) return;

    if (mode === "new" && !subject && tmpl.subject) {
      setSubject(tmpl.subject);
    }

    editor.commands.insertContent(tmpl.body_html);

    if (activeAccountId) {
      await incrementTemplateUsage(tmpl.id);
    }

    if (!isControlled) {
      setInternalOpen(false);
    }
  }, [editor, mode, subject, setSubject, activeAccountId, controlledOnSelect, isControlled]);

  const handlePreview = useCallback((tmpl: DbTemplate) => {
    setPreviewTemplate((prev) => (prev?.id === tmpl.id ? prev : tmpl));
  }, []);

  const handleInsertCurrent = useCallback(async () => {
    if (!previewTemplate) return;
    await handleInsert(previewTemplate);
  }, [previewTemplate, handleInsert]);

  const previewHtml = useMemo(() => {
    if (!previewTemplate) return "";
    return interpolateVariablesSync(previewTemplate.body_html, {
      recipientName: "John Doe",
      recipientEmail: "john@acme.com",
      senderName: "You",
      senderEmail: "you@example.com",
      subject: previewTemplate.subject ?? "Your Subject Here",
    });
  }, [previewTemplate]);

  const handleAddCategory = useCallback(async () => {
    if (!activeAccountId || !newCategoryName.trim()) return;
    await upsertCategory({
      accountId: activeAccountId,
      name: newCategoryName.trim(),
    });
    setNewCategoryName("");
    setShowAddCategory(false);
    await loadData();
  }, [activeAccountId, newCategoryName, loadData]);

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setInternalOpen(true)}
          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          title={t("composer.insertTemplate") + " (Ctrl+Shift+T)"}
        >
          <FileText size={12} />
          {t("composer.templates")}
        </button>
      )}

      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t("composer.insertTemplate")}
        width="w-[720px]"
        panelClassName="max-h-[80vh] flex flex-col"
      >
        {/* Search */}
        <div className="px-4 py-2 border-b border-border-primary">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("composer.searchTemplates")}
              className="w-full pl-7 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded-md text-xs text-text-primary outline-none focus:border-accent"
              autoFocus
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-secondary overflow-x-auto shrink-0">
          {allCategoryNames.map((name) => {
            const isActive = activeCategory === name;
            return (
              <button
                key={name}
                onClick={() => setActiveCategory(name)}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-[0.625rem] rounded-full transition-colors ${
                  isActive
                    ? "bg-accent/15 text-accent font-medium"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {CATEGORY_ICONS[name] && <span className="text-[0.625rem]">{CATEGORY_ICONS[name]}</span>}
                {name}
              </button>
            );
          })}
          <button
            onClick={() => setShowAddCategory(!showAddCategory)}
            className="shrink-0 p-1 text-text-tertiary hover:text-text-secondary"
            title={t("composer.addCategory")}
          >
            <Plus size={12} />
          </button>
        </div>

        {showAddCategory && (
          <div className="px-3 py-2 border-b border-border-secondary flex items-center gap-1.5">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder={t("composer.categoryName")}
              className="flex-1 px-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary outline-none focus:border-accent"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
                if (e.key === "Escape") setShowAddCategory(false);
              }}
              autoFocus
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCategoryName.trim()}
              className="px-2 py-1 text-xs text-white bg-accent rounded hover:bg-accent-hover disabled:opacity-50"
            >
              {t("common.add")}
            </button>
            <button
              onClick={() => { setShowAddCategory(false); setNewCategoryName(""); }}
              className="p-1 text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {/* Favorites section */}
          {activeCategory === "All" && !searchQuery && favorites.length > 0 && (
            <div>
              <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-1">
                {t("composer.favorites")}
              </h4>
              {favorites.map((tmpl) => (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  categoryName={tmpl.category_id ? categoryMap[tmpl.category_id] ?? null : null}
                  onSelect={handleInsert}
                  onPreview={handlePreview}
                  isSelected={previewTemplate?.id === tmpl.id}
                />
              ))}
              <div className="border-t border-border-secondary my-2" />
            </div>
          )}

          {/* Most used section */}
          {activeCategory === "All" && !searchQuery && mostUsed.length > 0 && (
            <div>
              <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-1">
                {t("composer.mostUsed")}
              </h4>
              {mostUsed.map((tmpl) => (
                <TemplateCard
                  key={tmpl.id}
                  template={tmpl}
                  categoryName={tmpl.category_id ? categoryMap[tmpl.category_id] ?? null : null}
                  onSelect={handleInsert}
                  onPreview={handlePreview}
                  isSelected={previewTemplate?.id === tmpl.id}
                />
              ))}
              <div className="border-t border-border-secondary my-2" />
            </div>
          )}

          {/* All templates */}
          <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5 px-1">
            {searchQuery
              ? t("composer.searchResults")
              : activeCategory === "All"
                ? t("composer.allTemplates")
                : activeCategory}
          </h4>
          {filteredTemplates.length === 0 ? (
            <p className="text-xs text-text-tertiary px-1 py-4 text-center">
              {searchQuery ? t("composer.noTemplatesFound") : t("composer.noTemplates")}
            </p>
          ) : (
            filteredTemplates.map((tmpl) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                categoryName={tmpl.category_id ? categoryMap[tmpl.category_id] ?? null : null}
                onSelect={handleInsert}
                onPreview={handlePreview}
                isSelected={previewTemplate?.id === tmpl.id}
              />
            ))
          )}
        </div>

        {/* Live preview panel */}
        {previewTemplate && (
          <div className="border-t border-border-secondary px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-text-tertiary flex items-center gap-1.5">
                <Eye size={11} />
                {t("composer.templatePreview")}
              </h4>
              <button
                onClick={handleInsertCurrent}
                className="flex items-center gap-1 px-2.5 py-1 text-[0.625rem] font-medium text-white bg-accent hover:bg-accent-hover rounded-md transition-colors"
              >
                <ArrowRight size={10} />
                {t("composer.insertTemplate")}
              </button>
            </div>
            <div className="bg-bg-tertiary rounded-md p-3 max-h-[160px] overflow-y-auto border border-border-primary">
              <div
                className="text-xs text-text-primary prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        )}

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border-primary text-[0.625rem] text-text-tertiary flex items-center gap-2">
          <kbd className="bg-bg-tertiary px-1 rounded text-[0.5rem] border border-border-primary">Ctrl+Shift+T</kbd>
          {t("composer.openTemplatePicker")}
        </div>
      </Modal>
    </>
  );
}

function TemplateCard({
  template,
  categoryName,
  onSelect,
  onPreview,
  isSelected,
}: {
  template: DbTemplate;
  categoryName: string | null;
  onSelect: (tmpl: DbTemplate) => void;
  onPreview?: (tmpl: DbTemplate) => void;
  isSelected?: boolean;
}) {
  const { t } = useTranslation();
  const bodyText = template.body_html.replace(/<[^>]*>/g, "").trim();

  return (
    <button
      onClick={() => onSelect(template)}
      onMouseEnter={() => onPreview?.(template)}
      className={`w-full text-left px-3 py-2 rounded-lg bg-bg-secondary transition-colors border group ${
        isSelected
          ? "border-accent bg-accent/5"
          : "border-transparent hover:bg-bg-hover hover:border-border-secondary"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-primary truncate">{template.name}</span>
            {template.is_favorite === 1 && (
              <Star size={10} className="text-warning fill-warning shrink-0" />
            )}
          </div>
          {template.subject && (
            <div className="text-[0.625rem] text-text-tertiary truncate mt-0.5">
              {template.subject}
            </div>
          )}
          <div className="text-[0.625rem] text-text-tertiary/60 truncate mt-0.5 line-clamp-1">
            {bodyText.slice(0, 120)}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {template.usage_count > 0 && (
            <span className="text-[0.5rem] text-text-tertiary/50" title={t("composer.usedCount")}>
              {template.usage_count}
            </span>
          )}
          {categoryName && (
            <span className="text-[0.5rem] px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-tertiary">
              {categoryName}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
