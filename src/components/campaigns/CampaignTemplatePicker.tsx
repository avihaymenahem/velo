import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import type { CampaignTemplate } from "@/constants/campaignTemplates";

interface CampaignTemplatePickerProps {
  templates: CampaignTemplate[];
  selectedTemplateId: string | null;
  onSelect: (templateId: string | null) => void;
}

export function CampaignTemplatePicker({ templates, selectedTemplateId, onSelect }: CampaignTemplatePickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<CampaignTemplate | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (tmpl) =>
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.description.toLowerCase().includes(q) ||
        tmpl.category.toLowerCase().includes(q),
    );
  }, [templates, search]);

  const selectedTemplate = selectedTemplateId
    ? templates.find((t) => t.id === selectedTemplateId) ?? null
    : null;

  const handleSelect = (template: CampaignTemplate | null) => {
    setSearch("");
    onSelect(template?.id ?? null);
    setPreviewTemplate(null);
  };

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("campaign.searchTemplates")}
          className="w-full pl-8 pr-3 py-1.5 bg-bg-tertiary border border-border-primary rounded text-sm text-text-primary outline-none focus:border-accent"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Currently selected */}
      {selectedTemplate && !previewTemplate && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">{selectedTemplate.name}</div>
              <div className="text-xs text-text-tertiary mt-0.5">{selectedTemplate.description}</div>
            </div>
            <button
              onClick={() => handleSelect(null)}
              className="text-xs text-text-tertiary hover:text-text-primary shrink-0"
            >
              {t("common.remove")}
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setPreviewTemplate(selectedTemplate)}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              {t("common.preview")}
            </button>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center pt-[10vh] px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPreviewTemplate(null)} />
          <div className="relative bg-bg-primary border border-border-primary rounded-lg glass-modal w-full max-w-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border-primary flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">{previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="text-text-tertiary hover:text-text-primary">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              <iframe
                srcDoc={previewTemplate.html.replace(/\{\{content\}\}/g, t("campaign.templatePreviewContent"))}
                className="w-full min-h-[300px] rounded-lg border border-border-primary"
                sandbox="allow-same-origin"
                title={t("campaign.templatePreview")}
              />
            </div>
            <div className="px-4 py-3 border-t border-border-primary flex justify-end gap-2">
              <button
                onClick={() => setPreviewTemplate(null)}
                className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  handleSelect(previewTemplate);
                }}
                className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors"
              >
                {t("common.select")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template grid */}
      {!selectedTemplate && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
          {filtered.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setPreviewTemplate(template);
              }}
              className="text-left p-3 rounded-lg border border-border-primary hover:border-accent/50 hover:bg-accent/5 transition-colors"
            >
              <div className="text-xs font-medium text-text-primary truncate">{template.name}</div>
              <div className="text-[0.625rem] text-text-tertiary mt-0.5 truncate">{template.description}</div>
              <div className="mt-1">
                <span className="text-[0.625rem] px-1.5 py-0.25 rounded-full bg-bg-tertiary text-text-tertiary">
                  {t(`campaign.category.${template.category}`)}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-4 text-sm text-text-tertiary">
              {t("campaign.noTemplates")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}