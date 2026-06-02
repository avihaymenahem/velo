import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FileText, ChevronDown } from "lucide-react";
import { useAccountStore } from "@/stores/accountStore";
import { useComposerStore } from "@/stores/composerStore";
import { getTemplatesForAccount, type DbTemplate } from "@/services/db/templates";
import { interpolateVariables } from "@/utils/templateVariables";
import type { Editor } from "@tiptap/react";

interface TemplatePickerProps {
  editor: Editor | null;
}

export function TemplatePicker({ editor }: TemplatePickerProps) {
  const { t, i18n } = useTranslation("composer");
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const { mode, subject, setSubject, to, fromEmail } = useComposerStore();
  const accounts = useAccountStore((s) => s.accounts);
  const templateLocale = i18n.resolvedLanguage ?? i18n.language;
  const [templates, setTemplates] = useState<DbTemplate[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeAccountId) return;
    getTemplatesForAccount(activeAccountId).then(setTemplates);
  }, [activeAccountId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handleSelect = useCallback((tmpl: DbTemplate) => {
    if (!editor) return;
    const account = accounts.find((a) => a.email === fromEmail)
      ?? accounts.find((a) => a.id === activeAccountId);

    // If new message and subject is empty, use template subject
    if (mode === "new" && !subject && tmpl.subject) {
      setSubject(tmpl.subject);
    }

    // Insert template body at cursor
    interpolateVariables(tmpl.body_html, {
      recipientEmail: to[0],
      senderEmail: account?.email,
      senderName: account?.displayName ?? undefined,
      subject: subject || tmpl.subject || undefined,
    }, templateLocale).then((resolved) => {
      editor.commands.insertContent(resolved);
    });
    setIsOpen(false);
  }, [accounts, activeAccountId, editor, fromEmail, mode, subject, setSubject, templateLocale, to]);

  if (templates.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <FileText size={12} />
        {t("templates.label")}
        <ChevronDown size={10} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-1 left-0 bg-bg-primary border border-border-primary rounded-md shadow-lg glass-modal w-56 max-h-48 overflow-y-auto z-10">
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => handleSelect(tmpl)}
              className="w-full text-left px-3 py-2 hover:bg-bg-hover text-sm transition-colors"
            >
              <div className="text-text-primary text-xs font-medium">{tmpl.name}</div>
              {tmpl.subject && (
                <div className="text-text-tertiary text-[0.625rem] truncate">{tmpl.subject}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
