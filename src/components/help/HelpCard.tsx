import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { navigateToSettings } from "@/router/navigate";
import type { HelpCard as HelpCardData } from "@/constants/helpContent";

interface HelpCardProps {
  card: HelpCardData;
  isExpanded: boolean;
  onToggle: () => void;
}

export function HelpCard({ card, isExpanded, onToggle }: HelpCardProps) {
  const { t } = useTranslation("help");
  const Icon = card.icon;

  return (
    <div className="rounded-lg border border-border-secondary bg-bg-primary/60 overflow-hidden transition-colors hover:border-border-primary">
      {/* Collapsed header: icon + title + summary + chevron */}
      <button
        onClick={onToggle}
        className="flex items-center gap-3 w-full px-4 py-3 text-left cursor-pointer"
      >
        <div className="w-8 h-8 rounded-md bg-accent/10 text-accent flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary">{t(card.title)}</h3>
          <p className="text-xs text-text-tertiary mt-0.5 truncate">{t(card.summary)}</p>
        </div>
        <ChevronRight
          size={14}
          className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {/* Expanded body: description + tips + settings link */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 ml-11 border-t border-border-secondary/50 pt-3 space-y-3">
            <p className="text-xs text-text-secondary leading-relaxed">
              {t(card.description)}
            </p>

            {card.tips && card.tips.length > 0 && (
              <ul className="space-y-1.5">
                {card.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                    <span className="text-text-tertiary mt-0.5 shrink-0">•</span>
                    <span className="flex-1">{t(tip.text)}</span>
                    {tip.shortcut && (
                      <kbd className="shrink-0 px-1.5 py-0.5 text-[0.625rem] bg-bg-secondary border border-border-secondary rounded text-text-tertiary font-mono">
                        {tip.shortcut}
                      </kbd>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {card.relatedSettingsTab && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToSettings(card.relatedSettingsTab!);
                }}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                {t("openInSettings")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
