import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";

interface HelpSearchBarProps {
  query: string;
  onChange: (query: string) => void;
}

export function HelpSearchBar({ query, onChange }: HelpSearchBarProps) {
  const { t } = useTranslation();
  return (
    <div className="relative mb-5">
      <Search
        size={15}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("help.searchPlaceholder")}
        className="w-full pl-9 pr-9 py-2 text-sm rounded-lg bg-bg-secondary border border-border-secondary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
      />
      {query && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
