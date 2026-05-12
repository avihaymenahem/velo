import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Eye, User } from "lucide-react";
import { getAllContacts, type DbContact } from "@/services/db/contacts";
import { escapeHtml } from "@/utils/sanitize";

interface TemplateVariablePreviewProps {
  templateHtml: string | null;
  accountId: string | null;
}

export function TemplateVariablePreview({ templateHtml, accountId }: TemplateVariablePreviewProps) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<DbContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<DbContact | null>(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!accountId) return;
    getAllContacts(10).then((all) => {
      setContacts(all);
      setSelectedContact(all[0] ?? null);
    });
  }, [accountId]);

  const resolvePreview = useCallback((html: string, contact: DbContact | null): string => {
    const displayName = contact?.display_name ?? "";
    const firstName = displayName.split(/\s+/)[0] ?? contact?.email.split("@")[0] ?? "";
    const email = contact?.email ?? "";
    const company = email.includes("@") ? email.split("@")[1]?.split(".")[0] ?? "" : "";

    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      month: "long", day: "numeric", year: "numeric",
    });
    const dateLongStr = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
    const dayStr = now.toLocaleDateString(undefined, { weekday: "long" });

    const replacements: Record<string, string> = {
      "{{first_name}}": firstName || "John",
      "{{last_name}}": (displayName.split(/\s+/).slice(1).join(" ")) || "Doe",
      "{{email}}": email || "contact@example.com",
      "{{display_name}}": displayName || "John Doe",
      "{{company}}": company || "Acme",
      "{{my_name}}": "You",
      "{{my_title}}": "CEO",
      "{{my_phone}}": "+1-555-0100",
      "{{date}}": dateStr,
      "{{date_long}}": dateLongStr,
      "{{day_of_week}}": dayStr,
      "{{random_greeting}}": "Hello",
      "{{subject}}": "Your Subject Here",
    };

    let result = html;
    const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    result = result.replace(ifRegex, (_m, varName, ifBlock, elseBlock) => {
      const value = replacements[varName];
      if (value && value.trim().length > 0) return ifBlock ?? "";
      return elseBlock ?? "";
    });

    for (const [key, value] of Object.entries(replacements)) {
      result = result.replaceAll(key, escapeHtml(value));
    }

    return result;
  }, []);

  useEffect(() => {
    if (!templateHtml) {
      setPreview("");
      return;
    }
    setPreview(resolvePreview(templateHtml, selectedContact));
  }, [templateHtml, selectedContact, resolvePreview]);

  if (!templateHtml) return null;

  return (
    <div className="border-t border-border-secondary bg-bg-secondary/50 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Eye size={12} />
          {t("composer.templatePreview")}
        </div>
        <div className="flex items-center gap-1.5">
          <User size={10} className="text-text-tertiary" />
          <select
            value={selectedContact?.id ?? ""}
            onChange={(e) => {
              const c = contacts.find((c) => c.id === e.target.value);
              setSelectedContact(c ?? null);
            }}
            className="text-[0.625rem] bg-bg-tertiary border border-border-primary rounded px-1.5 py-0.5 text-text-secondary outline-none focus:border-accent max-w-[140px]"
          >
            {contacts.length === 0 && <option value="">{t("composer.noContacts")}</option>}
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name ?? c.email}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="text-xs text-text-secondary prose prose-sm max-w-none line-clamp-2"
        dangerouslySetInnerHTML={{ __html: preview }}
      />
    </div>
  );
}
