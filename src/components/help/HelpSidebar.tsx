import { useTranslation } from "react-i18next";
import { HELP_CATEGORIES } from "@/constants/helpContent";
import { navigateToHelp } from "@/router/navigate";

interface HelpSidebarProps {
  activeTopic: string;
}

export function HelpSidebar({ activeTopic }: HelpSidebarProps) {
  const { t } = useTranslation("help");

  return (
    <nav className="w-48 border-r border-border-primary py-2 overflow-y-auto shrink-0 bg-bg-primary/30">
      {HELP_CATEGORIES.map((category) => {
        const Icon = category.icon;
        const isActive = activeTopic === category.id;
        return (
          <button
            key={category.id}
            onClick={() => navigateToHelp(category.id)}
            className={`flex items-start gap-2.5 w-full px-4 py-2 text-[0.8125rem] text-left transition-colors ${
              isActive
                ? "bg-bg-selected text-accent font-medium"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            }`}
          >
            <Icon size={15} className="shrink-0 mt-0.5" />
            <span>{t(category.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
